import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'

/**
 * A studio's page: the studios the signed-in account acts for, and gifting Credits to players out of a studio's
 * budget (credits-server `/operator/studios`).
 *
 * Every gift carries an idempotency key that is made once per row and kept, with the row, in this browser until
 * the server has settled it. Sending a row again (after a lost answer, a reload, or the next day) sends the same
 * key, and the server answers a key it already used with the gift it already made instead of making a second one.
 */

/** 1 Credit is worth 10 US cents. */
const CENTS_PER_CREDIT = 10
const ACCOUNT_PATTERN = /^0x[0-9a-fA-F]{40}$/
const WHOLE_CREDITS_PATTERN = /^[1-9]\d*$/
/** Control and invisible format characters: the server refuses them in a reason, which is shown on one line. */
const NOT_ONE_PRINTABLE_LINE = /[\p{Cc}\p{Cf}]/u
export const MAX_REASON_LENGTH = 80

export type OperatorStudio = {
  id: string
  name: string
  status: 'active' | 'paused'
  balanceCents: number
  grantedCents: number
  grantCount: number
}

export type StudioGift = {
  creditId: string
  recipient: string
  usdCents: number
  reason: string | null
  grantedBy: string
  createdAt: number
}

/** The most a single gift may give, in cents; null while gifts are not configured on the server. */
export type GiftLimits = { maxGrantCents: number | null }

/** The server refused the request and said why (`code`). */
export class StudioRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'StudioRequestError'
  }
}

/** A gift got no answer, or a server failure that does not say what it refused: it may or may not have been made. */
export class StudioUnknownResultError extends Error {
  constructor() {
    super('No confirmation from the server')
    this.name = 'StudioUnknownResultError'
  }
}

async function send(
  path: string,
  identity: AuthIdentity,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; body: unknown }> {
  const method = init.method ?? 'GET'
  let res: Response
  try {
    res = await signedFetch(`${config.creditsServerUrl}${path}`, {
      method,
      identity,
      metadata: {},
      ...(init.body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
        : {})
    })
  } catch (error) {
    if (method !== 'GET') throw new StudioUnknownResultError()
    throw error
  }

  // Read once as text: an empty or unreadable body must not turn a gift that was made into a failure.
  const text = await res.text().catch(() => '')
  let body: unknown
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }

  if (!res.ok) {
    const answer = (body ?? {}) as { error?: unknown; code?: unknown }
    const code = typeof answer.code === 'string' ? answer.code : undefined
    const message = typeof answer.error === 'string' ? answer.error : `HTTP ${res.status}`
    if (code) throw new StudioRequestError(message, res.status, code)
    if (method !== 'GET' && res.status >= 500) throw new StudioUnknownResultError()
    throw new StudioRequestError(message, res.status)
  }
  return { status: res.status, body }
}

/** The studios the signed-in account acts for (none for most accounts), and the most one gift may give. */
export async function getMyStudios(identity: AuthIdentity): Promise<{ studios: OperatorStudio[]; limits: GiftLimits }> {
  const { body } = await send('/operator/studios', identity)
  const answer = body as { studios?: OperatorStudio[]; grantLimits?: GiftLimits } | undefined
  return { studios: answer?.studios ?? [], limits: answer?.grantLimits ?? { maxGrantCents: null } }
}

/** One of the account's studios, a page of its gifts (newest first) and the most one gift may give. */
export async function getMyStudio(
  studioId: string,
  identity: AuthIdentity,
  page: { limit: number; offset: number }
): Promise<{ studio: OperatorStudio; gifts: StudioGift[]; total: number; limits: GiftLimits }> {
  const query = new URLSearchParams({ limit: String(page.limit), offset: String(page.offset) })
  const { body } = await send(`/operator/studios/${encodeURIComponent(studioId)}?${query.toString()}`, identity)
  const answer = body as {
    studio: OperatorStudio
    grants: StudioGift[]
    page: { total: number }
    grantLimits?: GiftLimits
  }
  return {
    studio: answer.studio,
    gifts: answer.grants,
    total: answer.page.total,
    limits: answer.grantLimits ?? { maxGrantCents: null }
  }
}

