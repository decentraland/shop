import { createRequire } from 'node:module'
import type { Page } from 'puppeteer'

const require = createRequire(import.meta.url)

type Violation = { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }

/**
 * Runs axe-core inside the page over the given selectors and returns the violations, each with the
 * elements it points at. The script is injected once per page.
 */
export async function axeViolations(page: Page, selectors: string[]): Promise<Violation[]> {
  const loaded = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined')
  if (!loaded) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  return page.evaluate(async (include: string[]) => {
    const axe = (
      window as unknown as {
        axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Violation[] }> }
      }
    ).axe
    const result = await axe.run(
      { include: include.map(selector => [selector]) },
      {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }
      }
    )
    return result.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map(n => ({ target: n.target }))
    }))
  }, selectors)
}

export function describeViolations(violations: Violation[]): string {
  return violations
    .map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
    .join('\n')
}
