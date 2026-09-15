import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { theme } from '~/styles/theme'

// Creator sale modal: the same shell as PrimaryListModal (white rounded card, header + close, muted field
// labels, purple full-width CTA, green success banner) with chip pickers for the discount, the window and the
// start. Kept self-contained like the other modals so they stay decoupled.

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${theme.z.overlay};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(22, 21, 24, 0.55);
`

export const Card = styled.div`
  width: 560px;
  max-width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  background: ${theme.colors.white};
  border-radius: ${theme.radius.modal};
  padding: 12px 16px 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 20px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${theme.colors.gray4};
`

export const Title = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 22px;
  line-height: 1.6;
  color: ${theme.colors.text};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${theme.colors.text};

  .ico {
    width: 18px;
    height: 18px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const Subtitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 15px;
  line-height: 1.57;
  color: ${theme.colors.text2};
`

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const FieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const CollectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
`

export const CollectionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${theme.colors.line};
  border-radius: ${theme.radius.card};

  &[data-selected] {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.promptLilac};
  }
  /* Stating the scope, not offering it: no pointer affordance and nothing to click. */
  &[data-readonly] {
    cursor: default;
  }
`

/** The mosaic's frame: a fixed, rounded square so rows stay aligned whatever each collection holds. */
export const RowThumb = styled.span`
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  overflow: hidden;
  background: ${theme.colors.media};
`

export const RowInfo = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const RowName = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  color: ${theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const RowMeta = styled.span`
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`

// Preset pickers. Comfortable to tap (≥ 40px tall) so the same control works on mobile.
export const Chip = styled.button`
  height: 40px;
  padding: 0 14px;
  border: 1px solid ${theme.colors.gray4};
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.white};
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;

  &[data-selected] {
    background: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  &:hover:not(:disabled):not([data-selected]) {
    border-color: ${theme.colors.lineStrong};
  }

  /* Discount chips carry their step of the heat ramp at rest, so the scale is readable before anything is
     picked; the chosen one keeps the tint and gains the ring plus a halo. Selection is a ring, not a
     colour swap, because the colour is already saying something else here. */
  ${Object.entries(theme.saleHeat)
    .map(
      ([step, { tint, ink }]) => `
  &[data-heat='${step}'] {
    background: ${tint};
    border-color: ${tint};
    color: ${ink};
  }
  &[data-heat='${step}']:hover:not(:disabled):not([data-selected]) {
    border-color: ${ink};
  }
  &[data-heat='${step}'][data-selected] {
    background: ${tint};
    border: 2px solid ${ink};
    color: ${ink};
    font-weight: 700;
    box-shadow: 0 0 0 3px ${ink}33;
    /* The 2px border eats a pixel of the box; take it back from the padding so the row doesn't shift. */
    padding: 0 13px;
  }`
    )
    .join('')}
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// A short framed number input with a unit suffix (the custom percentage, the unit limit).
export const InlineInput = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* Fields stack in a column, whose default stretch would blow a two-character number box out to the
     full width of the modal. */
  width: fit-content;
  height: 40px;
  padding: 0 10px;
  border: 0.5px solid ${theme.colors.text};
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.muted};

  &:focus-within {
    border-color: ${theme.colors.magenta};
  }
  &[aria-invalid='true'] {
    border-color: ${theme.colors.err};
  }

  /* Takes the heat of whatever has been typed, so the custom value reads on the same scale as the presets. */
  ${Object.entries(theme.saleHeat)
    .map(
      ([step, { tint, ink }]) => `
  &[data-heat='${step}'] {
    background: ${tint};
    border-color: ${ink};
  }`
    )
    .join('')}

  input {
    width: 64px;
    border: 0;
    outline: none;
    background: transparent;
    font-family: ${theme.font.sans};
    font-size: 14px;
    color: ${theme.colors.text};

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    &[type='number'] {
      -moz-appearance: textfield;
      appearance: textfield;
    }
  }
`

export const DateInput = styled.input`
  /* Chip height exactly: this field opens inside a row of chips, and two pixels of difference there
     resized the whole modal. */
  height: 40px;
  /* Explicit, and wide enough for the whole date: the browser's intrinsic width for a datetime-local
     tracks the font size, and leaving it implicit made the row's fit depend on font metrics. With the
     compact duration labels the row has room to spare, so this can be generous rather than lucky. */
  width: 208px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 0.5px solid ${theme.colors.text};
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.text};
  max-width: 100%;

  &:focus {
    outline: none;
    border-color: ${theme.colors.magenta};
  }
`

export const CapRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.text};
  cursor: pointer;

  /* Only the checkbox, not the number field the row can open. */
  > label > input {
    width: 18px;
    height: 18px;
    accent-color: ${theme.colors.accent};
    cursor: pointer;
  }
