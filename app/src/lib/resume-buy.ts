// sessionStorage key for a "resume this item purchase after topping up" hand-off. When a buyer hits
// the no-funds path in the buy modal, we stash the item here and send them to Stripe; on return the
// credits page reads it and re-opens the item's buy modal in resume mode. Kept in its own tiny module
// (not BuyModal) so importers like GetCredits don't pull in the heavy buy/gasless dependency graph.
export const RESUME_BUY_KEY = 'dcl_shop_resume_buy'
