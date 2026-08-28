import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { crumbGutter } from '~/styles/crumbs.styles'

const { colors } = theme

// Shared layout for the Collection + Creator storefront pages: a max-width wrapper and a breadcrumb row.
// Import as `import * as CP from '~/styles/collectionPage.styles'`.

export const Page = styled.div`
  max-width: 1721px;
  margin: 0 auto;
`

/* Dark-theme test: same crumb palette as ItemDetail's — gray-4 trail, white current page. */
export const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${colors.gray4};
  margin-bottom: 18px;
  ${crumbGutter};
`

export const CrumbLink = styled.button`
  background: none;
  border: 0;
  padding: 0;
  color: ${colors.gray4};
  cursor: pointer;

  &:hover {
    color: ${colors.white};
  }
`

export const CrumbCurrent = styled.span`
  color: ${colors.softWhite};
  font-weight: 600;
`

// Left column of the collection storefront: the creator identity card (whose avatar overhangs
// upward into the hero) above the filters. A collection holds few enough items that the column
// doesn't need to stick or scroll on its own — it flows with the page, which also keeps the
// avatar's overhang from being clipped by a scroll box.
export const SidebarCol = styled.div`
  flex: none;
  width: 265px;

  ${theme.media.maxWidth('lg')} {
    width: 100%;
  }
`

// Creator → Collections view: a count bar mirroring the item grid's FilterBar spacing.
export const CollectionsBar = styled.div`
  display: flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: 16px;
`

export const Count = styled.span`
  color: ${colors.softWhite};
  font-weight: 600;
`
