// Helper for `styled('tag', noForward('propA', 'propB'))` — keeps the listed style-only props out of
// the rendered DOM (so they don't leak as invalid attributes / trigger React warnings) while still
// passing them to the style interpolation. Mirrors the repo's "no style-only prop reaches the DOM"
// convention (cf. Button/Chevron using data-* attributes) for cases that need typed props.
export const noForward = (...keys: string[]) => ({
  shouldForwardProp: (prop: string) => !keys.includes(prop)
})
