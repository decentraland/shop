import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// The unified catalog filter panel (Figma desktop 1256-293293 / mobile sheet 1304-307965). A stack of
// collapsible sections — Category, Price, Rarity, Status — plus a Smart toggle row, separated by
// hairline dividers. Section headers show a gray-2 summary of the applied values while collapsed
// (Figma in-sheet applied state 1304-309753).

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
`

export const Divider = styled.div`
  height: 1px;
  background: rgba(255, 255, 255, 0.25);
  width: 100%;
`

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`

// Collapsible section header (title + chevron). Transparent background — Figma separates the sections
// with hairline dividers only, no gray wash (a persistent fill read as a stuck hover state). A subtle
// hover tint appears only while the pointer is actually over the header (never after a tap, since we
// don't style :focus). `desktopStatic` hides the chevron and stops it reading as interactive on
// desktop (Category/Price are always shown there).
export const Header = styled('button', noForward('desktopStatic'))<{ desktopStatic?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: ${theme.colors.softWhite};
  text-align: left;
  cursor: pointer;

  ${theme.media.maxWidth('lg')} {
    height: 52px;
  }

  @media (hover: hover) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }

  ${({ desktopStatic }) =>
    desktopStatic
      ? `${theme.media.minWidth('lg')} {
          cursor: default;
          &:hover { background: transparent; }
        }`
      : ''}
`

export const Title = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.softWhite};

  ${theme.media.maxWidth('lg')} {
    font-size: 16px;
  }
`

// Chevron shown only on mobile for the always-open (desktop-static) sections.
export const HeaderChevronDesktopHidden = styled.span`
  display: inline-flex;
  ${theme.media.minWidth('lg')} {
    display: none;
  }
`

export const Summary = styled('p', noForward('desktopHidden'))<{ desktopHidden?: boolean }>`
  margin: 0;
  padding: 0 4px 4px;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 12px;
  line-height: normal;
  color: ${theme.colors.gray4};
  text-transform: capitalize;

  ${({ desktopHidden }) => (desktopHidden ? `${theme.media.minWidth('lg')} { display: none; }` : '')}
`

// Collapsible content: animate to content height via grid-template-rows 0fr↔1fr. `desktopStatic`
// sections stay open on desktop regardless of the collapse state.
export const Content = styled('div', noForward('open', 'desktopStatic'))<{ open?: boolean; desktopStatic?: boolean }>`
  display: grid;
  grid-template-rows: ${({ open }) => (open ? '1fr' : '0fr')};
  transition: grid-template-rows 0.22s ease;

  ${({ desktopStatic }) => (desktopStatic ? `${theme.media.minWidth('lg')} { grid-template-rows: 1fr; }` : '')}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const ContentInner = styled.div`
  overflow: hidden;
  min-height: 0;
`

// ---------------- Price ----------------

export const PriceInputs = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  padding: 8px 4px 0;
`

export const PriceField = styled.label`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
`

export const PriceFieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 12px;
  color: ${theme.colors.gray4};
`

export const PriceBox = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  height: 42px;
  padding: 8px;
  border: 0.5px solid ${theme.colors.softWhite};
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);

  &:focus-within {
    border-color: ${theme.rarities.epic};
  }
`

export const PriceInput = styled.input`
  width: 100%;
  min-width: 0;
  border: 0;
  background: none;
  padding: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.softWhite};

  &:focus {
    outline: 0;
  }
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`

export const PriceTo = styled.span`
  padding-bottom: 12px;
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 13px;
`

export const Slider = styled.div`
  position: relative;
  height: 20px;
  margin: 24px 4px 0;
`

export const SliderTrack = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
`

export const SliderFill = styled('div', noForward('minPct', 'maxPct'))<{ minPct: number; maxPct: number }>`
  position: absolute;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  left: ${({ minPct }) => `${minPct}%`};
  right: ${({ maxPct }) => `${100 - maxPct}%`};
  background: ${theme.colors.rarity};
  border-radius: 2px;
`

export const SliderInput = styled.input`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 20px;
  margin: 0;
  -webkit-appearance: none;
  appearance: none;
  background: none;
  pointer-events: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${theme.colors.white};
    border: 2px solid ${theme.colors.rarity};
    box-shadow: 0 1px 3px rgba(22, 21, 24, 0.25);
    cursor: pointer;
  }
  &::-moz-range-thumb {
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${theme.colors.white};
    border: 2px solid ${theme.colors.rarity};
    box-shadow: 0 1px 3px rgba(22, 21, 24, 0.25);
    cursor: pointer;
  }
`

export const SliderRange = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px 0;
`

export const SliderRangeVal = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.softWhite};
`

export const RangeCoin = styled(Icon)`
  width: 16px;
  height: 16px;
  color: ${theme.colors.softWhite};
`

// ---------------- Rarity ----------------

export const RarityChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 9px 4px 9px 8px;

  ${theme.media.maxWidth('lg')} {
    gap: 12px 16px;
  }
`

