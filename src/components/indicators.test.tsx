import { render, screen } from '@testing-library/react'
import type { HealthState, MeasurementPoint } from '../domain/types'
import { ConfidenceMeter } from './ConfidenceMeter'
import { HealthIndicator } from './HealthIndicator'
import { SensorStatusIndicator } from './SensorStatusIndicator'

const now = new Date('2026-09-30T08:00:00Z')

/** Every class name in the rendered subtree. */
function classesIn(container: HTMLElement): string {
  return [container, ...container.querySelectorAll('*')]
    .map((el) => el.getAttribute('class') ?? '')
    .join(' ')
}

describe('HealthIndicator', () => {
  it.each<[HealthState, string]>([
    ['critical', 'Critical'],
    ['warning', 'Warning'],
    ['unknown', 'Unknown'],
    ['healthy', 'Healthy'],
  ])('labels %s with text', (state, label) => {
    render(<HealthIndicator state={state} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('pairs attention states with a shape', () => {
    const { container } = render(<HealthIndicator state="warning" />)
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('▲')
  })

  it('renders Healthy as a plain dot, not a filled pill', () => {
    const { container } = render(<HealthIndicator state="healthy" />)
    const indicator = container.querySelector('[data-health="healthy"]')!
    expect(indicator.className).not.toMatch(/\bbg-|rounded-sm|px-/)
    expect(indicator.querySelector('.rounded-full.bg-health-healthy-strong')).not.toBeNull()
  })

  it('shows a count when given', () => {
    render(<HealthIndicator state="critical" count={4} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})

describe('ConfidenceMeter', () => {
  it.each([
    [0.45, 'Low'],
    [0.7, 'Medium'],
    [0.93, 'High'],
  ])('shows %s as a labelled band plus the number', (value, label) => {
    render(<ConfidenceMeter confidence={value} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText(value.toFixed(2))).toBeInTheDocument()
  })

  it('never uses health colours or the accent', () => {
    for (const value of [0.45, 0.7, 0.93]) {
      const { container, unmount } = render(<ConfidenceMeter confidence={value} />)
      expect(classesIn(container)).not.toMatch(/health-|accent/)
      unmount()
    }
  })
})

describe('SensorStatusIndicator', () => {
  const point = (overrides: Partial<MeasurementPoint>): MeasurementPoint => ({
    id: 'p1',
    name: 'Motor DE bearing',
    sensorStatus: 'online',
    lastSeenAt: now.toISOString(),
    thresholds: { warning: 4.5, critical: 7.1 },
    ...overrides,
  })

  it('shows online quietly, with screen-reader text', () => {
    render(<SensorStatusIndicator point={point({})} now={now} />)
    expect(screen.getByText('Sensor online')).toHaveClass('sr-only')
  })

  it('shows stale with its age, and offline', () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 3_600_000).toISOString()
    const { rerender } = render(
      <SensorStatusIndicator
        point={point({ sensorStatus: 'stale', lastSeenAt: threeHoursAgo })}
        now={now}
      />,
    )
    expect(screen.getByText('Stale 3 h')).toBeVisible()
    rerender(<SensorStatusIndicator point={point({ sensorStatus: 'offline' })} now={now} />)
    expect(screen.getByText('Offline')).toBeVisible()
  })

  it('never uses health colours or the accent', () => {
    for (const sensorStatus of ['online', 'stale', 'offline'] as const) {
      const { container, unmount } = render(
        <SensorStatusIndicator point={point({ sensorStatus })} now={now} />,
      )
      expect(classesIn(container)).not.toMatch(/health-|accent/)
      unmount()
    }
  })
})