export type GiftResult = { replayed: boolean }

/** Gifts a player Credits out of the studio's budget. A 200 answers a key that had already made this gift. */
export async function giftFromStudio(
  studioId: string,
  gift: { account: string; credits: number; reason: string; key: string },
  identity: AuthIdentity
): Promise<GiftResult> {
  const { status, body } = await send(`/operator/studios/${encodeURIComponent(studioId)}/grants`, identity, {
    method: 'POST',
    body: { address: gift.account, credits: gift.credits, reason: gift.reason, idempotencyKey: gift.key }
  })
  return { replayed: (body as { replayed?: boolean } | undefined)?.replayed ?? status === 200 }
}

/**
 * Where a row of a gift batch stands.
 * - `pending`: not sent yet.
 * - `gifted` / `alreadyGifted`: done; `alreadyGifted` means its key had already made the gift (a resumed batch).
 * - `refused`: the server refused it for something about this row (the player, the amount): final.
 * - `blocked`: refused for something about the studio (paused, out of budget): sent again when the batch resumes.
 * - `unknown`: no confirmation came back; it may have been made. Sent again, with the same key, on resume.
 * - `notSent`: the batch stopped before it.
 */
export type GiftRowStatus = 'pending' | 'gifted' | 'alreadyGifted' | 'refused' | 'blocked' | 'unknown' | 'notSent'

export type GiftRow = {
  /** Also the row's idempotency key: made once when the batch is created and kept until the batch is done. */
  key: string
  account: string
  credits: number
  reason: string
  status: GiftRowStatus
  /** Why the row ended where it did: a server refusal code, `unknown` or `unrecognized`. */
  code?: string
}

const RETRYABLE: GiftRowStatus[] = ['pending', 'blocked', 'unknown', 'notSent']

export const isRetryable = (row: GiftRow): boolean => RETRYABLE.includes(row.status)

/** Refusals about the studio itself: every remaining row would get the same answer, so the batch stops. */
export const STUDIO_STOP_CODES = [
  'STUDIO_PAUSED',
  'STUDIO_BUDGET_EXCEEDED',
  'STUDIO_NOT_FOUND',
  'USD_CREDITS_DISABLED',
  'GRANTS_NOT_CONFIGURED'
]

/** Refusals about one row (its player or its amount): the batch carries on with the next one. */
export const ROW_REFUSAL_CODES = [
  'STUDIO_OPERATOR',
  'FLAGGED_WALLET',
  'GRANT_LIMIT_EXCEEDED',
  'IDEMPOTENCY_KEY_REUSED',
  'INVALID_REQUEST'
]

export type DraftRow = { account: string; credits: string; reason: string }

/**
 * Rows pasted from a list or a spreadsheet: one per line, `account, credits[, reason]`, separated by tabs, commas
 * or semicolons. A first line that does not start with an account is a header and is skipped. Values are kept as
 * typed so {@link validateRows} can point at a bad cell instead of dropping the row.
 */
export function parsePastedRows(text: string): { rows: DraftRow[]; badLines: number[] } {
  const rows: DraftRow[] = []
  const badLines: number[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const cells = line.split(/\t|;|,/).map(cell =>
      cell
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .trim()
    )
    if (index === 0 && !/^0x/i.test(cells[0] ?? '')) return
    if (cells.length < 2) {
      badLines.push(index + 1)
      return
    }
    rows.push({ account: cells[0], credits: cells[1], reason: cells.slice(2).join(', ') })
  })
  return { rows, badLines }
}