// Figma "Rarity Label" (1304:302245/302246): at rest a hairline translucent-white outline over the
// page field; selected it fills with translucent black and the outline goes solid soft-white.
export const RarityChip = styled('button', noForward('selected'))<{ selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: ${({ selected }) => (selected ? 'rgba(0, 0, 0, 0.3)' : 'transparent')};
  border: ${({ selected }) =>
    selected ? `1px solid ${theme.colors.softWhite}` : '0.5px solid rgba(255, 255, 255, 0.3)'};
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    border-color: ${theme.colors.softWhite};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const RaritySwatch = styled('span', noForward('color'))<{ color: string }>`
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: ${({ color }) => color};
  flex: none;
`

export const RaritySwatchCheck = styled(Icon)`
  position: absolute;
  inset: 0;
  width: 16px;
  height: 16px;
  color: ${theme.colors.white};
`

export const RarityName = styled('span', noForward('selected'))<{ selected?: boolean }>`
  font-family: ${theme.font.sans};
  font-weight: ${({ selected }) => (selected ? 600 : 400)};
  font-size: 12px;
  line-height: 1.43;
  /* Gray 5 at rest, soft-white when selected (Figma) — both read on the purple field. */
  color: ${({ selected }) => (selected ? theme.colors.softWhite : theme.colors.media)};
  text-transform: capitalize;

  ${theme.media.maxWidth('lg')} {
    font-size: 14px;
  }
`

// ---------------- Status (radios) ----------------

export const StatusRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 4px 4px 4px 24px;
  cursor: pointer;

  /* The whole row is the target, so pointing at the label previews the same red the radio takes when
     it is picked. Selected by tag rather than by interpolating StatusRadio (see CLAUDE.md). */
  @media (hover: hover) {
    &:hover input[type='radio'] {
      border-color: ${theme.colors.dclRed};
    }
  }
`

// Figma 2103:411706 — the picked radio is primary red, not the accent purple.
export const StatusRadio = styled.input`
  appearance: none;
  width: 18px;
  height: 18px;
  margin: 0;
  border: 2px solid ${theme.colors.media};
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  flex: none;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  /* The dot is painted as a background rather than a child element, which a replaced element can't
     have. The half-pixel feather on the stop keeps its edge from going jagged. */
  &:checked {
    border-color: ${theme.colors.dclRed};
    background: radial-gradient(circle at center, ${theme.colors.dclRed} 0 4px, transparent 4.5px);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.dclRed};
    outline-offset: 2px;
  }
`

export const StatusLabel = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.gray4};
`

// ---------------- Smart (toggle row) ----------------

export const SmartRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 4px;

  /* On mobile SMART is a peer of the collapsible section headers (Figma 1304-307965): same 52px row
     height so it doesn't read as a smaller afterthought. */
  ${theme.media.maxWidth('lg')} {
    height: 52px;
  }
`

export const SmartLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

export const SmartFlash = styled(Icon)`
  width: 14px;
  height: 14px;
  color: ${theme.colors.softWhite};

  ${theme.media.maxWidth('lg')} {
    width: 16px;
    height: 16px;
  }
`

export const SmartTitle = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.softWhite};
  /* Figma labels SMART in uppercase (the flash-feature label), unlike the title-case section names. */
  text-transform: uppercase;

  /* Match the section-header title size on mobile so SMART has the same hierarchy as Price/Rarity/etc. */
  ${theme.media.maxWidth('lg')} {
    font-size: 16px;
  }
`

export const SmartInfo = styled(Icon)`
  width: 12px;
  height: 12px;
  color: ${theme.colors.muted2};
`

// Track + knob switch (Figma "Switch" 2094:409127). Off = translucent white track, knob left; on =
// Brand/Ruby track, knob right. No border — the design's track is a plain filled pill.
export const Toggle = styled('button', noForward('on'))<{ on?: boolean }>`
  position: relative;
  width: 24px;
  height: 14px;
  padding: 0;
  border-radius: 100px;
  border: 0;
  background: ${({ on }) => (on ? theme.colors.dclRed : 'rgba(255, 255, 255, 0.1)')};
  cursor: pointer;
  flex: none;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }

  /* Bigger, tappable switch on mobile (the 24×14 desktop pill reads as too small on a phone). */
  ${theme.media.maxWidth('lg')} {
    width: 40px;
    height: 22px;
  }
`

export const ToggleKnob = styled('span', noForward('on'))<{ on?: boolean }>`
  position: absolute;
  top: 50%;
  left: ${({ on }) => (on ? 'calc(100% - 12px)' : '0px')};
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  /* White knob in both states (Figma switch knob is soft-white) — only its position animates. */
  background: ${theme.colors.softWhite};
  box-shadow: 0 1px 2px rgba(22, 21, 24, 0.3);
  transition: left 0.15s ease;

  ${theme.media.maxWidth('lg')} {
    width: 18px;
    height: 18px;
    left: ${({ on }) => (on ? 'calc(100% - 18px)' : '2px')};
  }
`
