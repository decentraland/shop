import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, font, media, radius } = theme

/** The lilac nudge strip. Exported because the migration tool reuses the shell for its list header. */
export const Shell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 12px 16px;
  border-radius: ${radius.btn};
  background: ${colors.promptLilac};
  font-family: ${font.sans};
`

export const Root = styled(Shell)`
  justify-content: space-between;

  /* Side by side the sentence and the cta can't both fit a phone, so the cta drops to its own line. */
  ${media.maxWidth('mobile')} {
    flex-direction: column;
    align-items: flex-start;
  }
`

export const Body = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

export const Text = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.334;
  color: ${colors.text2};
`

export const Accent = styled.strong`
  font-weight: 700;
`

export const Cta = styled(Link)`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 12px;
  border-radius: ${radius.card};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: underline;
  color: ${colors.accent};

  &:hover {
    color: ${colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`
