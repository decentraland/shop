import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { theme } from '~/styles/theme'

const { colors, gradients, radius } = theme

// The 620px restack is a page-specific breakpoint (not in theme.breakpoints), so it stays raw.
const narrow = '@media (max-width: 620px)'

export const Empty = styled.div`
  max-width: 520px;
  margin: 0 auto;
  text-align: center;
  padding: 80px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`

export const EmptyIco = styled.span`
  font-size: 44px;
`

export const EmptyTitle = styled.h1`
  font-size: 26px;
  font-weight: 800;
  margin: 4px 0 0;
`

// The empty-state CTA sits below the copy.
export const EmptyCta = styled(Button)`
  margin-top: 10px;
`

export const Root = styled.div`
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 120px;
`

export const Head = styled.header`
  margin-bottom: 18px;
`

export const Eyebrow = styled.span`
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${colors.accent};
  background: ${colors.rarityBg};
  padding: 6px 12px;
  border-radius: 999px;
  margin-bottom: 14px;
`

export const Title = styled.h1`
  font-size: clamp(26px, 4vw, 38px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.08;
  margin: 0 0 10px;
`

export const Grad = styled.span`
  background: ${gradients.amethyst};
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`

export const Lede = styled.p`
  color: ${colors.muted};
  max-width: 60ch;
  margin: 0;
`

export const Ratebar = styled.div`
  font-size: 13px;
  color: ${colors.muted};
  margin: 16px 0 8px;
  display: flex;
  align-items: center;
  gap: 7px;
`

export const Section = styled.section`
  margin-top: 26px;
`

export const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`

export const SectionTitle = styled.h2`
  font-size: 19px;
  font-weight: 800;
`

export const SectionSub = styled.span`
  color: ${colors.muted};
  font-size: 14px;
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const Row = styled.article`
  display: grid;
  grid-template-columns: 22px 56px 1fr auto auto;
  align-items: center;
  gap: 16px;
  background: #fff;
  border: 1px solid ${colors.line};
  border-radius: 14px;
  padding: 14px 18px;
  transition:
    box-shadow 0.18s ease,
    opacity 0.25s ease;

  &:hover {
    box-shadow: 0 10px 28px rgba(46, 16, 74, 0.1);
  }
  &[data-off] {
    opacity: 0.5;
  }

  ${narrow} {
    grid-template-columns: 22px 48px 1fr;
    row-gap: 12px;
  }
`

// The `shimmer` keyframe is global (index.css).
export const SkeletonRow = styled.div`
  display: block;
  height: 86px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: linear-gradient(100deg, #ededed 30%, #f7f7f7 50%, #ededed 70%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;
`

export const Check = styled.input`
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 2px solid ${colors.lineStrong};
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: none;
  transition:
    background 0.15s,
    border-color 0.15s;

  &:checked {
    background: ${colors.accent};
    border-color: ${colors.accent};
  }
  &:checked::after {
    content: '✓';
    color: #fff;
    font-size: 13px;
    font-weight: 800;
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const Thumb = styled.div`
  width: 56px;
  height: 56px;
  border-radius: ${radius.card};
  overflow: hidden;
  flex: none;
  display: grid;
  place-items: center;
  background: radial-gradient(120% 120% at 30% 20%, rgba(165, 36, 179, 0.12), ${colors.media} 70%);
  border: 1px solid ${colors.line};

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Meta = styled.div`
  min-width: 0;
`

export const Name = styled.div`
  font-weight: 700;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Chip = styled.span`
  display: inline-flex;
  margin-top: 5px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${colors.rarity};
  background: ${colors.rarityBg};
  padding: 3px 9px;
  border-radius: 5px;
`

export const Price = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;

  ${narrow} {
    grid-column: 2 / 4;
    align-items: flex-start;
  }
`

export const PriceField = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1.5px solid ${colors.lineStrong};
  border-radius: 10px;
  padding: 7px 12px;
  background: #fff;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &:focus-within {
    border-color: ${colors.accent};
    box-shadow: 0 0 0 3px ${colors.rarityBg};
  }
`

export const PriceInput = styled.input`
  width: 82px;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-weight: 800;
  font-size: 17px;
  color: ${colors.text};
  text-align: right;
  font-variant-numeric: tabular-nums;
`

export const PriceSub = styled.div`
  font-size: 12px;
  color: ${colors.muted};
  display: flex;
  align-items: center;
  gap: 8px;
`

export const PriceReset = styled.button`
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: ${colors.accent};
  cursor: pointer;
`

export const Action = styled.div`
  display: flex;
  justify-content: flex-end;
  min-width: 74px;

  ${narrow} {
    grid-column: 2 / 4;
    justify-content: flex-start;
  }
`

// The per-row "List" button: a subtle neutral fill instead of the default Button look.
export const ListBtn = styled(Button)`
  && {
    background: ${colors.media};
    color: ${colors.text2};
  }
  &&:hover:not(:disabled) {
    background: #e3e0ea;
  }
`

export const Dock = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-top: 1px solid ${colors.line};
`

export const DockInner = styled.div`
  max-width: 860px;
  margin: 0 auto;
  padding: 15px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
`

export const DockTotal = styled.div`
  font-weight: 800;
  font-size: 16px;
`

export const DockSub = styled.div`
  font-size: 13px;
  color: ${colors.muted};
`

export const DockSpacer = styled.span`
  flex: 1 1 auto;
`

// The dock's "List all" CTA is a touch roomier than the base button.
export const DockCta = styled(Button)`
  padding: 13px 24px;
`