`

export const CapLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
`

// The worked example: what one listed item costs during the sale.
/**
 * The hint under the terms. Always two lines tall, even when one would do: the sentence wraps or unwraps
 * with the numbers in it, and letting that resize the modal made the whole card jump while picking.
 */
export const Preview = styled.p`
  display: flex;
  align-items: center;
  margin: 0;
  padding: 10px 12px;
  min-height: calc(2 * 1.5em + 20px);
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.panel};
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.5;
  color: ${theme.colors.text2};
`

/**
 * Text wearing the currency mark in front: an amount in the example line, the currency's own name in the
 * hint. Either way the mark leads, the way every price in the Shop reads.
 *
 * Plain inline, not the inline-flex the price rows use — a flex box here makes `innerText` break the line
 * around it, which is the text the e2e suite reads the sentence from.
 */
export const Marked = styled.b`
  font-weight: 700;
  color: ${theme.colors.text};
  white-space: nowrap;

  .ico {
    margin-right: 2px;
  }
`

export const Status = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.muted};
  text-align: center;
`

export const PrimaryBtn = styled.button`
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: ${theme.radius.modal};
  cursor: pointer;
  background: ${theme.colors.accent};
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    background: ${theme.colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: not-allowed;
    background: rgba(105, 31, 169, 0.2);
    color: ${theme.colors.white};
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column;
  }
`

const actionBtn = `
  flex: 1 1 0;
  height: 48px;
  border-radius: ${theme.radius.modal};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const OutlineBtn = styled.button`
  ${actionBtn}
  border: 1px solid ${theme.colors.accent};
  background: ${theme.colors.white};
  color: ${theme.colors.accent};
`

export const PurpleBtn = styled.button`
  ${actionBtn}
  border: 0;
  background: ${theme.colors.accent};
  color: ${theme.colors.white};

  &:hover {
    background: ${theme.colors.accentHover};
  }
`

export const SuccessBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  border-radius: ${theme.radius.modal};
  background: rgba(193, 238, 207, 0.5);
  text-align: center;
`

export const SuccessCheck = styled.div`
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${theme.colors.ok};
  color: ${theme.colors.white};

  .ico {
    width: 34px;
    height: 34px;
  }
`

export const SuccessText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 22px;
  line-height: 1.4;
  color: ${theme.colors.text};
`

export const SuccessDetail = styled.p`
  margin: 0;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  font-family: ${theme.font.sans};
  font-size: 15px;
  color: ${theme.colors.text2};
`

/**
 * A chip that becomes its own input.
 *
 * Two grid columns swapping between 0fr and 1fr: the chip collapses to nothing while the field opens in
 * its place, and because both tracks stay content-sized the animation survives translation — no measured
 * or hardcoded widths to go stale when "Custom" becomes "Personalizado".
 */
export const Morph = styled.div`
  display: inline-grid;
  grid-template-columns: 1fr 0fr;
  align-items: center;
  transition: grid-template-columns 0.24s cubic-bezier(0.2, 0.7, 0.3, 1);

  &[data-open] {
    grid-template-columns: 0fr 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

/** Morph's sibling for a field with no chip to swap with — a checkbox opens it in place instead. */
export const Reveal = styled.div`
  display: inline-grid;
  grid-template-columns: 0fr;
  transition: grid-template-columns 0.24s cubic-bezier(0.2, 0.7, 0.3, 1);

  &[data-open] {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const MorphCell = styled.div`
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;

  /* The collapsed half is still in the DOM (it has to be, to animate back), so stop it catching clicks. */
  &[data-off] {
    pointer-events: none;
  }
`

/** The review step: what the sale will do, item by item, before anything is signed. */
export const ReviewSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.panel};
`

/** The chosen discount, wearing the same colours its chip wore on the step before. */
export const ReviewPct = styled.span`
  display: inline-flex;
  align-items: center;
  /* Hugs its label: it sits in the same 1fr column the dates fill, which would otherwise stretch it. */
  justify-self: start;
  height: 28px;
  padding: 0 10px;
  border-radius: ${theme.radius.pill};
  border: 2px solid transparent;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;

  ${Object.entries(theme.saleHeat)
    .map(
      ([step, { tint, ink }]) => `
  &[data-heat='${step}'] {
    background: ${tint};
    border-color: ${ink};
    color: ${ink};
  }`
    )
    .join('')}