/** Why a row cannot be sent as it is. `duplicateOf` is the 1-based row the account first appeared in. */
export type RowProblem =
  | { code: 'account' }
  | { code: 'duplicate'; duplicateOf: number }
  | { code: 'credits' }
  | { code: 'overMax'; maxCredits: number }
  | { code: 'reasonMissing' }
  | { code: 'reasonTooLong' }
  | { code: 'reasonOneLine' }

export type BatchProblem = { code: 'empty' } | { code: 'notConfigured' } | { code: 'overBudget'; totalCredits: number }

/**
 * What stands between these rows and a batch. A row may leave its reason blank to use the shared one. An account
 * may appear once: two rows for the same player are almost always a mistake, and one row with the sum says the
 * same thing.
 */
export function validateRows(
  rows: DraftRow[],
  limits: { sharedReason: string; maxGrantCents: number | null; balanceCents: number }
): { rowProblems: (RowProblem | null)[]; batchProblems: BatchProblem[]; totalCredits: number } {
  const seen = new Map<string, number>()
  let totalCredits = 0
  const rowProblems = rows.map((row, index): RowProblem | null => {
    const account = row.account.trim()
    const reason = row.reason.trim() || limits.sharedReason.trim()
    if (!ACCOUNT_PATTERN.test(account)) return { code: 'account' }
    const first = seen.get(account.toLowerCase())
    if (first !== undefined) return { code: 'duplicate', duplicateOf: first + 1 }
    seen.set(account.toLowerCase(), index)
    if (!WHOLE_CREDITS_PATTERN.test(row.credits.trim())) return { code: 'credits' }
    const credits = Number(row.credits.trim())
    if (!Number.isSafeInteger(credits * CENTS_PER_CREDIT)) return { code: 'credits' }
    if (limits.maxGrantCents !== null && credits * CENTS_PER_CREDIT > limits.maxGrantCents) {
      return { code: 'overMax', maxCredits: limits.maxGrantCents / CENTS_PER_CREDIT }
    }
    if (!reason) return { code: 'reasonMissing' }
    if (reason.length > MAX_REASON_LENGTH) return { code: 'reasonTooLong' }
    if (NOT_ONE_PRINTABLE_LINE.test(reason)) return { code: 'reasonOneLine' }
    totalCredits += credits
    return null
  })

  const batchProblems: BatchProblem[] = []
  if (rows.length === 0) batchProblems.push({ code: 'empty' })
  if (limits.maxGrantCents === null) batchProblems.push({ code: 'notConfigured' })
  if (totalCredits * CENTS_PER_CREDIT > limits.balanceCents) batchProblems.push({ code: 'overBudget', totalCredits })
  return { rowProblems, batchProblems, totalCredits }
}

/**
 * Rows that repeat a recent gift of this studio: same player, same Credits, same reason. Shown before a batch is
 * confirmed, because the same gift twice is usually a list sent again by mistake.
 */
export function findLikelyRepeats(
  rows: Array<{ account: string; credits: number; reason: string }>,
  recentGifts: StudioGift[],
  options: { nowMs: number; windowDays?: number }
): Array<{ account: string; credits: number; giftedAt: number }> {
  const since = options.nowMs - (options.windowDays ?? 30) * 86_400_000
  const recent = recentGifts.filter(gift => gift.createdAt >= since)
  const repeats: Array<{ account: string; credits: number; giftedAt: number }> = []
  for (const row of rows) {
    const match = recent.find(
      gift =>
        gift.recipient.toLowerCase() === row.account.toLowerCase() &&
        gift.usdCents === row.credits * CENTS_PER_CREDIT &&
        (gift.reason ?? '') === row.reason
    )
    if (match) repeats.push({ account: row.account, credits: row.credits, giftedAt: match.createdAt })
  }
  return repeats
}

export type GiftOutcome = { status: GiftRowStatus; stopsBatch: boolean; code?: string }

/**
 * What one gift's outcome means for its row and for the batch. Anything not recognised stops the batch: an
 * unexplained refusal would most likely refuse every remaining row the same way.
 */
