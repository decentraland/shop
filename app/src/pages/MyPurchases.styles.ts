import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors } = theme

export const Root = styled.section``

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
`

export const Count = styled.span`
  color: ${colors.muted};
  font-size: 14px;
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 760px;
`

// A purchase row — rendered as a <Link> (detail URL) or a plain <div>; only the anchor hovers.
const rowCss = css`
  display: grid;
  grid-template-columns: 56px 1fr auto auto;
  align-items: center;
  gap: 16px;
  background: #fff;
  border: 1px solid ${colors.line};
  border-radius: 14px;
  padding: 12px 16px;
  text-decoration: none;
  color: ${colors.text};
  transition:
    box-shadow 0.15s,
    transform 0.15s;

  a&:hover {
    box-shadow: 0 8px 22px rgba(20, 20, 30, 0.1);
    transform: translateY(-1px);
  }
`
export const Row = styled(Link)`
  ${rowCss};
`
export const RowStatic = styled.div`
  ${rowCss};
`

export const Thumb = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 10px;
  background: ${colors.media};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Info = styled.div`
  min-width: 0;
`

export const Name = styled.div`
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Date = styled.div`
  font-size: 13px;
  margin-top: 2px;
`

// data-status='done' | 'pending'
export const Badge = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;

  &[data-status='done'] {
    background: rgba(46, 160, 90, 0.14);
    color: ${colors.okStrong};
  }
  &[data-status='pending'] {
    background: rgba(245, 166, 35, 0.16);
    color: #b5790a;
  }
`

export const Price = styled.div`
  font-weight: 800;
  white-space: nowrap;
`

// `shimmer` is a global keyframe (index.css).
export const Skeleton = styled.div`
  display: block;
  height: 82px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: linear-gradient(100deg, #ededed 30%, #f7f7f7 50%, #ededed 70%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;
`

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 90px 20px;
  min-height: 50vh;
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 6px 0 0;
`

export const EmptyCta = styled(Button)`
  margin-top: 12px;
`
