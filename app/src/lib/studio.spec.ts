import { beforeEach, describe, expect, it, vi } from 'vitest'
import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import {
  classifyGiftOutcome,
  createGiftRows,
  findLikelyRepeats,
  getMyStudios,
  giftFromStudio,
  isBatchRunning,
  isSameBatch,
  MAX_SLOW_DOWNS_PER_GIFT,
  parsePastedRows,
  parseTypedTotal,
  readPendingBatch,
  readUnfinishedBatch,
  ROW_REFUSAL_CODES,
  runGiftBatch,
  saveBatchProgress,
  startGiftBatch,
  uniqueGifts,
  stopBatch,
  STUDIO_STOP_CODES,
  StudioRateLimitedError,
  StudioRequestError,
  StudioUnknownResultError,
  validateRows,
  writePendingBatch,
  type GiftResult,
  type GiftRow,
  type StudioGift
} from './studio'

vi.mock('decentraland-crypto-fetch', () => ({ default: vi.fn() }))

const fetchMock = vi.mocked(signedFetch)
const identity = {} as AuthIdentity
const STUDIO = '0b5f1b1e-6a59-4c4f-9a3e-2f5d3c1b7e01'
const ACCOUNT_A = '0x' + 'a'.repeat(40)
const ACCOUNT_B = '0x' + 'b'.repeat(40)
const ACCOUNT_C = '0x' + 'c'.repeat(40)
const limits = { sharedReason: 'Top player', maxGrantCents: 50000, balanceCents: 1_000_000 }
const answer = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status })

describe('when the studio page talks to the credits server', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('should send a gift with its idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(answer(201, { replayed: false }))

    await giftFromStudio(STUDIO, { account: ACCOUNT_A, credits: 10, reason: 'Top player', key: 'key-1' }, identity)

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      address: ACCOUNT_A,
      credits: 10,
      reason: 'Top player',
      idempotencyKey: 'key-1'
    })
  })

  it('should read a 200 as a gift already made and a 201 as a new one when the body cannot be read', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, 'not json')).mockResolvedValueOnce(answer(201, ''))
    const gift = () => giftFromStudio(STUDIO, { account: ACCOUNT_A, credits: 10, reason: 'x', key: 'k' }, identity)

    expect([(await gift()).replayed, (await gift()).replayed]).toEqual([true, false])
  })

  it('should report a gift with no answer at all as unknown, never as a failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(
      giftFromStudio(STUDIO, { account: ACCOUNT_A, credits: 10, reason: 'x', key: 'k' }, identity)
    ).rejects.toBeInstanceOf(StudioUnknownResultError)
  })

  it('should report a 5xx that says nothing as unknown, and a refusal with a code as that refusal', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(502, '<html>Bad gateway</html>'))
      .mockResolvedValueOnce(answer(503, { error: 'Studio grants are not available', code: 'GRANTS_NOT_CONFIGURED' }))
    const gift = () =>
      giftFromStudio(STUDIO, { account: ACCOUNT_A, credits: 10, reason: 'x', key: 'k' }, identity).catch(e => e)

    const [unknown, refused] = [await gift(), await gift()]

    expect({ unknown: unknown instanceof StudioUnknownResultError, code: refused.code }).toEqual({
      unknown: true,
      code: 'GRANTS_NOT_CONFIGURED'
    })
  })

  it('should read a success that leaves out replayed as a new gift, not as one already made', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { creditId: 'c-1' }))

    await expect(
      giftFromStudio(STUDIO, { account: ACCOUNT_A, credits: 10, reason: 'x', key: 'k' }, identity)
    ).resolves.toEqual({ replayed: false })
  })

  it.each([
    ['the INTERNAL_ERROR any failure is answered with, a lost commit included', 500, 'INTERNAL_ERROR'],
    ['a 5xx with a code this page does not know', 503, 'SOMETHING_NEW'],
    ['a refusal with a code this page does not know', 409, 'SOMETHING_NEW']
  ])('should report %s as unknown, not as a refusal', async (_label, status, code) => {
    fetchMock.mockResolvedValueOnce(answer(status, { error: 'x', code }))

    await expect(
      giftFromStudio(STUDIO, { account: ACCOUNT_A, credits: 10, reason: 'x', key: 'k' }, identity)
    ).rejects.toBeInstanceOf(StudioUnknownResultError)
  })

  it('should report a request to slow down with how long to wait', async () => {
    fetchMock.mockResolvedValueOnce(answer(429, { error: 'Too many requests', retryAfterSeconds: 7 }))

    const error = await giftFromStudio(
      STUDIO,
      { account: ACCOUNT_A, credits: 10, reason: 'x', key: 'k' },
      identity
    ).catch(e => e)

    expect({ slowDown: error instanceof StudioRateLimitedError, seconds: error.retryAfterSeconds }).toEqual({
      slowDown: true,
      seconds: 7
    })
  })

  it('should read an account with no studios as an empty list', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { studios: [], grantLimits: { maxGrantCents: 50000 } }))

    await expect(getMyStudios(identity)).resolves.toEqual({ studios: [], limits: { maxGrantCents: 50000 } })
  })
})

