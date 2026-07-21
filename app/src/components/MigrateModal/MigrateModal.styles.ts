import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, gradients, radius } = theme

// The migrate progress modal. Composes the global `.modal*` chrome + `.spinner` + `.muted` (index.css);
// these styled parts are the migrate-specific additions.

// Applied alongside the global `modal` class: width + left-aligned stretch layout.
export const Modal = styled.div`
  width: min(460px, 94vw);
  text-align: left;
  align-items: stretch;
`

export const Progress = styled.div`
  height: 6px;
  border-radius: 999px;
  background: ${colors.line};
  overflow: hidden;
  margin: 6px 0 14px;
`

export const Bar = styled.div`
  height: 100%;
  width: 0;
  background: ${gradients.amethyst};
  border-radius: 999px;
  transition: width 0.45s ease;
`

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
`

export const Row = styled.li`
  display: grid;
  grid-template-columns: 34px 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  transition: background 0.2s;

  &[data-status='active'] {
    background: ${colors.rarityBg};
  }
  &[data-status='done'] {
    opacity: 0.75;
  }
  &[data-status='skipped'],
  &[data-status='failed'] {
    opacity: 0.6;
  }
`

export const Thumb = styled.span`
  width: 34px;
  height: 34px;
  border-radius: ${radius.btn};
  overflow: hidden;
  background: ${colors.media};
  display: grid;
  place-items: center;

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Name = styled.span`
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Price = styled.span`
  font-weight: 700;
  font-size: 13px;
  color: ${colors.text2};
`

export const Status = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: ${colors.accent};
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
  min-width: 74px;
`

export const Wait = styled.span`
  color: ${colors.muted2};
  font-weight: 600;
`

export const Skip = styled.span`
  color: ${colors.muted};
  font-weight: 600;
`

// Applied alongside the global `spinner` class: shrinks it to the inline status size.
export const Spin = styled.span`
  width: 14px;
  height: 14px;
  margin: 0;
  border-width: 2px;
`

export const Tick = styled.span`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${colors.ok};
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
`

export const Hint = styled.p`
  margin: 12px 0 0;
`
