import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, gradients } = theme

const indeterminate = keyframes`
  0% { left: -40%; }
  100% { left: 100%; }
`
const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.88); opacity: 0.7; }
`

const packMd = '@media (max-width: 980px)'
const packSm = '@media (max-width: 520px)'
const successSm = '@media (max-width: 560px)'

export const Root = styled.div`
  max-width: 1320px;
  margin: 0 auto;
`

export const Head = styled.header`
  margin-bottom: 32px;
  max-width: 560px;
`

export const Title = styled.h1`
  font-size: 36px;
  line-height: 1.235;
  font-weight: 700;
  color: #171717;
  text-transform: capitalize;
  margin-bottom: 12px;
`

export const Sub = styled.p`
  margin: 0;
  font-size: 16px;
  line-height: 30px;
  color: ${colors.text2};
`

export const Learn = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: ${colors.accent};
  font-size: 14px;
  font-weight: 500;
  text-decoration: underline;

  &:hover {
    color: ${colors.brandViolet};
  }
`

export const LearnIco = styled.span`
  width: 13px;
  height: 13px;
`

export const Note = styled.p`
  margin: -8px 0 20px;
`

// The "redirecting to Stripe" spinner panel.
export const Redirect = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 48px 24px;
`

export const Packs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;

  ${packMd} {
    grid-template-columns: repeat(2, 1fr);
  }
  ${packSm} {
    grid-template-columns: 1fr;
  }
`

// Dark credit-pack card (Figma 1208-241919). The whole card is the <button>; Cta is a visual affordance.
export const Pack = styled.button`
  position: relative;
  display: block;
  padding: 4px;
  border: 0;
  background: transparent;
  border-radius: 24px;
  cursor: pointer;
  text-align: center;
  transition: transform 0.15s ease;

  &:hover {
    transform: translateY(-4px);
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
  &:hover [data-inner] {
    box-shadow: 0 18px 40px rgba(105, 31, 169, 0.4);
  }
  &[data-best] [data-inner] {
    box-shadow: 0 0 0 1px rgba(198, 64, 205, 0.5);
  }
  &:hover [data-cta] {
    filter: brightness(1.08);
  }
`

export const Inner = styled.span`
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #0c0223;
  border-radius: 20px;
  overflow: hidden;
  transition: box-shadow 0.15s ease;
`

export const Badge = styled.span`
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  background: linear-gradient(180deg, #ff2d55 0%, #c640cd 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  padding: 9px 16px;
  border-radius: 50px;
  white-space: nowrap;
  box-shadow: 0 8px 18px rgba(255, 45, 85, 0.35);
`

export const Label = styled.span`
  padding: 40px 16px 4px;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  text-transform: capitalize;
`

export const Art = styled.span`
  width: 100%;
  padding: 4px 12px 0;

  & img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 16px;
    filter: drop-shadow(6px 8px 16px rgba(0, 0, 0, 0.45));
  }
`

export const CtaWrap = styled.span`
  width: 100%;
  padding: 20px 24px 40px;
`

export const Cta = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  border-radius: 8px;
  background: ${gradients.amethyst};
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  transition: filter 0.15s ease;
`

/* Post-Stripe "completing purchase" screen. */
export const Processing = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 64px 24px;
  min-height: 42vh;
`

export const ProcessingLogo = styled.img`
  width: 61px;
  height: 61px;
  animation: ${pulse} 1.2s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const ProcessingBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`

export const ProcessingTitle = styled.p`
  margin: 0;
  font-size: 20px;
  line-height: 1.6;
  color: ${colors.text2};

  & strong {
    font-weight: 700;
  }
`

export const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

export const Track = styled.span`
  position: relative;
  width: 456px;
  max-width: 60vw;
  height: 12px;
  border-radius: 100px;
  background: ${colors.chip};
  overflow: hidden;
`

export const Fill = styled.span`
  position: absolute;
  top: 0;
  left: -40%;
  height: 100%;
  width: 40%;
  border-radius: 100px;
  background: ${gradients.amethyst};
  animation: ${indeterminate} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    left: 0;
    width: 30%;
    animation: none;
  }
`

export const Count = styled.span`
  font-size: 16px;
  line-height: 22px;
  color: ${colors.text2};
`

/* Success screen. */
export const Success = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 895px;
  margin: 0 auto;
`

export const Banner = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  border-radius: 16px;
  background: #e0f7e7;
  border: 1px solid #34ce77;

  ${successSm} {
    flex-direction: column;
    text-align: center;
  }
`

export const BannerIcon = styled.img`
  flex: none;
  width: 60px;
  height: 60px;
`

export const BannerText = styled.p`
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 20px;
  line-height: 1.334;
  color: ${colors.text2};

  & strong {
    font-weight: 700;
  }
`

export const Credits = styled.div`
  padding: 24px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #cfcdd4;
`

export const CreditsRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 109px;
  padding: 8px 24px 8px 150px;
  border-radius: 8px;
  background: #f4e9ff;

  ${successSm} {
    flex-direction: column;
    gap: 10px;
    padding: 120px 16px 16px;
  }
`

export const Coin = styled.img`
  position: absolute;
  left: 35px;
  top: 50%;
  transform: translateY(-50%);
  width: 93px;
  height: 93px;
  filter: drop-shadow(5px 7px 14px rgba(0, 0, 0, 0.17));

  ${successSm} {
    left: 50%;
    top: 16px;
    transform: translateX(-50%);
  }
`

export const CreditsText = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: ${colors.text};
`

export const Diamond = styled(CurrencyIcon)`
  width: 30px;
  height: 30px;
  color: ${colors.accent};
`

export const Amount = styled.strong`
  font-size: 24px;
  font-weight: 700;
  text-transform: capitalize;
`

export const Added = styled.span`
  font-size: 14px;
  font-weight: 400;
  color: ${colors.text};
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${successSm} {
    flex-direction: column;
  }
`

// data-variant='solid' | 'outline' — plain gradient/outline buttons (not the shared Button).
export const GcBtn = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  transition:
    background 0.15s ease,
    filter 0.15s ease;

  &[data-variant='solid'] {
    border: 0;
    background: ${colors.accent};
    color: ${colors.softWhite};
  }
  &[data-variant='solid']:hover {
    filter: brightness(1.08);
  }
  &[data-variant='outline'] {
    background: #fff;
    border: 2px solid ${colors.accent};
    color: ${colors.accent};
  }
  &[data-variant='outline']:hover {
    background: rgba(105, 31, 169, 0.06);
  }
`

// Neutral status panel reused by the "on the way" (pending) + error phases. data-err reddens the title.
export const Status = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px;
  text-align: center;

  &[data-err] [data-title] {
    color: ${colors.err};
  }
`

export const StatusTitle = styled.p`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
`

export const StatusActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;
`
