import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatDayTime } from '../domain/format'
import { describeReading } from '../domain/trend'
import type { AlertTrend } from '../domain/types'
import { TrendChart } from './TrendChart'

const HOUR = 3_600_000
const end = Date.parse('2026-09-30T08:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const thresholds = { warning: 4.5, critical: 7.1 }
const values = [2, 2.2, 3.5, 5.1, 7.8]
const trend: AlertTrend = {
  points: values.map((value, i) => ({ at: iso(end - (values.length - 1 - i) * HOUR), value })),
  windowStart: iso(end - 48 * HOUR),
  windowEnd: iso(end),
  lastReadingAt: iso(end),
  sensorStatus: 'online',
}

function renderChart() {
  const user = userEvent.setup()
  const utils = render(
    <>
      <TrendChart
        trend={trend}
        thresholds={thresholds}
        triggeredAt={iso(end - HOUR)}
        descriptionId="desc"
      />
      <p id="desc">Trend description</p>
    </>,
  )
  return { user, ...utils, chart: screen.getByRole('group') }
}

const readout = (i: number) =>
  `${formatDayTime(trend.points[i].at)}: ${describeReading(trend.points[i].value, thresholds)}`

it('labels the warning and critical limits, with text tokens for labels and strong tokens for lines', () => {
  const { container } = renderChart()
  for (const [key, label] of [
    ['warning', 'Warning 4.50 mm/s'],
    ['critical', 'Critical 7.10 mm/s'],
  ]) {
    const text = container.querySelector(`[data-threshold-label="${key}"]`)!
    expect(text).toHaveTextContent(label)
    expect(text.getAttribute('class')).toContain(`fill-health-${key}-text`)
    const line = container.querySelector(`line[data-threshold="${key}"]`)!
    expect(line.getAttribute('class')).toContain(`stroke-health-${key}-strong`)
  }
  // Warning and critical lines also differ by dash pattern, not colour alone.
  const dashes = [...container.querySelectorAll('line[data-threshold]')].map((l) =>
    l.getAttribute('stroke-dasharray'),
  )
  expect(new Set(dashes).size).toBe(2)
})

it('draws the vibration line and alert marker in neutral colours', () => {
  const { container } = renderChart()
  expect(container.querySelector('path')!.getAttribute('class')).toBe('stroke-primary')
  const marker = container.querySelector('[data-marker="alert"]')!
  expect(marker).toHaveTextContent('Alert raised')
  expect(marker.innerHTML).not.toMatch(/health-/)
})

it('is described by the text summary', () => {
  const { chart } = renderChart()
  expect(chart).toHaveAccessibleDescription('Trend description')
  expect(chart).toHaveAttribute('tabindex', '0')
})

it('reads values with the arrow keys, Home and End', async () => {
  const { user, chart } = renderChart()
  await user.tab()
  expect(chart).toHaveFocus()
  // Focus starts on the latest reading.
  expect(screen.getByText(/Hover over the chart|mm\/s,/).closest('p')).toHaveTextContent(readout(4))

  await user.keyboard('{ArrowLeft}')
  expect(screen.getByText(formatDayTime(trend.points[3].at)).closest('p')).toHaveTextContent(
    readout(3),
  )
  await user.keyboard('{Home}')
  expect(screen.getByText(formatDayTime(trend.points[0].at)).closest('p')).toHaveTextContent(
    readout(0),
  )
  await user.keyboard('{ArrowLeft}')
  expect(screen.getByText(formatDayTime(trend.points[0].at)).closest('p')).toHaveTextContent(
    readout(0),
  )
  await user.keyboard('{End}')
  expect(screen.getByText(formatDayTime(trend.points[4].at)).closest('p')).toHaveTextContent(
    readout(4),
  )
})

it('announces readings politely', () => {
  renderChart()
  expect(screen.getByText(/Hover over the chart/).closest('p')).toHaveAttribute(
    'aria-live',
    'polite',
  )
})

it('fits narrow containers: fills the width, with fewer time labels', () => {
  const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
  try {
    const { container } = renderChart()
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '320')
    // 48 hours with a label every 12 h, instead of every 6 h on wider screens.
    const timeLabels = [...svg.querySelectorAll('text')].filter((t) =>
      /^\d{2}:\d{2}$|^\d{1,2} [A-Z][a-z]{2}$/.test(t.textContent ?? ''),
    )
    expect(timeLabels.length).toBeLessThanOrEqual(5)
  } finally {
    spy.mockRestore()
  }
})

