import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(22, 21, 24, 0.55);
`

export const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 1128px;
  max-width: 100%;
  max-height: 92vh;
  background: ${theme.colors.white};
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);

  &:focus {
    outline: none;
  }
`

export const Head = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid ${theme.colors.gray4};
`

export const Title = styled.h2`
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 20px;
  line-height: 1.6;
  color: ${theme.colors.text};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 18.5px;
  height: 18.5px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${theme.colors.text};

  .ico {
    width: 18.5px;
    height: 18.5px;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 4px;
  }
`

// Scrolls when the list is long; the header above it stays pinned.
export const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 24px;
`

export const Toolbar = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  background: ${theme.colors.white};
`

export const Count = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.muted};
`

export const SortBy = styled.div`
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 4px 4px 4px 12px;
  border: 0.5px solid ${theme.colors.lineStrong};
  border-radius: 8px;
  background: ${theme.colors.white};

  select {
    appearance: none;
    /* 24px design gap + the 24px chevron that sits on top of it. */
    padding: 0 48px 0 0;
    border: 0;
    background: none;
    font-family: ${theme.font.sans};
    font-weight: 500;
    font-size: 12px;
    line-height: 1.43;
    color: ${theme.colors.text2};
    cursor: pointer;
    outline: none;
  }
  select:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
    border-radius: 4px;
  }
  .chev {
    position: absolute;
    right: 4px;
    width: 24px;
    height: 24px;
    color: ${theme.colors.text2};
    pointer-events: none;
  }
`

export const TableWrap = styled.div`
  flex: none;
  border: 1px solid ${theme.colors.lineStrong};
  border-radius: 16px;
  /* The four equal columns need the design width to hold their content, so a narrower modal scrolls
     the table here rather than letting the page scroll sideways. */
  overflow-x: auto;
  overflow-y: hidden;
  background: ${theme.colors.white};
`

export const Table = styled.table`
  width: 100%;
  min-width: 1096px;
  table-layout: fixed;
  border-collapse: collapse;

  th {
    height: 48px;
    padding: 8px 8px 8px 16px;
    text-align: left;
    vertical-align: middle;
    background: ${theme.colors.media};
    border-right: 0.5px solid ${theme.colors.lineStrong};
    font-family: ${theme.font.sans};
    font-weight: 600;
    font-size: 16px;
    line-height: 1.5;
    color: ${theme.colors.text};
    text-transform: capitalize;
  }
  th:last-of-type {
    border-right: 0;
  }

  td {
    height: 56px;
    padding: 8px 8px 8px 16px;
    vertical-align: middle;
    border-right: 0.5px solid ${theme.colors.lineStrong};
    border-bottom: 0.5px solid ${theme.colors.lineStrong};
    font-family: ${theme.font.sans};
    font-size: 14px;
    line-height: 1.43;
    color: ${theme.colors.text2};
  }
  td:last-of-type {
    border-right: 0;
  }

  tbody tr:hover,
  tbody tr:focus-within {
    background: ${theme.colors.media};
  }
  tbody tr:hover td,
  tbody tr:focus-within td {
    border-bottom-color: ${theme.colors.media};
  }

  /* Stack every cell into a card — a 4-column grid is unusable at phone widths. The column name is
     carried on each cell's data-label so it survives translation. */
  ${theme.media.down('mobile')} {
    min-width: 0;

    thead {
      display: none;
    }
    tr {
      display: block;
      border-bottom: 0.5px solid ${theme.colors.lineStrong};
    }
    tr:last-of-type {
      border-bottom: 0;
    }
    td {
      display: block;
      height: auto;
      padding: 8px 16px;
      border-right: 0;
      border-bottom: 0;
    }
    td:first-of-type {
      padding-top: 12px;
    }
    td:last-of-type {
      padding-bottom: 12px;
    }
    td[data-label]::before {
      content: attr(data-label);
      display: block;
      margin-bottom: 2px;
      font-size: 12px;
      line-height: 1.43;
      color: ${theme.colors.muted};
      text-transform: capitalize;
    }
    tbody tr:hover td,
    tbody tr:focus-within td {
      border-bottom-color: transparent;
    }
  }
`

