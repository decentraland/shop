import type { SVGProps } from 'react'

// The "try in world" arrow: a ruby rounded-square plate with a translucent white hairline and a white
// arrow. Multi-colour, so it ships as a component rather than through the currentColor mask system.
export function JumpInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden {...props}>
      <rect width="32.0012" height="32.0012" rx="8" fill="#FF2D55" />
      <rect
        x="1.2632"
        y="1.2632"
        width="29.4748"
        height="29.4748"
        rx="6.7368"
        stroke="#FCFCFC"
        strokeOpacity="0.5"
        strokeWidth="2.52641"
      />
      <path
        d="M27.3021 14.4254L19.4245 6.55186C18.0203 5.14831 15.657 6.14106 15.657 8.12658V10.7283C15.5885 10.7283 15.5543 10.7283 15.4858 10.7283H8.01351C6.74626 10.7283 5.71875 11.721 5.71875 12.9877V18.9784C5.71875 20.2451 6.74626 21.272 8.01351 21.272H15.4515C15.52 21.272 15.5543 21.272 15.6228 21.272V23.8738C15.6228 25.8593 18.0203 26.852 19.3903 25.4485L27.2678 17.5749C28.1583 16.6848 28.1583 15.2813 27.3021 14.4254Z"
        fill="#FCFCFC"
      />
    </svg>
  )
}
