import { HandlerContextWithPath } from '../../types/system'

/**
 * OPTIONAL Shop-owned meta-transaction relayer endpoint (STUB).
 *
 * Default gasless backend is DCL's shared `transactions-server` (see shop/design/GASLESS_SPEC.md
 * §0/§3) — the frontend can point straight at it, so this handler is NOT required. It exists for
 * teams that want an isolated relayer / custom policy while keeping the SAME request/response
 * contract, so the frontend (lib/buy-gasless.ts) works unchanged against either backend.
 *
 * Contract (transactions-server shape):
 *   POST /transactions
 *   body: { transactionData: { from, params: [creditsManagerAddress, executeMetaTxCalldata] } }
 *   200:  { ok: true,  txHash }
 *   4xx/5xx: { ok: false, message, code }
 *
 * The buyer already signed the EIP-712 MetaTransaction off-chain; params[1] is the packed
 * executeMetaTransaction(buyer, functionData, signature) calldata. This endpoint's ONLY job is to
 * broadcast it from the relayer's own (gas-paying) wallet — it does NOT re-sign the meta-tx.
 *
 * NOTE: wiring this route + adding a `relayer` component (a gas-paying signer, ideally KMS like the
 * treasury signer in SHOP_SERVER_SPEC.md §3) is left to integration — see GASLESS_INTEGRATION.md.
 * The handler below is intentionally dependency-light and returns 501 until a relayer signer is
 * provided, so it compiles and can be wired incrementally without a live key.
 */

type RelayRequest = {
  transactionData?: {
    from?: string
    params?: [string, string] // [ targetContract, executeMetaTransaction calldata ]
  }
}

// Minimal relayer signer surface a real impl (dev raw-key or KMS) must satisfy. Deliberately the
// same 2-method shape as the treasury signer (SHOP_SERVER_SPEC.md §3) so it can reuse that infra.
export type RelayerSigner = {
  getAddress(): Promise<string>
  // Broadcasts { to, data } from the relayer wallet, paying gas. Returns the tx hash.
  sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string }>
}

export async function relayMetaTxHandler(
  // 'logs' is the only component required today; 'relayer' is optional until wired (see notes).
  context: HandlerContextWithPath<'logs', '/transactions'> & { components: { relayer?: RelayerSigner } }
) {
  const {
    components: { logs, relayer }
  } = context
  const logger = logs.getLogger('relay-meta-tx')

  let body: RelayRequest
  try {
    body = (await context.request.json()) as RelayRequest
  } catch {
    return { status: 400, body: { ok: false, message: 'Invalid JSON body', code: 'INVALID_BODY' } }
  }

  const from = body.transactionData?.from
  const params = body.transactionData?.params
  if (!from || !params || params.length !== 2 || !params[0] || !params[1]) {
    return {
      status: 400,
      body: { ok: false, message: 'transactionData.from and params:[to,data] are required', code: 'INVALID_PARAMS' }
    }
  }
  const [to, data] = params

  // Until a relayer signer is wired, this endpoint is a no-op stub. Point the frontend at DCL's
  // transactions-server (default) to go gasless today; wire `relayer` here to self-host.
  if (!relayer) {
    logger.warn('relay-meta-tx called but no relayer signer configured; returning 501', { from, to })
    return {
      status: 501,
      body: { ok: false, message: 'Relayer signer not configured. Use the DCL transactions-server, or wire a relayer signer.', code: 'RELAYER_NOT_CONFIGURED' }
    }
  }

  try {
    // The relayer wallet broadcasts the pre-signed meta-tx call and PAYS THE GAS. Replay/nonce
    // safety is enforced on-chain by CreditsManager.getNonce (the buyer's signature covers it),
    // so this endpoint does not need its own replay guard for correctness.
    const { hash } = await relayer.sendTransaction({ to, data })
    logger.info('meta-tx relayed', { from, to, txHash: hash })
    return { status: 200, body: { ok: true, txHash: hash } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('meta-tx relay failed', { from, to, error: message })
    return { status: 500, body: { ok: false, message, code: 'RELAY_FAILED' } }
  }
}
