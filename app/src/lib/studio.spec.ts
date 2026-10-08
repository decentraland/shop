import { beforeEach, describe, expect, it, vi } from 'vitest'
import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import {
  classifyGiftOutcome,
  createGiftRows,
  findLikelyRepeats,
  getMyStudios,
  giftFromStudio,
  parsePastedRows,
  readPendingBatch,
  ROW_REFUSAL_CODES,
  runGiftBatch,
  STUDIO_STOP_CODES,
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

  it('should read an account with no studios as an empty list', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { studios: [], grantLimits: { maxGrantCents: 50000 } }))

    await expect(getMyStudios(identity)).resolves.toEqual({ studios: [], limits: { maxGrantCents: 50000 } })
  })
})

describe('when players are pasted from a list', () => {
  it('should read comma, tab and semicolon separated lines, with an optional reason', () => {
    expect(parsePastedRows(`${ACCOUNT_A}, 100, Week 40\n${ACCOUNT_B}\t50\n${ACCOUNT_C};25;Bonus`)).toEqual({
      rows: [
        { account: ACCOUNT_A, credits: '100', reason: 'Week 40' },
        { account: ACCOUNT_B, credits: '50', reason: '' },
        { account: ACCOUNT_C, credits: '25', reason: 'Bonus' }
      ],
      badLines: []
    })
  })

  it('should skip a header line and blank lines, strip quotes and report lines without Credits', () => {
    expect(parsePastedRows(`account,credits\n\n"${ACCOUNT_A}","100"\n${ACCOUNT_B}`)).toEqual({
      rows: [{ account: ACCOUNT_A, credits: '100', reason: '' }],
      badLines: [4]
    })
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
      refusedWrite: (() => {
        writePendingBatch(ACCOUNT_A, STUDIO, batch, refusing)
        return 'ok'
      })()
    }).toEqual({ corrupted: null, refusedRead: null, refusedWrite: 'ok' })
  })
})
