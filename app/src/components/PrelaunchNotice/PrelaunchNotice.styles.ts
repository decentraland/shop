import styled from '@emotion/styled'

// The same mark the Stripe hand-off pulses, so the two "hold on" moments look like one product.
import logo from '~/assets/credits/loader-logo.svg'

// Owns the whole viewport rather than sitting inside the page shell: the shell renders a NavBar and a footer
// full of links into a Shop that is closed, so this replaces it instead of living in it.
export const Wrapper = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 24px;
  text-align: center;
`

export const Logo = styled.div`
  width: 64px;
  height: 64px;
  background-image: url(${logo});
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  /* A slow breath rather than a spinner: nothing is loading, so a spinner would promise that waiting on this
     screen eventually resolves into something. */
  animation: prelaunch-breathe 3s ease-in-out infinite;

  @keyframes prelaunch-breathe {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(0.96);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 1;
  }
`

export const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
`

export const Body = styled.p`
  margin: 0;
  max-width: 42ch;
  opacity: 0.75;
  line-height: 1.5;
`

export const Hint = styled.p`
  margin: 0;
  max-width: 42ch;
  font-size: 13px;
  opacity: 0.55;
`
