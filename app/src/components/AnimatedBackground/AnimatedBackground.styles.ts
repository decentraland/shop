import styled from '@emotion/styled'

// Fills its positioned parent (the fitting-room stage). The static image is the fallback shown while
// WebGL boots — or the only thing shown if WebGL is unavailable / reduced-motion is on.
export const Root = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
`

export const Fallback = styled.div`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
`

export const Canvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
`
