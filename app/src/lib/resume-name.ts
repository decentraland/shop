// sessionStorage key for a "resume this NAME purchase after topping up" hand-off. When the buy-NAME
// modal hits the no-funds path we stash the NAME here and send the buyer to Stripe; on return the
// credits page reads it and re-opens the NAMEs page with the modal on its confirm step. Mirrors
// RESUME_BUY_KEY (per-item) and RESUME_CART_KEY (the whole cart).
//
// The NAME alone, never its price: a NAME is priced from the MANA/USD oracle, so the figure that was on
// screen is already stale by the time the buyer comes back. The page re-derives it — and re-probes
// availability — from the name.
export const RESUME_NAME_KEY = 'dcl_shop_resume_name'