`

/** One row of the summary: its label, the value, and — for the window — how long until it. */
export const ReviewWhenRow = styled.div`
  display: grid;
  /* Fixed, not content-sized: each row is its own grid, so a max-content track would line each label up
     with nothing. 78px clears the longest label in either locale ("Descuento" measures ~70px). */
  grid-template-columns: 78px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  font-family: ${theme.font.sans};
  font-size: 15px;
  line-height: 1.5;
`

export const ReviewWhenLabel = styled.span`
  color: ${theme.colors.muted};
  font-size: 14px;
`

export const ReviewWhenValue = styled.b`
  font-weight: 700;
  color: ${theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * Plain meta text, not the default pill: three filled pills in one small panel (the discount badge plus
 * one per row) fought each other, and the one that should win is the discount.
 */
export const ReviewWhenLeft = styled(SaleCountdown)`
  flex: none;
  padding: 0;
  background: none;
  color: ${theme.colors.muted};
  font-size: 14px;
  font-weight: 600;
`

export const ReviewGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const ReviewGroupTitle = styled.h3`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  color: ${theme.colors.text};
`

export const ReviewList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  /* Long collections stay inside the modal instead of pushing the actions off-screen. */
  max-height: 232px;
  overflow-y: auto;
`

export const ReviewRow = styled.li`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.line};

  &[data-muted] {
    background: ${theme.colors.panel};
    border-color: ${theme.colors.panel};
  }
`

export const ReviewThumb = styled.img`
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  object-fit: cover;
  background: ${theme.colors.media};
`

export const ReviewName = styled.span`
  font-family: ${theme.font.sans};
  font-size: 15px;
  color: ${theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * Two fixed columns rather than an inline run: the old and the new price line up down the list, so the
 * column of what things cost now and the column of what they will cost can be read as columns.
 */
/**
 * Two right-aligned columns so the prices line up down the list. The tracks are only as wide as the
 * numbers need — wider ones left a gulf between what an item costs and what it will cost, which read as
 * two unrelated figures rather than a before and an after.
 */
export const ReviewPrices = styled.span`
  display: grid;
  grid-template-columns: minmax(34px, auto) minmax(46px, auto);
  align-items: center;
  gap: 6px;
  font-family: ${theme.font.sans};
  white-space: nowrap;
`

/**
 * The price being left behind. `muted` rather than the lighter `muted2`: a line through a number already
 * costs it legibility, and at Gray 3 on white the two together were closer to decoration than to a figure
 * anyone could read.
 */
export const ReviewWas = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  color: ${theme.colors.muted};
  text-decoration: line-through;
  font-weight: 600;
  font-size: 17px;
`

/**
 * The number the sale is actually about, so it is the biggest thing in the row — and it carries the ink of
 * its step, the same one the discount badge above is lettered in.
 */
export const ReviewNow = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-weight: 700;
  font-size: 20px;

  ${Object.entries(theme.saleHeat)
    .map(
      ([step, { ink }]) => `
  &[data-heat='${step}'] {
    color: ${ink};
  }`
    )
    .join('')}
`

export const ReviewUnaffected = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${theme.colors.muted};
  white-space: nowrap;
`

/** Opens the reason a row is excluded. Focusable, so the explanation is reachable without a hover. */
export const UnaffectedInfo = styled(Icon)`
  /* Drawn at 14px, hit at 26px: padding cancelled by an equal negative margin, so a finger has something
     to land on without the glyph moving or the row growing. */
  width: 14px;
  height: 14px;
  padding: 6px;
  margin: -6px;
  box-sizing: content-box;
  color: ${theme.colors.muted2};
  cursor: help;

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
    border-radius: 50%;
  }
`

export const ReviewFoot = styled.p`
  margin: 0;
  padding: 12px;
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.promptLilac};
  font-family: ${theme.font.sans};
  font-size: 15px;
  line-height: 1.45;
  color: ${theme.colors.text};

  b {
    font-weight: 700;
  }
`

/** The one line that says what to do about a group the discount cannot reach. */
export const ReviewFootNote = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  line-height: 1.45;
  color: ${theme.colors.muted};
`
