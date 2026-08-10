import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// The browse layout (Root, Main, Sidebar, drawer chrome, Scrim) is shared with Collection, Creator
// and MyAssets. Re-exported here so Assets.tsx keeps its `S.Root`, `S.Sidebar` etc. unchanged.
export {
  Root,
  Main,
  Sidebar,
  SidebarScroll,
  Scrim,
  DrawerHead,
  DrawerTitle,
  CloseBtn,
  DrawerFoot,
  ShowItems
} from '~/styles/browseLayout.styles'

// Notice above the grid when the MANA oracle is down, so market-priced (legacy) cards can't be bought.
// data-variant='warn' is the red treatment.
export const MarketBanner = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${theme.colors.rarityBg};
  color: ${theme.colors.accent};
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 14px;
  font-weight: 600;
  font-size: 14px;

  &[data-variant='warn'] {
    background: rgba(211, 51, 51, 0.1);
    color: ${theme.colors.err};
  }
`