it('stops the line at the last reading and labels the gap when the sensor went quiet', () => {
  const quiet: AlertTrend = {
    ...trend,
    sensorStatus: 'offline',
    lastReadingAt: trend.points.at(-1)!.at,
    windowEnd: iso(end + 20 * HOUR),
    windowStart: iso(end - 28 * HOUR),
  }
  const { container } = render(
    <TrendChart
      trend={quiet}
      thresholds={thresholds}
      triggeredAt={iso(end - HOUR)}
      descriptionId="d"
    />,
  )
  const gap = container.querySelector('[data-gap]')!
  expect(gap).toHaveTextContent(`No data since ${formatDayTime(quiet.lastReadingAt)}`)
  const rectX = Number(gap.querySelector('rect')!.getAttribute('x'))
  // The line's last point sits at the start of the gap: nothing is drawn through it.
  const lastX = Number(
    container.querySelector('path')!.getAttribute('d')!.split(/[ML]/).at(-1)!.split(',')[0],
  )
  expect(lastX).toBeCloseTo(rectX, 0)
  expect(gap.innerHTML).not.toMatch(/health-/)
})

it('shows no gap for an online sensor', () => {
  const { container } = renderChart()
  expect(container.querySelector('[data-gap]')).toBeNull()
})

/** x coordinates of every vertex of the data line. */
function lineXs(container: HTMLElement): number[] {
  const d = container.querySelector('path')!.getAttribute('d')!
  return [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]))
}

it('keeps limit labels in the right margin, outside the plot, with no halo', () => {
  const { container } = renderChart()
  const svg = container.querySelector('svg')!
  const plotRight =
    Math.max(
      ...[...svg.querySelectorAll('line[data-threshold]')].map((l) => Number(l.getAttribute('x2'))),
    ) - 4
  const labels = [...svg.querySelectorAll('[data-threshold-label]')]
  expect(labels).toHaveLength(2)
  for (const label of labels) {
    expect(Number(label.getAttribute('x'))).toBeGreaterThan(plotRight)
    expect(label).toHaveAttribute('text-anchor', 'start')
    // No halo: nothing painted around the text that could cover data.
    expect(label.hasAttribute('stroke-width')).toBe(false)
    expect(label.hasAttribute('paint-order')).toBe(false)
    expect(label.getAttribute('class')).not.toMatch(/stroke-/)
  }
  expect(labels.map((l) => l.textContent)).toEqual(['Critical 7.10 mm/s', 'Warning 4.50 mm/s'])
})

it('leaves the data line unbroken at the label positions', () => {
  const { container } = renderChart()
  const svg = container.querySelector('svg')!
  const d = svg.querySelector('path')!.getAttribute('d')!
  // One continuous path: a single move, then line segments only.
  expect(d.match(/M/g)).toHaveLength(1)
  expect(lineXs(container)).toHaveLength(trend.points.length)
  // Every label starts to the right of the line's furthest point, so none overlaps it.
  const lineEnd = Math.max(...lineXs(container))
  for (const label of svg.querySelectorAll('[data-threshold-label]')) {
    expect(Number(label.getAttribute('x'))).toBeGreaterThan(lineEnd)
  }
  // And no text inside the plot carries a halo over the line.
  const haloed = [...svg.querySelectorAll('text[paint-order]')]
  expect(haloed).toHaveLength(0)
})

it('keeps the two labels apart when the limits are close', () => {
  const close = { warning: 6.9, critical: 7.1 }
  const { container } = render(
    <TrendChart trend={trend} thresholds={close} triggeredAt={iso(end - HOUR)} descriptionId="d" />,
  )
  const [critical, warning] = ['critical', 'warning'].map((k) =>
    Number(container.querySelector(`[data-threshold-label="${k}"]`)!.getAttribute('y')),
  )
  expect(warning - critical).toBeGreaterThanOrEqual(28)
})

it('captions a narrow no-data gap under the chart instead of inside the plot', () => {
  const quiet: AlertTrend = {
    ...trend,
    sensorStatus: 'stale',
    lastReadingAt: trend.points.at(-1)!.at,
    windowEnd: iso(end + 3 * HOUR),
    windowStart: iso(end - 45 * HOUR),
  }
  const { container } = render(
    <TrendChart
      trend={quiet}
      thresholds={thresholds}
      triggeredAt={iso(end - HOUR)}
      descriptionId="d"
    />,
  )
  expect(container.querySelector('[data-gap] text')).toBeNull()
  expect(container.querySelector('[data-gap-caption]')).toHaveTextContent(
    `No data since ${formatDayTime(quiet.lastReadingAt)}`,
  )
})
