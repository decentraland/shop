import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import { USD_CENTS_PER_CREDIT } from '~/lib/currency'

/**
 * A studio's page: the studios the signed-in account acts for, and gifting Credits to players out of a studio's
 * budget (credits-server `/operator/studios`).
 *
 * Every gift carries an idempotency key that is made once per row and kept, with the row, in this browser until
 * the server has settled it. Sending a row again (after a lost answer, a reload, or the next day) sends the same
 * key, and the server answers a key it already used with the gift it already made instead of making a second one.
 */

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

/** The server asked to slow down before it looked at the gift: nothing was made, and it can be sent again shortly. */
export class StudioRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Too many gifts at once: try again in ${retryAfterSeconds}s`)
    this.name = 'StudioRateLimitedError'
  }
}

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
  'RECIPIENT_NOT_ELIGIBLE',
  'GRANT_LIMIT_EXCEEDED',
  'IDEMPOTENCY_KEY_REUSED',
  'INVALID_REQUEST'
]

/**
 * The codes the server refuses a gift with once it has judged it, its key included: each says no gift was made.
 * `INTERNAL_ERROR` is not one of them (it is sent for any failure, a gift whose answer was lost among them), nor is
 * a code this page does not know.
 */
const SETTLED_REFUSAL_CODES = [...STUDIO_STOP_CODES, ...ROW_REFUSAL_CODES]

const DEFAULT_RETRY_AFTER_SECONDS = 10

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
    const answer = (body ?? {}) as { error?: unknown; code?: unknown; retryAfterSeconds?: unknown }
    const code = typeof answer.code === 'string' ? answer.code : undefined
    const message = typeof answer.error === 'string' ? answer.error : `HTTP ${res.status}`
    if (method !== 'GET') {
      if (res.status === 429) {
        const seconds = Number(answer.retryAfterSeconds ?? res.headers.get('Retry-After'))
        throw new StudioRateLimitedError(
          Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS
        )
      }
      if (code && SETTLED_REFUSAL_CODES.includes(code)) throw new StudioRequestError(message, res.status, code)
      if (code || res.status >= 500) throw new StudioUnknownResultError()
      // No code: turned away before the server looked at the gift (a session that expired, say). Nothing was made.
      throw new StudioRequestError(message, res.status)
    }
    throw new StudioRequestError(message, res.status, code)
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

/**
 * Gifts a player Credits out of the studio's budget. The server says on every success whether the key had already
 * made this gift (`replayed`); only when the answer cannot be read does the status say it (200 a repeat, 201 new).
 */
export async function giftFromStudio(
  studioId: string,
  gift: { account: string; credits: number; reason: string; key: string },
  identity: AuthIdentity
): Promise<GiftResult> {
  const { status, body } = await send(`/operator/studios/${encodeURIComponent(studioId)}/grants`, identity, {
    method: 'POST',
    body: { address: gift.account, credits: gift.credits, reason: gift.reason, idempotencyKey: gift.key }
  })
  if (body === undefined) return { replayed: status === 200 }
  return { replayed: (body as { replayed?: unknown }).replayed === true }
}

/**
 * Where a row of a gift batch stands.
 * - `pending`: not sent yet.
 * - `gifted` / `alreadyGifted`: done; `alreadyGifted` means its key had already made the gift (a resumed batch).
 * - `refused`: the server refused it for something about this row (the player, the amount): final.
 * - `blocked`: refused for something about the studio (paused, out of budget): sent again when the batch resumes.
 * - `unknown`: no confirmation came back; it may have been made. Sent again, with the same key, on resume.
 * - `notSent`: the batch stopped before it, or the page was left while it ran.
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

export type DraftRow = { account: string; credits: string; reason: string }

/** A pasted line's first cell, when it is an account: what follows it says which separator the paste uses. */
const LEADING_ACCOUNT = /^\s*"?0x[0-9a-fA-F]{40}"?\s*([\t,;])/
const NUMBER_LIKE = /^[\d.,\s]+$/

/**
 * One separator for the whole paste. The one right after the first account wins; otherwise a tab (a spreadsheet's
 * columns), then a semicolon, then a comma. Splitting on all three at once would cut a grouped number such as
 * `1,000` copied from a spreadsheet into two cells.
 */
function pasteSeparator(lines: string[]): string {
  for (const line of lines) {
    const match = LEADING_ACCOUNT.exec(line)
    if (match) return match[1]
  }
  const text = lines.join('\n')
  if (text.includes('\t')) return '\t'
  if (text.includes(';')) return ';'
  return ','
}

/** A line split on `separator`, CSV-style: a cell in double quotes may hold the separator, and `""` is one quote. */
function splitCells(line: string, separator: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      if (char !== '"') cell += char
      else if (line[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (char === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (char === separator) {
      cells.push(cell.trim())
      cell = ''
    } else cell += char
  }
  cells.push(cell.trim())
  return cells
}

export type PastedRows = {
  rows: DraftRow[]
  /** 1-based lines with no account and Credits to read. */
  badLines: number[]
  /** 1-based lines whose Credits may be a number with a thousands separator split in two (`1,000`): not added. */
  ambiguousLines: number[]
  /** The first line, when it was read as column names and skipped. */
  header?: string
}

/**
 * Rows pasted from a list or a spreadsheet: one per line, `account, credits[, reason]`, with one separator for the
 * whole paste (tab, semicolon or comma, see {@link pasteSeparator}). The first line is skipped as column names only
 * when it holds neither an account nor a number where the Credits go, and the caller is told. Values are kept as
 * typed so {@link validateRows} can point at a bad cell instead of dropping the row.
 */
export function parsePastedRows(text: string): PastedRows {
  const lines = text.split(/\r?\n/)
  const separator = pasteSeparator(lines)
  const result: PastedRows = { rows: [], badLines: [], ambiguousLines: [] }
  let first = true
  lines.forEach((line, index) => {
    if (!line.trim()) return
    const cells = splitCells(line, separator)
    const isFirst = first
    first = false
    if (isFirst && !/^0x/i.test(cells[0] ?? '') && !NUMBER_LIKE.test(cells[1] ?? '')) {
      result.header = line.trim()
      return
    }
    if (cells.length < 2 || !cells[1]) {
      result.badLines.push(index + 1)
      return
    }
    // `0x…, 1,000, Welcome` split on commas reads as 1 Credit for the reason "000, Welcome". It cannot be told
    // apart from a reason that happens to be three digits, so the line is not added and the operator is asked.
    if (separator === ',' && /^\d{1,3}$/.test(cells[1]) && /^\d{3}$/.test(cells[2] ?? '')) {
      result.ambiguousLines.push(index + 1)
      return
    }
    result.rows.push({
      account: cells[0],
      credits: cells[1],
      reason: cells.slice(2).join(separator === '\t' ? ' ' : `${separator} `)
    })
  })
  return result
}

/** A row nothing was typed in, such as the one "Add player" leaves: ignored rather than counted or checked. */
export const isBlankRow = (row: DraftRow): boolean => !row.account.trim() && !row.credits.trim() && !row.reason.trim()

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
 * What stands between these rows and a batch. A row may leave its reason blank to use the shared one; a row left
 * entirely blank is ignored. An account may appear once: two rows for the same player are almost always a mistake,
 * and one row with the sum says the same thing.
 */
export function validateRows(
  rows: DraftRow[],
  limits: { sharedReason: string; maxGrantCents: number | null; balanceCents: number }
): { rowProblems: (RowProblem | null)[]; batchProblems: BatchProblem[]; totalCredits: number } {
  const seen = new Map<string, number>()
  let totalCredits = 0
  const rowProblems = rows.map((row, index): RowProblem | null => {
    if (isBlankRow(row)) return null
    const account = row.account.trim()
    const reason = row.reason.trim() || limits.sharedReason.trim()
    if (!ACCOUNT_PATTERN.test(account)) return { code: 'account' }
    const first = seen.get(account.toLowerCase())
    if (first !== undefined) return { code: 'duplicate', duplicateOf: first + 1 }
    seen.set(account.toLowerCase(), index)
    if (!WHOLE_CREDITS_PATTERN.test(row.credits.trim())) return { code: 'credits' }
    const credits = Number(row.credits.trim())
    if (!Number.isSafeInteger(credits * USD_CENTS_PER_CREDIT)) return { code: 'credits' }
    if (limits.maxGrantCents !== null && credits * USD_CENTS_PER_CREDIT > limits.maxGrantCents) {
      return { code: 'overMax', maxCredits: limits.maxGrantCents / USD_CENTS_PER_CREDIT }
    }
    if (!reason) return { code: 'reasonMissing' }
    if (reason.length > MAX_REASON_LENGTH) return { code: 'reasonTooLong' }
    if (NOT_ONE_PRINTABLE_LINE.test(reason)) return { code: 'reasonOneLine' }
    totalCredits += credits
    return null
  })

  const batchProblems: BatchProblem[] = []
  if (rows.every(isBlankRow)) batchProblems.push({ code: 'empty' })
  if (limits.maxGrantCents === null) batchProblems.push({ code: 'notConfigured' })
  if (totalCredits * USD_CENTS_PER_CREDIT > limits.balanceCents) {
    batchProblems.push({ code: 'overBudget', totalCredits })
  }
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
        gift.usdCents === row.credits * USD_CENTS_PER_CREDIT &&
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

export type RunOptions = {
  /** Asked before each row: true stops the batch there, as if it had been stopped by a refusal. */
  shouldStop?: () => boolean
  /** Told how long the batch waits when the server asks it to slow down. */
  onWait?: (seconds: number) => void
  /** How the batch waits; a test hands in one that does not. */
  wait?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Sends every retryable row of a batch, in order, one at a time, reporting each change through `onChange` before
 * the next row is sent. Rows already gifted or refused are left alone, so running a batch again resumes it.
 * Stops at the first outcome that would repeat for every remaining row, or when `shouldStop` says so (code
 * `interrupted`); the rows after it are marked `notSent`. When the server asks to slow down, the batch waits as long
 * as it says and sends the same row again: nothing was made, and its key would answer for it if it had been.
 */
export async function runGiftBatch(
  rows: GiftRow[],
  gift: (row: GiftRow) => Promise<GiftResult>,
  onChange: (rows: GiftRow[]) => void,
  options: RunOptions = {}
): Promise<{ rows: GiftRow[]; stoppedBy?: string }> {
  const { shouldStop = () => false, onWait, wait = sleep } = options
  let current = rows.map(row => ({ ...row }))
  const stopAt = (index: number, code: string) => {
    current = current.map((row, i) =>
      i >= index && isRetryable(row) ? { ...row, status: 'notSent', code: undefined } : row
    )
    onChange(current)
    return { rows: current, stoppedBy: code }
  }
  for (let index = 0; index < current.length; index++) {
    if (!isRetryable(current[index])) continue
    if (shouldStop()) return stopAt(index, 'interrupted')
    let outcome: GiftOutcome
    try {
      outcome = classifyGiftOutcome({ result: await gift(current[index]) })
    } catch (error) {
      if (error instanceof StudioRateLimitedError) {
        onWait?.(error.retryAfterSeconds)
        await wait(error.retryAfterSeconds * 1000)
        index--
        continue
      }
      outcome = classifyGiftOutcome({ error })
    }
    current = current.map((row, i) => (i === index ? { ...row, status: outcome.status, code: outcome.code } : row))
    if (outcome.stopsBatch) return stopAt(index + 1, outcome.code ?? 'unrecognized')
    onChange(current)
  }
  return { rows: current }
}

/**
 * The batches this tab is sending, by account and studio. A batch keeps running when its dialog closes or the page
 * changes, so this is what stops a second run over the same rows from starting while the first one is still going:
 * the two would send the same keys and overwrite each other's saved progress.
 */
const runningBatches = new Map<string, { stop: () => void; done: Promise<unknown> }>()

const batchId = (account: string, studioId: string) => `${account.toLowerCase()}.${studioId}`

export const isBatchRunning = (account: string, studioId: string): boolean =>
  runningBatches.has(batchId(account, studioId))

/** Asks a running batch to stop before its next row; resolves once it has (at once when none is running). */
export async function stopBatch(account: string, studioId: string): Promise<void> {
  const running = runningBatches.get(batchId(account, studioId))
  if (!running) return
  running.stop()
  await running.done
}

/** Resolves once no batch is running for this account and studio in this tab. */
export async function batchSettled(account: string, studioId: string): Promise<void> {
  await runningBatches.get(batchId(account, studioId))?.done
}

/**
 * {@link runGiftBatch}, registered as this tab's run for the account and studio. A run already going there is let
 * end first, and only then are the rows read with `load`: what it saved is where this one starts, never an older
 * copy. Null when `load` finds nothing to send.
 */
export async function startGiftBatch(
  account: string,
  studioId: string,
  load: () => GiftRow[] | null,
  gift: (row: GiftRow) => Promise<GiftResult>,
  onChange: (rows: GiftRow[]) => void,
  options: Omit<RunOptions, 'shouldStop'> = {}
): Promise<{ rows: GiftRow[]; stoppedBy?: string } | null> {
  const id = batchId(account, studioId)
  // Checked and taken with nothing awaited in between, so two calls at once still run one after the other.
  for (let running = runningBatches.get(id); running; running = runningBatches.get(id)) await running.done
  let stopped = false
  let finish: () => void = () => undefined
  runningBatches.set(id, { stop: () => (stopped = true), done: new Promise<void>(resolve => (finish = resolve)) })
  try {
    const rows = load()
    if (!rows || !rows.some(isRetryable)) return null
    return await runGiftBatch(rows, gift, onChange, { ...options, shouldStop: () => stopped })
  } finally {
    runningBatches.delete(id)
    finish()
  }
}

/** A new batch from validated rows: each row gets its own idempotency key, kept for the life of the batch. */
export function createGiftRows(
  rows: DraftRow[],
  sharedReason: string,
  newKey: () => string = () => crypto.randomUUID()
): GiftRow[] {
  return rows
    .filter(row => !isBlankRow(row))
    .map(row => ({
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

const GIFT_ROW_STATUSES: GiftRowStatus[] = [
  'pending',
  'gifted',
  'alreadyGifted',
  'refused',
  'blocked',
  'unknown',
  'notSent'
]

/** What a saved batch must look like to be resumed. Anything else (an older format, an edited entry) is ignored. */
function isPendingBatch(value: unknown): value is PendingBatch {
  if (typeof value !== 'object' || value === null) return false
  const { studioId, rows, createdAt } = value as Record<string, unknown>
  return (
    typeof studioId === 'string' &&
    typeof createdAt === 'number' &&
    Array.isArray(rows) &&
    rows.every(row => {
      if (typeof row !== 'object' || row === null) return false
      const { key, account, credits, reason, status } = row as Record<string, unknown>
      return (
        typeof key === 'string' &&
        key.length > 0 &&
        typeof account === 'string' &&
        typeof credits === 'number' &&
        Number.isSafeInteger(credits) &&
        typeof reason === 'string' &&
        GIFT_ROW_STATUSES.includes(status as GiftRowStatus)
      )
    })
  )
}

/** The account's batch for a studio as this browser saved it, if it has one, settled or not. */
export function readPendingBatch(
  account: string,
  studioId: string,
  store: KeyValueStore | undefined = browserStore()
): PendingBatch | null {
  try {
    const raw = store?.getItem(pendingKey(account, studioId))
    const batch: unknown = raw ? JSON.parse(raw) : null
    return isPendingBatch(batch) ? batch : null
  } catch {
    return null
  }
}

/**
 * The account's unfinished batch for a studio: one with rows still to send or confirm. A batch whose rows are all
 * settled is done, whether or not its results were closed, so it is forgotten here.
 */
export function readUnfinishedBatch(
  account: string,
  studioId: string,
  store: KeyValueStore | undefined = browserStore()
): PendingBatch | null {
  const batch = readPendingBatch(account, studioId, store)
  if (batch && !batch.rows.some(isRetryable)) {
    writePendingBatch(account, studioId, null, store)
    return null
  }
  return batch
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
