import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import './Icon.css'

// Every SVG in assets/icons is a monochrome glyph used as a CSS mask (tinted by currentColor).
const SVG_URLS = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})

const SRC: Record<string, string> = {}
for (const [path, url] of Object.entries(SVG_URLS)) {
  SRC[path.slice(path.lastIndexOf('/') + 1, -'.svg'.length)] = url as string
}

// The glob resolves URLs at runtime, but TS can't infer literal names from it — so this union is the
// hand-maintained list of valid icons. Keep it in sync with assets/icons: add the file's basename here
// when you add an SVG, and remove it here when you delete one.
export type IconName =
  | 'arrow-left'
  | 'bell'
  | 'carousel-arrow'
  | 'cart'
  | 'cart-solid'
  | 'check'
  | 'cat-accessories'
  | 'cat-feet'
  | 'cat-handwear'
  | 'cat-head'
  | 'cat-lower'
  | 'cat-skins'
  | 'cat-upper'
  | 'category-eyewear'
  | 'chevron-down'
  | 'clock'
  | 'close'
  | 'copy'
  | 'credits'
  | 'discord'
  | 'emote-dance'
  | 'emote-fun'
  | 'emote-greetings'
  | 'emote-horror'
  | 'emote-misc'
  | 'emote-poses'
  | 'emote-reactions'
  | 'emote-stunt'
  | 'ethereum'
  | 'external-link'
  | 'facebook'
  | 'filter'
  | 'fitting-room'
  | 'gender-female'
  | 'gender-male'
  | 'gender-unisex'
  | 'heart'
  | 'heart-solid'
  | 'info'
  | 'mana-logo'
  | 'pen'
  | 'plus'
  | 'search'
  | 'slot-feet'
  | 'slot-hands'
  | 'slot-head'
  | 'slot-item'
  | 'slot-lower'
  | 'slot-upper'
  | 'smart'
  | 'trash'
  | 'twitter'
  | 'upload'
  | 'view-all-arrow'
  | 'website'

type IconProps = {
  name: IconName
  /** Square px size. Omit to inherit the CSS default (20px) or a context override. */
  size?: number
} & ComponentPropsWithoutRef<'span'>

export function Icon({ name, size, className, style, ...rest }: IconProps) {
  const url = SRC[name]
  if (import.meta.env.DEV && !url) console.warn(`Icon: no SVG found for "${name}" — check assets/icons/`)

  const vars = {
    '--icon-url': url ? `url("${url}")` : undefined,
    ...(size != null ? { width: size, height: size } : null),
    ...style
  } as CSSProperties
  // Decorative by default; a caller-supplied label/role marks it meaningful, so don't hide it then.
  const decorative = rest['aria-label'] == null && rest.role == null
  return (
    <span
      aria-hidden={decorative || undefined}
      {...rest}
      className={className ? `ico ${className}` : 'ico'}
      style={vars}
    />
  )
}