const ownerBase = `
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  .owner-ava {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 2.286px solid rgba(255, 255, 255, 0.5);
    border-radius: 50%;
    background: ${theme.colors.media};
    object-fit: cover;
    overflow: hidden;
    color: ${theme.colors.white};
    font-weight: 700;
    font-size: 13px;
  }
  .owner-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ${theme.font.sans};
    font-size: 14px;
    line-height: 1.43;
    color: ${theme.colors.text2};
  }
`

export const Owner = styled.div`
  ${ownerBase}
`

// Same row, but the seller resolved to a storefront we can link to.
export const OwnerButton = styled.button`
  ${ownerBase}
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover .owner-name {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
    border-radius: 4px;
  }
`

export const Muted = styled.span`
  color: ${theme.colors.muted};
`

// Price + row actions share the last cell: the amount sits left, the buy affordances right.
export const PriceCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;

  .amount {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: ${theme.font.sans};
    font-weight: 600;
    font-size: 16px;
    line-height: 1.5;
    color: ${theme.colors.text2};
  }
  /* The credits mark is always near-black here — never the violet accent. */
  .amount .ccy {
    flex: none;
    width: 22px;
    height: 22px;
    color: ${theme.colors.text2};
  }
  .approx {
    color: ${theme.colors.muted};
    font-weight: 600;
  }
`

// Revealed on hover/keyboard focus on desktop; always visible where there is no hover.
export const Actions = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.12s ease;

  tr:hover &,
  tr:focus-within &,
  &[data-persistent='true'] {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
  ${theme.media.down('mobile')} {
    opacity: 1;
  }
`

const rowButton = `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-align: center;
  white-space: nowrap;

  .ico {
    width: 20px;
    height: 20px;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const AddBtn = styled.button`
  ${rowButton}
  min-width: 106px;
  background: ${theme.colors.text2};
  color: ${theme.colors.softWhite};

  &:hover:not(:disabled) {
    filter: brightness(1.35);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`

export const BuyBtn = styled.button`
  ${rowButton}
  background: ${theme.colors.accent};
  color: ${theme.colors.softWhite};

  &:hover:not(:disabled) {
    background: ${theme.colors.accentHover};
  }
`

export const OwnChip = styled.span`
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  background: ${theme.colors.chip};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  line-height: 24px;
  color: ${theme.colors.muted};
  white-space: nowrap;
`

export const Pager = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
`

export const PageLabel = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1;
  color: ${theme.colors.gray0};
`

export const PageBtn = styled.button`
  display: grid;
  place-items: center;
  padding: 10px;
  border: 1px solid ${theme.colors.text2};
  border-radius: 4px;
  background: ${theme.colors.white};
  color: ${theme.colors.text2};
  cursor: pointer;

  /* One chevron glyph turned into ‹ / › so no extra asset is needed. */
  .ico {
    width: 11px;
    height: 11px;
    transform: rotate(-90deg);
  }
  &[data-dir='prev'] .ico {
    transform: rotate(90deg);
  }
  &:disabled {
    border-color: ${theme.colors.lineStrong};
    color: ${theme.colors.lineStrong};
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const Empty = styled.p`
  margin: 0;
  padding: 32px 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.muted};
  text-align: center;
`

// Classic (MANA) on-chain orders: price-discovery only, so they link out instead of buying here.
export const Classic = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;

  .classic-title {
    font-family: ${theme.font.sans};
    font-weight: 600;
    font-size: 15px;
    color: ${theme.colors.text2};
  }
  .classic-note {
    font-family: ${theme.font.sans};
    font-size: 13px;
    color: ${theme.colors.muted};
  }
`

export const ClassicChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: ${theme.radius.chip};
  background: ${theme.colors.chip};
  font-family: ${theme.font.sans};
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${theme.colors.muted};
`

export const ClassicLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid ${theme.colors.lineStrong};
  border-radius: 12px;
  color: ${theme.colors.accent};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  text-decoration: none;

  &:hover {
    background: ${theme.colors.chip};
  }
  .ico {
    width: 14px;
    height: 14px;
  }
`