describe('when players are pasted from a list', () => {
  const nothingElse = { badLines: [], ambiguousLines: [] }

  it.each([
    ['commas', ', '],
    ['tabs', '\t'],
    ['semicolons', ';']
  ])('should read lines separated by %s, with an optional reason', (_label, separator) => {
    const text = [`${ACCOUNT_A}${separator}100${separator}Week 40`, `${ACCOUNT_B}${separator}50`].join('\n')

    expect(parsePastedRows(text)).toEqual({
      rows: [
        { account: ACCOUNT_A, credits: '100', reason: 'Week 40' },
        { account: ACCOUNT_B, credits: '50', reason: '' }
      ],
      ...nothingElse
    })
  })

  it('should keep a grouped number copied from a spreadsheet in one cell, for the review to refuse', () => {
    const parsed = parsePastedRows(`${ACCOUNT_A}\t1,000\tWelcome`)

    expect({ parsed, problem: validateRows(parsed.rows, limits).rowProblems[0] }).toEqual({
      parsed: { rows: [{ account: ACCOUNT_A, credits: '1,000', reason: 'Welcome' }], ...nothingElse },
      problem: { code: 'credits' }
    })
  })

  it('should not add a comma-separated line whose Credits may be a number split at its thousands separator', () => {
    expect(parsePastedRows(`${ACCOUNT_A}, 1,000, Welcome\n${ACCOUNT_C}, 50, Thanks`)).toEqual({
      rows: [{ account: ACCOUNT_C, credits: '50', reason: 'Thanks' }],
      badLines: [],
      ambiguousLines: [1]
    })
  })

  it('should read quoted cells whole, separators and doubled quotes included', () => {
    expect(parsePastedRows(`"${ACCOUNT_A}","1,000","Thanks, ""team"""`)).toEqual({
      rows: [{ account: ACCOUNT_A, credits: '1,000', reason: 'Thanks, "team"' }],
      ...nothingElse
    })
  })

  it('should take the separator that follows the first account, whatever the reasons hold', () => {
    expect(parsePastedRows(`${ACCOUNT_A}, 100, Builders; week 40`).rows).toEqual([
      { account: ACCOUNT_A, credits: '100', reason: 'Builders; week 40' }
    ])
  })

  it('should skip a first line of column names and say so, and report lines without Credits', () => {
    expect(parsePastedRows(`\naccount,credits\n\n"${ACCOUNT_A}","100"\n${ACCOUNT_B}`)).toEqual({
      rows: [{ account: ACCOUNT_A, credits: '100', reason: '' }],
      badLines: [5],
      ambiguousLines: [],
      header: 'account,credits'
    })
  })

  it('should keep a first line with a mistyped account as a row, for the review to point at', () => {
    const parsed = parsePastedRows(`0xabc, 100\n${ACCOUNT_B}, 50`)

    expect({ parsed, problem: validateRows(parsed.rows, limits).rowProblems[0] }).toEqual({
      parsed: {
        rows: [
          { account: '0xabc', credits: '100', reason: '' },
          { account: ACCOUNT_B, credits: '50', reason: '' }
        ],
        ...nothingElse
      },
      problem: { code: 'account' }
    })
  })

  it('should keep a first line with a name instead of an account as a row too', () => {
    expect(parsePastedRows('Alice, 100').rows).toEqual([{ account: 'Alice', credits: '100', reason: '' }])
  })
})

