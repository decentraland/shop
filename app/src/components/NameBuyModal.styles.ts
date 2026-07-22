import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Buy-NAME modal (Figma: available 1368-354539, confirm 1368-354579, completing 1368-354623,
// success 1368-354667). A single dialog that walks confirm → completing → success/error, mirroring
// the shop's existing checkout modal but with the NAME-specific "re-enter to confirm" gate.

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
  width: 560px;
  max-width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  background: ${theme.colors.white};
  border-radius: 16px;
  padding: 20px 24px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);

  ${theme.media.down('mobile')} {
    padding: 16px;
  }
`

export const HeadRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`

export const Title = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 22px;
  line-height: 1.2;
  color: ${theme.colors.text};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${theme.colors.text};

  .ico {
    width: 18px;
    height: 18px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const Balance = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.text2};

  .ico {
    width: 16px;
    height: 16px;
    color: ${theme.colors.brandViolet};
  }
`

export const Divider = styled.hr`
  border: 0;
  border-top: 1px solid ${theme.colors.line};
  margin: 16px 0;
`

// The selected NAME summary row (thumb + name + subtitle + price).
export const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`

export const Thumb = styled.div`
  flex: none;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  background: ${theme.gradients.amethyst};
  color: ${theme.colors.white};

  .ico {
    width: 30px;
    height: 30px;
  }
`

export const NameMeta = styled.div`
  flex: 1;
  min-width: 0;
`

export const NameText = styled.div`
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 20px;
  line-height: 1.3;
  color: ${theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  span {
    font-weight: 400;
    color: ${theme.colors.muted2};
  }
`

export const NameSub = styled.div`
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.muted2};
`

export const RowPrice = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 24px;
  color: ${theme.colors.text};

  .ico {
    width: 22px;
    height: 22px;
    color: ${theme.colors.brandViolet};
  }
`

// Lavender confirm panel.
export const Confirm = styled.div`
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: #f2e7fc;
`

export const ConfirmTitle = styled.div`
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 16px;
  color: ${theme.colors.text};
`

export const ConfirmBody = styled.p`
  margin: 8px 0 16px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.5;
  color: ${theme.colors.text2};

  b {
    font-weight: 700;
    color: ${theme.colors.brandViolet};
  }
`

export const ReenterRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.text};
  border-radius: 10px;
  cursor: text;

  &:focus-within {
    border-color: ${theme.colors.magenta};
  }
`

export const ReenterAt = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 18px;
  color: ${theme.colors.muted2};
`

export const ReenterInput = styled.input`
  flex: 0 1 auto;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-family: ${theme.font.sans};
  font-size: 16px;
  font-weight: 600;
  color: ${theme.colors.text};

  &::placeholder {
    color: #a09ba8;
    font-weight: 400;
  }
`

export const ReenterSuffix = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 16px;
  color: ${theme.colors.muted2};
`

// Full-width primary action.
export const PrimaryBtn = styled.button`
  margin-top: 16px;
  width: 100%;
  height: 52px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  background: ${theme.gradients.amethyst};
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: not-allowed;
    background: #ddc7ec;
    color: #f4ecfa;
  }
`

// Processing (completing) state.
export const Processing = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
  padding: 32px 0 8px;
`

export const Logo = styled.img`
  align-self: center;
  width: 56px;
  height: 56px;
`

export const ProcessingText = styled.div`
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 18px;
  color: ${theme.colors.text};
`

export const ProgressRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
`

export const Progress = styled.div`
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: ${theme.colors.chip};
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    width: 40%;
    border-radius: 999px;
    background: ${theme.gradients.amethyst};
    animation: nameProgress 1.1s ease-in-out infinite;
  }

  @keyframes nameProgress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(320%);
    }
  }
`

export const ProgressCount = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.muted};
`

// Success banner.
export const SuccessBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  border-radius: 12px;
  background: #e2f5ea;
  text-align: center;
`

export const SuccessCheck = styled.div`
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${theme.colors.ok};
  color: ${theme.colors.white};

  .ico {
    width: 30px;
    height: 30px;
  }
`

export const SuccessText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 16px;
  line-height: 1.4;
  color: ${theme.colors.text};

  b {
    font-weight: 700;
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 20px;

  ${theme.media.down('mobile')} {
    flex-direction: column;
  }
`

export const OutlineBtn = styled.button`
  flex: 1;
  height: 48px;
  border: 1px solid ${theme.colors.accent};
  border-radius: 8px;
  background: ${theme.colors.white};
  color: ${theme.colors.accent};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover {
    background: rgba(105, 31, 169, 0.06);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const RubyBtn = styled.a`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  border-radius: 8px;
  background: ${theme.colors.dclRed};
  color: ${theme.colors.softWhite};
  cursor: pointer;
  text-decoration: none;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover {
    filter: brightness(1.05);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// Error state.
export const ErrorBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  margin-top: 8px;
  border-radius: 12px;
  background: rgba(255, 45, 85, 0.1);
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.5;
  color: ${theme.colors.text};

  .ico {
    width: 22px;
    height: 22px;
    flex: none;
    color: ${theme.colors.dclRed};
  }
`
