import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, font, media, radius } = theme

/**
 * The nudge strip. Exported because the migration tool reuses the shell for its list header — which is
 * where the lilac fill belongs; the banner itself is amber (see Root).
 */
export const Shell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 12px 16px;
  border-radius: ${radius.btn};
  background: ${colors.promptLilac};
  font-family: ${font.sans};
`

// Amber, not lilac: this one sits at the top of a page as a standing "your prices need attention" notice,
// and the design gives that job the warm fill. The lilac strip inside the tool is a neutral section head.
export const Root = styled(Shell)`
  justify-content: space-between;
  background: ${colors.promptAmber};

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

  & .ico {
    flex: none;
    color: ${colors.text};
  }
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

/**
 * The MANA mark, against the word MANA inside the sentence.
 *
 * `1em`, not a pixel size: it is a currency mark reading as part of the running text, so it has to track
 * the sentence's font size rather than be set beside it. `-0.12em` puts its optical centre on the x-height
 * — a mark aligned on the baseline sits visibly high next to lowercase letters.
 *
 * The nbsp lives in the JSX, not in a margin: a plain gap would let the line break between the mark and the
 * word it belongs to, which is the one place this must never wrap.
 */
export const ManaMark = styled.img`
  width: 1em;
  height: 1em;
  vertical-align: -0.12em;
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
  /* The banner's own ink, not the accent purple: on the amber fill the link is the only thing to the
     right of the sentence, so it reads as the action without a colour of its own. */
  color: ${colors.text};

  &:hover {
    color: ${colors.gray0};
  }
  &:focus-visible {
    outline: 2px solid ${colors.text};
    outline-offset: 2px;
  }
`
