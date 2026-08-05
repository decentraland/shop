import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

/**
 * ONE component with two skins, because that is how the design models it — a single FAQs component with a
 * `mode` of Light or Dark. The two differ only in how they separate a row from its surface: on a light page
 * a translucent black fill is enough, over the credits backdrop each row needs a white outline as well.
 * Everything structural — 24px padding, the 50px closed pill, the 42px open shell, the 36px chevron, the
 * 20px type — is shared, so a change to the shape cannot land on one page and miss the other.
 *
 * `data-tone="on-dark"` carries the skin rather than a prop-per-rule: it keeps the two variants adjacent in
 * the CSS, which is what makes an accidental divergence visible while editing.
 */
export const Root = styled.section`
  display: flex;
  flex-direction: column;
  gap: 36px;
  font-family: ${theme.font.sans};

  &[data-tone='on-dark'] {
    align-items: center;
  }

  ${theme.media.maxWidth('mobile')} {
    gap: 24px;
  }
`

export const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.167;
  color: ${theme.colors.text2};

  [data-tone='on-dark'] & {
    font-size: 32px;
    color: ${theme.colors.white};
    text-align: center;
  }

  ${theme.media.maxWidth('mobile')} {
    font-size: 18px;

    [data-tone='on-dark'] & {
      font-size: 24px;
    }
  }
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
`

/**
 * The row shell. Closed it IS the pill; open it becomes the 42px-radius card that holds header + answer,
 * so the radius and the border live here and change with `data-open`.
 *
 * `overflow: hidden` only while open — the design clips the answer's corners into the shell. Applying it
 * unconditionally would have clipped nothing when closed but still created a containing block for no reason.
 */
export const Item = styled.div`
  border-radius: ${theme.radius.pill};

  &[data-open='true'] {
    border-radius: 42px;
    overflow: hidden;
    border: 0.5px solid ${theme.colors.text2};
  }

  [data-tone='on-dark'] &[data-open='true'] {
    background: rgba(0, 0, 0, 0.1);
    /* 1px when open, 0.5px closed — the design thickens the outline as the row takes over the page. */
    border: 1px solid ${theme.colors.white};
  }
`

/**
 * A real button, not a div with a click handler: this is the control that expands the answer, so it has to
 * be reachable by keyboard and announce its state. `aria-expanded` + `aria-controls` come from the component.
 */
export const Header = styled.button`
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 24px;
  border: none;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.05);
  font-family: inherit;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.43;
  /* Gray 0 closed, Soft Black 2 open: the question darkens as it becomes the heading of a section. */
  color: ${theme.colors.gray0};
  text-align: left;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease,
    color 120ms ease;

  &[data-open='true'] {
    color: ${theme.colors.text2};
    /* The header keeps square bottom corners while the answer sits under it. */
    border-radius: 42px 42px 0 0;
  }

  /* No hover variant exists for the light mode in the design, so this is the smallest honest reading of
     one: the same fill, a step darker. Inventing the dark mode's 3px white ring here would have put a
     border on a row that has none. */
  &:hover {
    background: rgba(0, 0, 0, 0.08);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.text2};
    outline-offset: 2px;
  }

  [data-tone='on-dark'] & {
    background: rgba(0, 0, 0, 0.1);
    border: 0.5px solid ${theme.colors.white};
    color: ${theme.colors.white};
  }

  /* On hover the dark skin deepens its fill and takes its outline from 0.5px to 3px.
     The extra 2.5px is an INSET SHADOW, not a fatter border. border-box keeps the outer box fixed, but
     height here is auto — content + padding + BORDER — so growing the border 0.5px → 3px added 5px of
     height and shoved every row below it down as the pointer crossed. A box-shadow takes no part in
     layout, so the stroke thickens inward from the same outer edge and nothing moves. (The pack cards
     hit this same trap and solve it with a masked pseudo-element; they need one because their stroke is a
     gradient, which a border cannot paint. This one is flat white, so the shadow is enough.)
     0.5 + 2.5 = the designed 3px. */
  [data-tone='on-dark'] &:hover {
    background: rgba(0, 0, 0, 0.3);
    box-shadow: inset 0 0 0 2.5px ${theme.colors.white};
  }

  /* border-color, not "border: none": dropping the border outright would take its 0.5px out of the
     height as well, so opening a row would nudge it by 1px on top of the answer appearing. The background
     paints under the border area (background-clip defaults to border-box), so the transparent hairline
     shows this header's own fill, not the shell behind it. */
  [data-tone='on-dark'] &[data-open='true'] {
    background: rgba(255, 255, 255, 0.2);
    border-color: transparent;
    box-shadow: none;
  }

  [data-tone='on-dark'] &:focus-visible {
    outline-color: ${theme.colors.white};
  }

  ${theme.media.maxWidth('mobile')} {
    padding: 16px;
    font-size: 16px;
  }
`

export const Question = styled.span`
  flex: 1 0 0;
  min-width: 0;
  /* The design sets the question nowrap at 1423px, where every one of them fits on a line. At the Shop's
     widths they do not, so wrapping is the faithful reading of the intent — a clipped question is not. */
  overflow-wrap: break-word;
`

/**
 * The chevron. It is the design's `majesticons:chevron-up-line` (a 3px round-capped stroke), NOT the
 * project's `chevron-down` — that one is a filled Material wedge, a different glyph at a different weight.
 * Exported from Figma and rotated 180° when closed, exactly as the design composes it, so one asset serves
 * both states. Under the mask system its stroke colour is irrelevant; it inherits the header's colour.
 */
export const Chevron = styled.span`
  flex-shrink: 0;
  display: flex;
  transition: transform 160ms ease;

  &[data-open='false'] {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const Answer = styled.div`
  padding: 32px 24px;
  border-radius: 0 0 12px 12px;
  font-size: 20px;
  font-weight: 400;
  line-height: 1.5;
  color: ${theme.colors.text2};
  /* The answers are authored as one string with a newline where the design breaks the line. Two <p>s with
     no margin between them render as two lines, which is what this is — keeping it one translatable string
     rather than splitting every answer into numbered halves. */
  white-space: pre-line;

  [data-tone='on-dark'] & {
    color: ${theme.colors.white};
  }

  ${theme.media.maxWidth('mobile')} {
    padding: 20px 16px;
    font-size: 16px;
  }
`