describe('when the total is typed to confirm a list', () => {
  it.each([
    ['1250', 1250],
    ['1,250', 1250],
    ['1.250', 1250],
    [' 1 250 ', 1250],
    ["1'250", 1250],
    ['12.500.000', 12_500_000]
  ])('should read %s as %s, whatever the grouping', (typed, total) => {
    expect(parseTypedTotal(typed)).toBe(total)
  })

  it.each(['', 'abc', '12a', '-5', '1.25', '1,2500', '1.250,5'])('should read %j as no total', typed => {
    expect(parseTypedTotal(typed)).toBeNull()
  })
})

describe('when the pages of gifts are put together', () => {
  const gift = (creditId: string): StudioGift => ({
    creditId,
    recipient: ACCOUNT_A,
    usdCents: 100,
    reason: null,
    grantedBy: ACCOUNT_B,
    createdAt: 1
  })

  it('should list a gift pushed onto the next page by a newer one only once, in order', () => {
    expect(
      uniqueGifts([{ gifts: [gift('c-3'), gift('c-2')] }, { gifts: [gift('c-2'), gift('c-1')] }]).map(
        item => item.creditId
      )
    ).toEqual(['c-3', 'c-2', 'c-1'])
  })
})

describe('when gift rows are validated', () => {
  const row = (overrides: Partial<{ account: string; credits: string; reason: string }> = {}) => ({
    account: ACCOUNT_A,
    credits: '100',
    reason: '',
    ...overrides
  })

  it('should accept good rows, using the shared reason, and add up their Credits', () => {
    expect(validateRows([row(), row({ account: ACCOUNT_B, credits: '50' })], limits)).toEqual({
      rowProblems: [null, null],
      batchProblems: [],
      totalCredits: 150
    })
  })

  it.each([
    ['an account that is not one', row({ account: '0x123' }), { code: 'account' }],
    ['Credits in scientific notation', row({ credits: '1e3' }), { code: 'credits' }],
    ['zero Credits', row({ credits: '0' }), { code: 'credits' }],
    ['more than one gift may give', row({ credits: '5001' }), { code: 'overMax', maxCredits: 5000 }],
    ['a reason over 80 characters', row({ reason: 'r'.repeat(81) }), { code: 'reasonTooLong' }],
    ['a reason on two lines', row({ reason: 'Top\nplayer' }), { code: 'reasonOneLine' }],
    ['an invisible character in the reason', row({ reason: 'Top​player' }), { code: 'reasonOneLine' }]
  ])('should refuse %s', (_label, bad, problem) => {
    expect(validateRows([bad], limits).rowProblems).toEqual([problem])
  })

  it('should ignore a row left blank, neither checking it nor counting it', () => {
    const blank = { account: '', credits: '', reason: '' }

    expect({
      checked: validateRows([row(), blank], limits),
      onlyBlank: validateRows([blank], limits).batchProblems,
      created: createGiftRows([row(), blank], 'Top player', () => 'k').length
    }).toEqual({
      checked: { rowProblems: [null, null], batchProblems: [], totalCredits: 100 },
      onlyBlank: [{ code: 'empty' }],
      created: 1
    })
  })

  it('should refuse a row with no reason when there is no shared one either', () => {
    expect(validateRows([row()], { ...limits, sharedReason: '' }).rowProblems).toEqual([{ code: 'reasonMissing' }])
  })

  it('should refuse the same account twice, whatever its case', () => {
    expect(
      validateRows([row(), row({ account: ACCOUNT_A.toUpperCase().replace('0X', '0x') })], limits).rowProblems
    ).toEqual([null, { code: 'duplicate', duplicateOf: 1 }])
  })

  it('should refuse a batch the studio cannot pay for, or one while gifts are not configured', () => {
    expect([
      validateRows([row({ credits: '200' })], { ...limits, balanceCents: 1000 }).batchProblems,
      validateRows([row()], { ...limits, maxGrantCents: null }).batchProblems
    ]).toEqual([[{ code: 'overBudget', totalCredits: 200 }], [{ code: 'notConfigured' }]])
  })
})

