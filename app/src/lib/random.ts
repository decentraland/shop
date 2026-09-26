/**
 * A random number inside an inclusive-ish range, written as a pair so a caller can name the range as a
 * constant and read it back at the call site.
 *
 * Shared by the seasonal decorations, which each pick delays, sizes and distances this way.
 */
export function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min)
}
