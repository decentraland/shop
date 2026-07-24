import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors, radius } = theme

export const ConnectRow = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 12px;
`

export const ImportBanner = styled(Link)`
  display: flex;
  align-items: center;
  gap: 14px;
  text-decoration: none;
  color: ${colors.text};
  background: linear-gradient(100deg, rgba(165, 36, 179, 0.1), rgba(105, 31, 169, 0.06));
  border: 1px solid rgba(105, 31, 169, 0.22);
  border-radius: 14px;
  padding: 14px 18px;
  margin: 4px 0 22px;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;

  &:hover {
    box-shadow: 0 10px 26px rgba(105, 31, 169, 0.16);
    transform: translateY(-1px);
  }
`

export const BannerIco = styled.span`
  font-size: 26px;
`

export const BannerText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  & strong {
    font-size: 15px;
  }
`

export const BannerSub = styled.span`
  color: ${colors.muted};
  font-size: 13px;
`

export const BannerCta = styled.span`
  margin-left: auto;
  flex: none;
  background: ${colors.accent};
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 9px 18px;
  border-radius: 9px;
`

export const Section = styled.div`
  margin-bottom: 48px;
`

export const SectionHead = styled.div`
  margin-bottom: 18px;
`

export const SectionTitle = styled.h2`
  font-size: 22px;
  font-weight: 700;
  margin: 0;
`

export const SectionSub = styled.p`
  color: ${colors.muted};
  font-size: 14px;
  margin: 4px 0 0;
`

// Fixed 281px columns so every owned card matches the Collectibles-page card size.
export const AssetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, 281px);
  gap: 16px;
  margin-top: 20px;
  justify-content: start;

  @media (max-width: 640px) {
    grid-template-columns: repeat(auto-fill, minmax(0, 1fr));
  }
`

export const PublishGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 8px;
`

// Shared card shell for both the owned (asset) and created (publish) sections. Every rendered card
// is clickable: a transparent overlay button covers it, so hover lifts the card and the overlay owns
// the focus ring while inner action buttons stay above it.
const cardCss = css`
  background: #fff;
  border: 1px solid ${colors.line};
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;

  &:hover {
    box-shadow: 0 10px 26px rgba(20, 20, 30, 0.12);
    transform: translateY(-2px);
  }
  & > button:not([data-overlay]) {
    position: relative;
    z-index: 2;
  }
`
export const Card = styled.article`
  ${cardCss};
`

export const LinkOverlay = styled.button`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const CardImg = styled.div`
  aspect-ratio: 1;
  background: ${colors.media};
  border-radius: 8px;
  display: grid;
  place-items: center;
  overflow: hidden;

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const CardName = styled.div`
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// data-push pins the row to the bottom of the (created-item) card.
export const Listed = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  &[data-push] {
    margin-top: auto;
  }
`

// data-sm = the slightly smaller created-item price.
export const Price = styled.span`
  font-weight: 800;
  font-size: 16px;

  &[data-sm] {
    font-size: 15px;
  }
`

export const Badge = styled.span`
  font-size: 12px;
  color: ${colors.ok};
  border: 1px solid ${colors.ok};
  border-radius: 999px;
  padding: 3px 10px;
`

export const PublishMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`

// data-rarity = the accent rarity chip (vs the neutral default).
export const PublishChip = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  border-radius: ${radius.chip};
  padding: 3px 8px;
  background: ${colors.chip};
  color: #555;

  &[data-rarity] {
    background: ${colors.rarityBg};
    color: ${colors.rarity};
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
`

export const PublishSupply = styled.span`
  color: ${colors.muted};
  font-size: 12px;
`

export const PublishEmpty = styled.p`
  color: ${colors.muted};
  padding: 16px 0;
`

export const CreationsCollection = styled.div`
  margin-bottom: 26px;
`

export const CreationsName = styled.h3`
  font-size: 15px;
  font-weight: 700;
  color: ${colors.text2};
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${colors.line};
`

// `shimmer` is a global keyframe (index.css).
export const Skeleton = styled.div`
  min-height: 260px;
  border: 1px solid ${colors.line};
  border-radius: 12px;
  background: linear-gradient(100deg, #efeef2 30%, #e2e0e7 50%, #efeef2 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const RemoveBtn = styled(Button)`
  margin-top: 8px;
  width: 100%;
`

export const PublishCta = styled(Button)`
  margin-top: auto;
  width: 100%;
`