describe('when rows are compared with the studio recent gifts', () => {
  const now = Date.UTC(2026, 9, 8)
  const gift = (overrides: Partial<StudioGift> = {}): StudioGift => ({
    creditId: 'credit',
    recipient: ACCOUNT_A,
    usdCents: 1000,
    reason: 'Top player',
    grantedBy: ACCOUNT_C,
    createdAt: now - 86_400_000,
    ...overrides
  })

  it('should flag a row with the same player, Credits and reason', () => {
    expect(
      findLikelyRepeats([{ account: ACCOUNT_A, credits: 100, reason: 'Top player' }], [gift()], { nowMs: now })
    ).toHaveLength(1)
  })

  it.each([
    ['older than the window', gift({ createdAt: now - 31 * 86_400_000 })],
    ['for other Credits', gift({ usdCents: 2000 })],
    ['for another reason', gift({ reason: 'Other' })]
  ])('should not flag a gift %s', (_label, recent) => {
    expect(
      findLikelyRepeats([{ account: ACCOUNT_A, credits: 100, reason: 'Top player' }], [recent], { nowMs: now })
    ).toEqual([])
  })
})

describe('when a gift outcome is classified', () => {
  it('should read a new gift as gifted and a replay as already gifted', () => {
    expect([
      classifyGiftOutcome({ result: { replayed: false } }).status,
      classifyGiftOutcome({ result: { replayed: true } }).status
    ]).toEqual(['gifted', 'alreadyGifted'])
  })

  it('should stop on an answer that never came, keeping the row to send again', () => {
    expect(classifyGiftOutcome({ error: new StudioUnknownResultError() })).toEqual({
      status: 'unknown',
      stopsBatch: true,
      code: 'unknown'
    })
  })

  it.each(ROW_REFUSAL_CODES)('should carry on past a %s refusal', code => {
    expect(classifyGiftOutcome({ error: new StudioRequestError('no', 409, code) })).toEqual({
      status: 'refused',
      stopsBatch: false,
      code
    })
  })

  it.each(STUDIO_STOP_CODES)('should stop on a %s refusal', code => {
    expect(classifyGiftOutcome({ error: new StudioRequestError('no', 409, code) })).toEqual({
      status: 'blocked',
      stopsBatch: true,
      code
    })
  })

  it('should stop on a refusal it does not recognise', () => {
    expect(classifyGiftOutcome({ error: new StudioRequestError('Unauthorized', 400) })).toEqual({
      status: 'blocked',
      stopsBatch: true,
      code: 'unrecognized'
    })
  })
})

