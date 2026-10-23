/**
 * Scopes a style to a component rendered inside a dark surface (the item buy modals). Shared modal pieces
 * are also used on light cards (the NAME flow), so their dark ink is opted into by the surface, not baked in.
 */
export const onDark = "[data-surface='dark'] &"
