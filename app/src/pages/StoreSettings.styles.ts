import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import { Spinner } from '~/components/Spinner'

const { colors, radius, media } = theme

export const Loading = styled(Spinner)`
  padding: 64px 0;
`

export const SignInBtn = styled(Button)`
  align-self: center;
  min-width: 200px;
  margin-top: 8px;
`

// The store editor page. `data-signin` = the compact fully-centered signed-out prompt. Composes the
// global `.field*` form primitive (index.css); the label/textarea tweaks below target it as descendants.
export const Root = styled.section`
  max-width: 640px;
  margin: 0 auto;
  padding: 8px 0 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;

  &[data-signin] {
    min-height: 60vh;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 12px;
  }

  & .field__label {
    font-weight: 700;
    color: ${colors.text};
  }
  & textarea {
    background: #fff;
    border: 1px solid ${colors.lineStrong};
    border-radius: 8px;
    padding: 10px 12px;
    color: ${colors.text};
    font: inherit;
    resize: vertical;
    min-height: 88px;
  }
`

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`

export const Heading = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

export const Back = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.text};
  transition: color 0.15s linear;

  &:hover {
    color: ${colors.accent};
  }
  & .ico {
    width: 22px;
    height: 22px;
  }
`

export const Title = styled.h1`
  font-size: 24px;
  font-weight: 800;
`

export const Guest = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${colors.accent};
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
  & .ico {
    width: 15px;
    height: 15px;
  }
`

// Social inputs: a fixed, non-editable prefix chip glued to the input.
export const Prefixed = styled.div`
  display: flex;
  align-items: stretch;
  border: 1px solid ${colors.lineStrong};
  border-radius: 8px;
  overflow: hidden;
  background: #fff;

  & input {
    border: 0 !important;
    border-radius: 0 !important;
    flex: 1;
    min-width: 0;
  }
`

export const Prefix = styled.span`
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: rgba(0, 0, 0, 0.04);
  color: ${colors.muted};
  font-size: 13px;
  white-space: nowrap;
  border-right: 1px solid ${colors.lineStrong};
`

export const Picker = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
`

// Template / custom / upload tiles. `data-selected` accents the active one; `data-variant='upload'` is
// the dashed add-your-own tile.
export const Tile = styled.button`
  position: relative;
  padding: 0;
  border: 2px solid ${colors.lineStrong};
  border-radius: ${radius.card};
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: ${colors.media};
  cursor: pointer;

  & img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &[data-selected='true'] {
    border-color: ${colors.accent};
    box-shadow: 0 0 0 2px ${colors.accent};
  }
  &[data-selected='true']::after {
    content: '✓';
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: ${colors.accent};
    color: #fff;
    font-size: 13px;
    font-weight: 700;
  }

  &[data-variant='upload'] {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-style: dashed;
    color: ${colors.muted};
    font-size: 13px;
    font-weight: 700;
    background: #fff;
  }
  &[data-variant='upload'] .ico {
    width: 22px;
    height: 22px;
    background: ${colors.muted};
  }
  &[data-variant='upload']:hover {
    border-color: ${colors.accent};
    color: ${colors.accent};
  }
  &[data-variant='upload']:hover .ico {
    background: ${colors.accent};
  }
`

export const FileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`

export const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
`

export const SaveBtn = styled(Button)`
  min-width: 180px;

  ${media.maxWidth('mobile')} {
    width: 100%;
  }
`