describe('when a gift batch runs', () => {
  const rowsFor = (...accounts: string[]): GiftRow[] => {
    let next = 0
    return createGiftRows(
      accounts.map(account => ({ account, credits: '10', reason: '' })),
      'Top player',
      () => `key-${++next}`
    )
  }

  it('should give every row its own key, the shared reason and a lower-cased account', () => {
    expect(rowsFor(ACCOUNT_A.toUpperCase().replace('0X', '0x'))).toEqual([
      { key: 'key-1', account: ACCOUNT_A, credits: 10, reason: 'Top player', status: 'pending' }
    ])
  })

  it('should carry on past a row refusal and stop at a studio refusal, leaving the rest not sent', async () => {
    const gift = vi.fn(async (row: GiftRow): Promise<GiftResult> => {
      if (row.account === ACCOUNT_A) throw new StudioRequestError('Operator', 403, 'STUDIO_OPERATOR')
      if (row.account === ACCOUNT_B) throw new StudioRequestError('Paused', 409, 'STUDIO_PAUSED')
      return { replayed: false }
    })

    const result = await runGiftBatch(rowsFor(ACCOUNT_A, ACCOUNT_B, ACCOUNT_C), gift, () => undefined)

    expect({
      statuses: result.rows.map(row => row.status),
      stoppedBy: result.stoppedBy,
      sent: gift.mock.calls.length
    }).toEqual({
      statuses: ['refused', 'blocked', 'notSent'],
      stoppedBy: 'STUDIO_PAUSED',
      sent: 2
    })
  })

  it('should resume by sending only the unsettled rows, with the same keys', async () => {
    const first = await runGiftBatch(
      rowsFor(ACCOUNT_A, ACCOUNT_B, ACCOUNT_C),
      async row => {
        if (row.account === ACCOUNT_B) throw new StudioUnknownResultError()
        return { replayed: false }
      },
      () => undefined
    )
    const resend = vi.fn<(row: GiftRow) => Promise<GiftResult>>(async () => ({ replayed: true }))

    const second = await runGiftBatch(first.rows, resend, () => undefined)

    expect({
      first: first.rows.map(row => row.status),
      resentKeys: resend.mock.calls.map(([row]) => row.key),
      second: second.rows.map(row => row.status)
    }).toEqual({
      first: ['gifted', 'unknown', 'notSent'],
      resentKeys: ['key-2', 'key-3'],
      second: ['gifted', 'alreadyGifted', 'alreadyGifted']
    })
  })

  it('should stop before the next row when asked, leaving it and the rest not sent', async () => {
    let stop = false
    const gift = vi.fn(async (): Promise<GiftResult> => {
      stop = true
      return { replayed: false }
    })

    const result = await runGiftBatch(rowsFor(ACCOUNT_A, ACCOUNT_B, ACCOUNT_C), gift, () => undefined, {
      shouldStop: () => stop
    })

    expect({
      statuses: result.rows.map(row => row.status),
      stoppedBy: result.stoppedBy,
      sent: gift.mock.calls.length
    }).toEqual({ statuses: ['gifted', 'notSent', 'notSent'], stoppedBy: 'interrupted', sent: 1 })
  })

  it('should wait as long as the server asks and send the same row again, with the same key', async () => {
    const gift = vi
      .fn<(row: GiftRow) => Promise<GiftResult>>()
      .mockRejectedValueOnce(new StudioRateLimitedError(3))
      .mockResolvedValue({ replayed: false })
    const waits: number[] = []

    const result = await runGiftBatch(rowsFor(ACCOUNT_A, ACCOUNT_B), gift, () => undefined, {
      wait: async ms => void waits.push(ms)
    })

    expect({
      statuses: result.rows.map(row => row.status),
      keys: gift.mock.calls.map(([row]) => row.key),
      waits
    }).toEqual({ statuses: ['gifted', 'gifted'], keys: ['key-1', 'key-1', 'key-2'], waits: [3000] })
  })

  it('should leave a row that may already hold its gift as it is when the batch stops, marking only unsent ones', async () => {
    const [a, b, c] = rowsFor(ACCOUNT_A, ACCOUNT_B, ACCOUNT_C)
    const rows: GiftRow[] = [a, { ...b, status: 'unknown', code: 'unknown' }, { ...c, status: 'blocked' }]

    const stopped = await runGiftBatch(rows, vi.fn(), () => undefined, { shouldStop: () => true })
    const paused = await runGiftBatch(
      [a, { ...b, status: 'unknown', code: 'unknown' }],
      async () => {
        throw new StudioRequestError('Paused', 409, 'STUDIO_PAUSED')
      },
      () => undefined
    )

    expect({
      stopped: stopped.rows.map(row => row.status),
      paused: paused.rows.map(row => row.status)
    }).toEqual({ stopped: ['notSent', 'unknown', 'blocked'], paused: ['blocked', 'unknown'] })
  })

  it('should stop once one gift is asked to slow down too many times in a row', async () => {
    const gift = vi.fn<(row: GiftRow) => Promise<GiftResult>>(async () => {
      throw new StudioRateLimitedError(1)
    })

    const result = await runGiftBatch(rowsFor(ACCOUNT_A, ACCOUNT_B), gift, () => undefined, { wait: async () => {} })

    expect({
      statuses: result.rows.map(row => row.status),
      stoppedBy: result.stoppedBy,
      sent: gift.mock.calls.length
    }).toEqual({ statuses: ['notSent', 'notSent'], stoppedBy: 'rateLimited', sent: MAX_SLOW_DOWNS_PER_GIFT + 1 })
  })

  it('should cut a wait short when it is stopped, instead of sitting out what the server asked', async () => {
    let stop = false
    const gift = vi.fn(async (): Promise<GiftResult> => {
      stop = true
      throw new StudioRateLimitedError(30)
    })
    const started = Date.now()

    const result = await runGiftBatch(rowsFor(ACCOUNT_A), gift, () => undefined, { shouldStop: () => stop })

    expect({ stoppedBy: result.stoppedBy, quick: Date.now() - started < 2000 }).toEqual({
      stoppedBy: 'interrupted',
      quick: true
    })
  })

  it('should report every change, so the batch is saved before the next row is sent', async () => {
    const snapshots: string[][] = []

    await runGiftBatch(
      rowsFor(ACCOUNT_A, ACCOUNT_B),
      async () => ({ replayed: false }),
      rows => snapshots.push(rows.map(row => row.status))
    )

    expect(snapshots).toEqual([
      ['gifted', 'pending'],
      ['gifted', 'gifted']
    ])
  })
})

