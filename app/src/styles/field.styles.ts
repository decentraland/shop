import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// The square checkbox the designs use: a thin translucent outline that fills with brand purple when
// ticked. `--box` sets the VISIBLE square and everything else derives from it, because the design draws
// the border width, corner radius and hit area as fixed fractions of the box at every size — the 1/9
// and 2/3 ratios below hold for both the 13.71px and 17.14px variants.
export const Checkbox = styled.input`
  --box: 17.143px;
  position: relative;
  appearance: none;
  flex: none;
  margin: 0;
  width: var(--box);
  height: var(--box);
  border: calc(var(--box) / 9) solid ${colors.textSecondary};
  border-radius: calc(var(--box) / 9);
  background: ${colors.white};
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  /* The visible square is well under a comfortable tap target, so the hit area is grown past it. */
  &::after {
    content: '';
    position: absolute;
    inset: calc(var(--box) * -2 / 3);
  }

  &:checked,
  &[data-indeterminate='true'] {
    background: ${colors.accent};
    border-color: ${colors.accent};
  }
  &:checked::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(var(--box) * 0.5);
    height: calc(var(--box) * 0.26);
    border: solid ${colors.white};
    border-width: 0 0 calc(var(--box) / 9) calc(var(--box) / 9);
    transform: translate(-50%, -68%) rotate(-45deg);
  }
  /* Partial selection reads as a dash, and must win over the tick if both somehow apply. */
  &[data-indeterminate='true']::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(var(--box) * 0.58);
    height: calc(var(--box) / 9);
    border: 0;
    background: ${colors.white};
    transform: translate(-50%, -50%);
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

// A form field (label + control). Render as a <label> via `as="label"` when wrapping an input.
export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;

  & input {
    background: ${colors.white};
    border: 1px solid ${colors.lineStrong};
    border-radius: 8px;
    padding: 10px 12px;
    color: ${colors.text};
    font: inherit;
  }
`
