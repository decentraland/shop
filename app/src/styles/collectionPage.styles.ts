import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// Shared layout for the Collection + Creator storefront pages: a max-width wrapper and a breadcrumb row.
// Import as `import * as CP from '~/styles/collectionPage.styles'`.

export const Page = styled.div`
  max-width: 1721px;
  margin: 0 auto;
`

export const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${colors.muted};
  margin-bottom: 18px;
`

export const CrumbLink = styled.button`
  background: none;
  border: 0;
  padding: 0;
  color: ${colors.muted};
  cursor: pointer;

  &:hover {
    color: ${colors.text};
  }
`

export const CrumbCurrent = styled.span`
  color: ${colors.text};
`

// Creator → Collections view: a count bar mirroring the item grid's FilterBar spacing.
export const CollectionsBar = styled.div`
  display: flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: 16px;
`
