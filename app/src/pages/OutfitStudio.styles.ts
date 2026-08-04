import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { Button } from '~/components/Button'
import { theme } from '~/styles/theme'

const { colors, radius, media, z } = theme

export const Root = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

export const Gate = styled.div`
  min-height: 52vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
`

export const GateTitle = styled.h1`
  font-size: 24px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

export const Title = styled.h1`
  font-size: 24px;
  font-weight: 800;
  margin-right: auto;
`

export const Back = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: ${colors.text};

  &:hover {
    background: ${colors.panel};
  }
`

export const StateChip = styled.span`
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 10px;
  border-radius: ${radius.pill};
  background: ${colors.chip};
  color: ${colors.muted1};

  &[data-state='published'] {
    background: rgba(30, 166, 114, 0.14);
    color: ${colors.okStrong};
  }
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

export const RowSkeleton = styled.span`
  height: 76px;
  border-radius: ${radius.card};
`

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};

  ${media.maxWidth('mobile')} {
    flex-wrap: wrap;
  }
`

const rowThumb = css`
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: ${colors.media};
  flex-shrink: 0;
`

export const RowThumb = styled.div`
  ${rowThumb};
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`

export const RowThumbEmpty = styled.span`
  ${rowThumb};
  display: inline-block;
`

export const RowInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const RowName = styled.span`
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const RowMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${colors.muted};
`

export const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  ${media.maxWidth('mobile')} {
    width: 100%;
    justify-content: flex-end;
  }
`

export const RowDelete = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  border-radius: 50%;
  color: ${colors.muted};
  cursor: pointer;

  &:hover {
    color: ${colors.errStrong};
    background: ${colors.panel};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

export const ConfirmModal = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${z.overlay};
  display: grid;
  place-items: center;
  padding: 16px;
`

export const ConfirmScrim = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(22, 21, 24, 0.5);
`

export const ConfirmPanel = styled.div`
  position: relative;
  background: ${colors.bg};
  border-radius: ${radius.card};
  padding: 24px;
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const ConfirmTitle = styled.h2`
  font-size: 18px;
  font-weight: 800;
`

export const ConfirmActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
`

export const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 32px;
  align-items: start;

  ${media.maxWidth('mobile')} {
    grid-template-columns: 1fr;
    gap: 20px;
  }
`

export const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`

export const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`

export const PreviewBox = styled.div`
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  overflow: hidden;
  background: ${colors.media};

  ${media.maxWidth('mobile')} {
    aspect-ratio: 1 / 1;
  }

  & iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }

  [data-preview-viewport] {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
`

export const PreviewEmpty = styled.p`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
`

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Label = styled.label`
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${colors.muted1};
`

export const Shapes = styled.div`
  display: flex;
  gap: 8px;
`

export const ShapeBtn = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border-radius: ${radius.pill};
  border: 1px solid ${colors.lineStrong};
  background: none;
  font: inherit;
  font-weight: 600;
  color: ${colors.text};
  cursor: pointer;

  &[data-selected] {
    border-color: ${colors.accent};
    background: ${colors.accent};
    color: ${colors.white};
  }
`

export const ThumbPreview = styled.div`
  width: 240px;
  aspect-ratio: 3 / 4;
  border-radius: ${radius.card};
  overflow: hidden;
  background: ${colors.media};

  &[data-busy] {
    opacity: 0.6;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`

export const Gradient = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`

export const ColorField = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

// Native picker: the OS dialog on desktop and the system color UI on mobile — no dependency, and
// the 44px box keeps it a comfortable touch target.
export const ColorInput = styled.input`
  width: 44px;
  height: 44px;
  padding: 2px;
  border: 1px solid ${colors.lineStrong};
  border-radius: ${radius.btn};
  background: none;
  cursor: pointer;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  &::-webkit-color-swatch {
    border: 0;
    border-radius: 4px;
  }
`

export const ColorMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: ${colors.muted};
`

export const HexInput = styled.input`
  width: 88px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.chip};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: ${colors.text};
  text-transform: lowercase;

  &[data-invalid] {
    border-color: ${colors.errStrong};
  }
`

// Rail-width stage for the real OutfitCard, so what the creator previews is what publishes.
export const CardPreview = styled.div`
  width: 281px;
  max-width: 100%;
`

export const UploadBtn = styled(Button)`
  align-self: flex-start;
`

export const ImportRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;

  input {
    flex: 1;
    min-width: 0;
  }
`

export const NameInput = styled.input`
  height: 44px;
  padding: 0 14px;
  border: 1px solid ${colors.lineStrong};
  border-radius: ${radius.btn};
  font: inherit;
  color: ${colors.text};

  &:focus {
    outline: 2px solid ${colors.accent};
    outline-offset: -1px;
  }
`

export const Selected = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

export const SelectedRow = styled.li`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};

  ${media.maxWidth('mobile')} {
    flex-wrap: wrap;
  }

  &[data-missing] {
    opacity: 0.6;
  }
`

const selThumb = css`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: ${colors.media};
  flex-shrink: 0;
`

export const SelThumb = styled.img`
  ${selThumb};
  object-fit: cover;
`

export const SelThumbEmpty = styled.span`
  ${selThumb};
  display: inline-block;
`

export const SelName = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// On a phone the row has no width to spare, so the pill wraps onto its own line (order pushes it past
// the price and the remove button) rather than squeezing the item name to nothing.
export const SelHint = styled.span`
  flex: none;
  padding: 2px 8px;
  border-radius: ${radius.pill};
  border: 1px solid ${colors.lineStrong};
  font-size: 11px;
  font-weight: 600;
  color: ${colors.muted};
  white-space: nowrap;

  ${media.maxWidth('mobile')} {
    order: 1;
    margin-left: 50px;
  }
`

export const SelPrice = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: ${colors.muted};
  white-space: nowrap;
`

export const SelTotal = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid ${colors.line};
  font-size: 13px;
  font-weight: 700;
`

export const SelTotalValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 700;
`

export const SelRemove = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  background: none;
  border-radius: 50%;
  color: ${colors.muted};
  cursor: pointer;

  &:hover {
    color: ${colors.errStrong};
    background: ${colors.panel};
  }
`

export const SaveBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid ${colors.line};
`

export const SaveActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`