describe('when a batch is started while another run of it is still going', () => {
  it('should let the first run stop, then start from what it saved, never sending a row twice', async () => {
    let next = 0
    let saved: GiftRow[] = createGiftRows(
      [ACCOUNT_B, ACCOUNT_C].map(account => ({ account, credits: '10', reason: 'x' })),
      'x',
      () => `key-${++next}`
    )
    let release: () => void = () => undefined
    const sent: string[] = []
    const gift = async (row: GiftRow): Promise<GiftResult> => {
      sent.push(row.key)
      if (sent.length === 1) await new Promise<void>(resolve => (release = resolve))
      return { replayed: false }
    }
    const save = (rows: GiftRow[]) => void (saved = rows)

    const first = startGiftBatch(ACCOUNT_A, STUDIO, () => saved, gift, save)
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    const runningWhileFirstWaits = isBatchRunning(ACCOUNT_A, STUDIO)
    const stopped = stopBatch(ACCOUNT_A, STUDIO)
    const second = startGiftBatch(ACCOUNT_A, STUDIO, () => saved, gift, save)
    release()
    await stopped
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect({
      runningWhileFirstWaits,
      first: firstResult?.rows.map(row => row.status),
      second: secondResult?.rows.map(row => row.status),
      sent,
      runningAfter: isBatchRunning(ACCOUNT_A, STUDIO)
    }).toEqual({
      runningWhileFirstWaits: true,
      first: ['gifted', 'notSent'],
      second: ['gifted', 'gifted'],
      sent: ['key-1', 'key-2'],
      runningAfter: false
    })
  })

  it('should stop a run still waiting its turn too, so it sends nothing once the first one ends', async () => {
    let next = 0
    const rows = createGiftRows(
      [ACCOUNT_B, ACCOUNT_C].map(account => ({ account, credits: '10', reason: 'x' })),
      'x',
      () => `key-${++next}`
    )
    let release: () => void = () => undefined
    const sent: string[] = []
    const gift = async (row: GiftRow): Promise<GiftResult> => {
      sent.push(row.key)
      if (sent.length === 1) await new Promise<void>(resolve => (release = resolve))
      return { replayed: false }
    }

    const first = startGiftBatch(
      ACCOUNT_A,
      STUDIO,
      () => rows,
      gift,
      () => undefined
    )
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    const queued = startGiftBatch(
      ACCOUNT_A,
      STUDIO,
      () => rows,
      gift,
      () => undefined
    )
    const stopped = stopBatch(ACCOUNT_A, STUDIO)
    release()
    await stopped

    expect({ queued: await queued, first: (await first)?.stoppedBy, sent }).toEqual({
      queued: null,
      first: 'interrupted',
      sent: ['key-1']
    })
  })
})

