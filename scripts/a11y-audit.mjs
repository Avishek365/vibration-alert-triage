// Accessibility audit: runs axe-core in headless Chrome against the queue and
// detail screens, in the states that matter (expanded row, open lists, dialog,
// data table, special states), at desktop and phone widths.
//
// Usage: start the dev server (npm run dev), then `npm run audit:a11y`.
// Optional: A11Y_BASE_URL=http://localhost:5173 A11Y_JSON=out.json

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const AXE_PATH = require.resolve('axe-core/axe.min.js')
const BASE = process.env.A11Y_BASE_URL ?? 'http://localhost:5173'

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 375, height: 812 },
]

/** Each scenario loads a URL, optionally drives the UI, then waits for a selector. */
const SCENARIOS = [
  { name: 'Queue', url: '/', ready: 'ul[aria-label="Alerts"] > li' },
  {
    name: 'Queue: machine list open',
    url: '/',
    ready: 'ul[aria-label="Alerts"] > li',
    act: async (page) => {
      await page.getByRole('button', { name: /^Warning \d+ machines$/ }).click()
      await page.getByRole('region', { name: 'Warning machines' }).waitFor()
    },
  },
  {
    name: 'Queue: dismiss dialog, Other chosen',
    url: '/',
    ready: 'ul[aria-label="Alerts"] > li',
    act: async (page) => {
      await page.locator('ul[aria-label="Alerts"] > li').first().focus()
      await page.keyboard.press('d')
      await page.getByRole('dialog').waitFor()
      await page.keyboard.press('5')
    },
  },
  {
    name: 'Queue: filtered, empty',
    url: '/?severity=critical&confidence=low',
    ready: 'text=No alerts match these filters',
  },
  { name: 'Queue: load error', url: '/', ready: '[role="alert"]', failApi: 'listAlerts' },
  { name: 'Detail', url: '/?alert=al-005', ready: '[aria-roledescription="chart"]' },
  {
    name: 'Detail: data table open',
    url: '/?alert=al-005',
    ready: '[aria-roledescription="chart"]',
    act: async (page) => {
      await page.getByRole('button', { name: 'Show data table' }).click()
      await page.getByRole('region', { name: 'Vibration readings' }).waitFor()
      await page.locator('[aria-roledescription="chart"]').focus()
      await page.keyboard.press('ArrowLeft')
    },
  },
  { name: 'Detail: sensor went quiet', url: '/?alert=al-026', ready: '[data-gap]' },
  { name: 'Detail: model was wrong', url: '/?alert=al-015', ready: 'text=Corrected by technician' },
  { name: 'Detail: not found', url: '/?alert=al-999', ready: 'text=Alert not found' },
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
/** Checks axe could not decide automatically ("needs review"). */
const review = []

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    for (const scenario of SCENARIOS) {
      const page = await context.newPage()
      if (scenario.failApi) {
        // Make the mock API fail for this page only, before the app loads.
        await page.addInitScript((op) => {
          window.__A11Y_FAIL__ = op
        }, scenario.failApi)
      }
      await page.goto(BASE + scenario.url)
      await page.locator(scenario.ready).first().waitFor({ timeout: 10_000 })
      if (scenario.act) await scenario.act(page)
      await page.addScriptTag({ path: AXE_PATH })
      const { violations, incomplete } = await page.evaluate(() =>
        window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
          },
        }),
      )
      for (const v of incomplete) {
        review.push({
          viewport: viewport.name,
          scenario: scenario.name,
          id: v.id,
          nodes: v.nodes.length,
        })
      }
      for (const v of violations) {
        results.push({
          viewport: viewport.name,
          scenario: scenario.name,
          id: v.id,
          impact: v.impact,
          help: v.help,
          targets: v.nodes.map((n) => n.target.join(' ')),
          summary: v.nodes[0]?.failureSummary?.split('\n').slice(0, 3).join(' ') ?? '',
        })
      }
      await page.close()
    }
    await context.close()
  }
} finally {
  await browser.close()
}

if (process.env.A11Y_JSON) writeFileSync(process.env.A11Y_JSON, JSON.stringify(results, null, 2))

const nodeCount = results.reduce((n, r) => n + r.targets.length, 0)
const byRule = new Map()
for (const r of results) {
  const entry = byRule.get(r.id) ?? { impact: r.impact, help: r.help, nodes: 0, where: new Set() }
  entry.nodes += r.targets.length
  entry.where.add(`${r.scenario} (${r.viewport})`)
  byRule.set(r.id, entry)
}

console.log(
  `\naxe: ${byRule.size} rules violated, ${nodeCount} elements, ${results.length} rule/page pairs`,
)
const reviewByRule = new Map()
for (const r of review) reviewByRule.set(r.id, (reviewByRule.get(r.id) ?? 0) + r.nodes)
console.log(
  `needs review: ${[...reviewByRule].map(([id, n]) => `${id} ${n}`).join(', ') || 'none'}`,
)
for (const [id, e] of byRule) {
  console.log(`\n[${e.impact}] ${id}: ${e.help} (${e.nodes} elements)`)
  for (const w of e.where) console.log(`   - ${w}`)
}
for (const r of results) {
  console.log(
    `\n${r.scenario} (${r.viewport}) ${r.id}\n   ${r.targets.slice(0, 4).join('\n   ')}\n   ${r.summary}`,
  )
}
process.exitCode = results.length ? 1 : 0