export function classifyGiftOutcome(outcome: { result: GiftResult } | { error: unknown }): GiftOutcome {
  if ('result' in outcome) {
    return outcome.result.replayed
      ? { status: 'alreadyGifted', stopsBatch: false }
      : { status: 'gifted', stopsBatch: false }
  }
  const { error } = outcome
  if (error instanceof StudioUnknownResultError) return { status: 'unknown', stopsBatch: true, code: 'unknown' }
  if (error instanceof StudioRequestError && error.code) {
    if (ROW_REFUSAL_CODES.includes(error.code)) return { status: 'refused', stopsBatch: false, code: error.code }
    if (STUDIO_STOP_CODES.includes(error.code)) return { status: 'blocked', stopsBatch: true, code: error.code }
  }
  return { status: 'blocked', stopsBatch: true, code: 'unrecognized' }
}

/**
 * Sends every retryable row of a batch, in order, one at a time, reporting each change through `onChange` before
 * the next row is sent. Rows already gifted or refused are left alone, so running a batch again resumes it.
 * Stops at the first outcome that would repeat for every remaining row; the rows after it are marked `notSent`.
 */
export async function runGiftBatch(
  rows: GiftRow[],
  gift: (row: GiftRow) => Promise<GiftResult>,
  onChange: (rows: GiftRow[]) => void
): Promise<{ rows: GiftRow[]; stoppedBy?: string }> {
  let current = rows.map(row => ({ ...row }))
  for (let index = 0; index < current.length; index++) {
    if (!isRetryable(current[index])) continue
    let outcome: GiftOutcome
    try {
      outcome = classifyGiftOutcome({ result: await gift(current[index]) })
    } catch (error) {
      outcome = classifyGiftOutcome({ error })
    }
    current = current.map((row, i) => (i === index ? { ...row, status: outcome.status, code: outcome.code } : row))
    if (outcome.stopsBatch) {
      current = current.map((row, i) =>
        i > index && isRetryable(row) ? { ...row, status: 'notSent', code: undefined } : row
      )
      onChange(current)
      return { rows: current, stoppedBy: outcome.code }
    }
    onChange(current)
  }
  return { rows: current }
}

/** A new batch from validated rows: each row gets its own idempotency key, kept for the life of the batch. */
export function createGiftRows(
  rows: DraftRow[],
  sharedReason: string,
  newKey: () => string = () => crypto.randomUUID()
): GiftRow[] {
  return rows.map(row => ({
    key: newKey(),
    account: row.account.trim().toLowerCase(),
    credits: Number(row.credits.trim()),
    reason: row.reason.trim() || sharedReason.trim(),
    status: 'pending' as const
  }))
}

/** A batch whose rows are not all settled yet, kept in this browser until they are. */
export type PendingBatch = { studioId: string; rows: GiftRow[]; createdAt: number }

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const pendingKey = (account: string, studioId: string) =>
  `shop.studio.pendingGifts.${account.toLowerCase()}.${studioId}`

function browserStore(): KeyValueStore | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** The account's unfinished batch for a studio, if this browser has one. */
export function readPendingBatch(
  account: string,
  studioId: string,
  store: KeyValueStore | undefined = browserStore()
): PendingBatch | null {
  try {
    const raw = store?.getItem(pendingKey(account, studioId))
    return raw ? (JSON.parse(raw) as PendingBatch) : null
  } catch {
    return null
  }
}

/** Saves a batch, or forgets it (`null`). Never throws: losing the copy only loses recovery after a reload. */
export function writePendingBatch(
  account: string,
  studioId: string,
  batch: PendingBatch | null,
  store: KeyValueStore | undefined = browserStore()
): void {
  try {
    if (batch) store?.setItem(pendingKey(account, studioId), JSON.stringify(batch))
    else store?.removeItem(pendingKey(account, studioId))
  } catch {
    // Storage full or blocked: the batch still runs.
  }
}