describe('when an unfinished batch is kept in the browser', () => {
  const memory = () => {
    const entries = new Map<string, string>()
    return {
      entries,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key)
    }
  }
  const batch = { studioId: STUDIO, rows: [], createdAt: 1 }

  it('should forget a batch whose rows are all settled when it is read as unfinished', () => {
    const store = memory()
    const row = { key: 'k', account: ACCOUNT_B, credits: 10, reason: 'x' }
    const settled = { ...batch, rows: [{ ...row, status: 'gifted' as const }] }
    const unfinished = { ...batch, rows: [{ ...row, status: 'unknown' as const }] }

    writePendingBatch(ACCOUNT_A, STUDIO, settled, store)
    const settledRead = readUnfinishedBatch(ACCOUNT_A, STUDIO, store)
    const left = store.entries.size
    writePendingBatch(ACCOUNT_A, STUDIO, unfinished, store)

    expect({ settledRead, left, unfinished: readUnfinishedBatch(ACCOUNT_A, STUDIO, store) }).toEqual({
      settledRead: null,
      left: 0,
      unfinished
    })
  })

  it('should save a run’s progress only over the same list, never over a forgotten or newer one', () => {
    const store = memory()
    const row = { key: 'k-a', account: ACCOUNT_B, credits: 10, reason: 'x', status: 'pending' as const }
    const listA = { studioId: STUDIO, createdAt: 1, rows: [row] }
    const progressA = { ...listA, rows: [{ ...row, status: 'gifted' as const }] }
    const listC = { studioId: STUDIO, createdAt: 2, rows: [{ ...row, key: 'k-c' }] }

    writePendingBatch(ACCOUNT_A, STUDIO, listA, store)
    const sameList = saveBatchProgress(ACCOUNT_A, STUDIO, progressA, store)
    writePendingBatch(ACCOUNT_A, STUDIO, null, store)
    const afterForget = saveBatchProgress(ACCOUNT_A, STUDIO, progressA, store)
    const forgottenStaysGone = readPendingBatch(ACCOUNT_A, STUDIO, store)
    writePendingBatch(ACCOUNT_A, STUDIO, listC, store)
    const overNewer = saveBatchProgress(ACCOUNT_A, STUDIO, progressA, store)

    expect({
      sameList,
      afterForget,
      forgottenStaysGone,
      overNewer,
      stored: readPendingBatch(ACCOUNT_A, STUDIO, store)
    }).toEqual({ sameList: true, afterForget: false, forgottenStaysGone: null, overNewer: false, stored: listC })
  })

  it('should read a saved batch of another shape as nothing pending', () => {
    const store = memory()
    store.setItem(
      `shop.studio.pendingGifts.${ACCOUNT_A}.${STUDIO}`,
      JSON.stringify({ studioId: STUDIO, createdAt: 1, rows: [{ account: ACCOUNT_B, credits: 10 }] })
    )

    expect(readPendingBatch(ACCOUNT_A, STUDIO, store)).toBeNull()
  })

  it('should read it back per account and studio, and forget it on request', () => {
    const store = memory()
    writePendingBatch(ACCOUNT_A, STUDIO, batch, store)

    const read = {
      same: readPendingBatch(ACCOUNT_A.toUpperCase().replace('0X', '0x'), STUDIO, store),
      otherAccount: readPendingBatch(ACCOUNT_B, STUDIO, store)
    }
    writePendingBatch(ACCOUNT_A, STUDIO, null, store)

    expect({ ...read, left: store.entries.size }).toEqual({ same: batch, otherAccount: null, left: 0 })
  })

  it('should say whether a batch was stored, so a list the browser refuses is never sent', () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined
    }

    // A browser with no storage at all: reading `localStorage` throws, as it does when site data is blocked.
    const noStorage = (() => {
      const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new Error('blocked')
      })
      try {
        return writePendingBatch(ACCOUNT_A, STUDIO, batch)
      } finally {
        blocked.mockRestore()
      }
    })()

    expect({
      stored: writePendingBatch(ACCOUNT_A, STUDIO, batch, memory()),
      refused: writePendingBatch(ACCOUNT_A, STUDIO, batch, refusing),
      noStorage
    }).toEqual({ stored: true, refused: false, noStorage: false })
  })

  it('should not save progress the browser refuses to store', () => {
    const store = memory()
    const row = { key: 'k-a', account: ACCOUNT_B, credits: 10, reason: 'x', status: 'pending' as const }
    const list = { studioId: STUDIO, createdAt: 1, rows: [row] }
    writePendingBatch(ACCOUNT_A, STUDIO, list, store)
    const full = {
      ...store,
      setItem: () => {
        throw new Error('quota')
      }
    }

    expect(saveBatchProgress(ACCOUNT_A, STUDIO, { ...list, rows: [{ ...row, status: 'gifted' }] }, full)).toBe(false)
  })

  it('should read a batch naming another studio as nothing pending, and tell lists apart', () => {
    const store = memory()
    const row = { key: 'k-a', account: ACCOUNT_B, credits: 10, reason: 'x', status: 'pending' as const }
    const list = { studioId: STUDIO, createdAt: 1, rows: [row] }
    store.setItem(`shop.studio.pendingGifts.${ACCOUNT_A}.${STUDIO}`, JSON.stringify({ ...list, studioId: 'another' }))

    expect({
      otherStudio: readPendingBatch(ACCOUNT_A, STUDIO, store),
      same: isSameBatch({ ...list, rows: [{ ...row, status: 'gifted' }] }, list),
      otherList: isSameBatch({ ...list, rows: [{ ...row, key: 'k-c' }] }, list),
      otherDate: isSameBatch({ ...list, createdAt: 2 }, list),
      nothing: isSameBatch(null, list)
    }).toEqual({ otherStudio: null, same: true, otherList: false, otherDate: false, nothing: false })
  })

  it('should read corrupted storage as nothing pending, and never throw when storage is refused', () => {
    const store = memory()
    store.setItem(`shop.studio.pendingGifts.${ACCOUNT_A}.${STUDIO}`, '{nope')
    const refusing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined
    }

    expect({
      corrupted: readPendingBatch(ACCOUNT_A, STUDIO, store),
      refusedRead: readPendingBatch(ACCOUNT_A, STUDIO, refusing),
      refusedWrite: writePendingBatch(ACCOUNT_A, STUDIO, batch, refusing)
    }).toEqual({ corrupted: null, refusedRead: null, refusedWrite: false })
  })
})
