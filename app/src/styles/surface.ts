/**
 * Scopes a style to a component rendered inside a dark surface (a card marked `data-surface="dark"`). The shared
 * checkout pieces keep their light ink by default and switch only under such a card.
 */
export const onDark = "[data-surface='dark'] &"
