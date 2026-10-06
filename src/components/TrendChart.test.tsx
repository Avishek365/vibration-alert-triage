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

it('gives limit labels a wide white halo and draws them above everything else', async () => {
  const { container, user } = renderChart()
  await user.tab() // shows the crosshair and active marker
  const svg = container.querySelector('svg')!
  const labels = [...svg.querySelectorAll('[data-threshold-label]')]
  expect(labels).toHaveLength(2)
  for (const label of labels) {
    expect(label.getAttribute('class')).toContain('stroke-surface')
    expect(label).toHaveAttribute('paint-order', 'stroke')
    expect(Number(label.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(6)
  }
  // The labels are the last things painted, after the line, end dot and crosshair.
  const children = [...svg.children]
  const firstLabel = children.indexOf(labels[0])
  for (const el of [svg.querySelector('path'), svg.querySelector('[data-crosshair]')]) {
    expect(children.indexOf(el as Element)).toBeLessThan(firstLabel)
  }
  expect(children.slice(firstLabel).every((el) => el.hasAttribute('data-threshold-label'))).toBe(
    true,
  )
  // Limit lines sit beneath the data line.
  expect(children.indexOf(svg.querySelector('line[data-threshold]')!)).toBeLessThan(
    children.indexOf(svg.querySelector('path')!),
  )
})
