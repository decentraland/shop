import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Icon } from '~/components/Icon'

const { colors, font } = theme

// data-flat drops the gray container; selected/hover read as a light-gray pill on the page bg.
export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  &[data-flat] {
    background: none;
    padding: 0;
    width: auto;
  }
  &[data-flat] [data-cat]:hover,
  &[data-flat] [data-sub]:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  &[data-flat] [data-cat][data-selected],
  &[data-flat] [data-sub][data-active] {
    background: rgba(255, 255, 255, 0.16);
  }
`

export const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

// Animate expand/collapse to content height via grid-template-rows 0fr↔1fr.
export const Subs = styled.div`
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.22s ease;

  &[data-open] {
    grid-template-rows: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const SubsInner = styled.div`
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const rowCss = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 40px;
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  width: 100%;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

export const Cat = styled.button`
  ${rowCss};

  &[data-selected],
  &[data-expanded] {
    background: rgba(255, 255, 255, 0.14);
  }
`

export const Sub = styled.button`
  ${rowCss};
  padding-left: 24px;

  &[data-active] {
    background: rgba(255, 255, 255, 0.16);
  }
  &[data-active] [data-sub-label] {
    color: ${colors.white};
    font-weight: 600;
  }

  /**
   * The expand chevron tracks the row's label rather than carrying a colour of its own: gray4 at rest,
   * white once the row is hovered or selected — the same two states the label moves between. It reads as
   * part of the row, so a chevron that stayed grey under a white label would look like the bug this
   * replaced (it used to inherit the near-black text colour, invisible against the dark panel).
   */
  [data-chevron] {
    color: ${colors.gray4};
  }
  &:hover [data-chevron],
  &[data-active] [data-chevron] {
    color: ${colors.white};
  }
`

/**
 * Third level: the sub-categories of Head and Accessories (Figma 2212:99919). Indented 48px against
 * the 24px of level two, which is the whole visual cue for the nesting — the row is otherwise identical,
 * so the padding is the only thing that says "this belongs to the row above".
 */
export const SubSub = styled.button`
  ${rowCss};
  padding-left: 48px;

  &[data-active] {
    background: ${colors.rarityBg};
  }
  &[data-active] [data-sub-label] {
    color: ${colors.rarity};
    font-weight: 600;
  }
`

export const CatLabel = styled.span`
  font-family: ${font.sans};
  font-weight: 600;
  font-size: 14px;
  line-height: 1.57;
  color: ${colors.softWhite};
`

export const SubLeft = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

export const SubIcon = styled(Icon)`
  width: 24px;
  height: 24px;
  color: ${colors.gray4};
`

export const SubLabel = styled.span`
  font-family: ${font.sans};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.5;
  color: ${colors.gray4};
`

export const Title = styled.p`
  font-family: ${font.sans};
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${colors.gray4};
  margin: 0 0 4px;
  padding: 8px 16px 0;
`
