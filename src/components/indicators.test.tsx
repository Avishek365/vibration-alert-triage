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

  const threeHoursAgo = new Date(now.getTime() - 3 * 3_600_000).toISOString()
  const renderStatus = (overrides: Partial<MeasurementPoint>) => {
    const { container, unmount } = render(
      <SensorStatusIndicator point={point(overrides)} now={now} />,
    )
    const indicator = container.querySelector<HTMLElement>('[data-sensor]')!
    return { indicator, svg: indicator.querySelector('svg')?.innerHTML, unmount }
  }

  it('shows nothing visible for an online sensor, but keeps tooltip and screen-reader text', () => {
    const { indicator } = renderStatus({ sensorStatus: 'online' })
    expect(indicator.querySelector('svg')).toBeNull()
    expect(screen.getByText('Sensor online')).toHaveClass('sr-only')
    // The only text is screen-reader text.
    expect(indicator.textContent).toBe('Sensor online')
    expect(indicator.title).toMatch(/^Sensor online · Last reading /)
  })

  it.each<[Partial<MeasurementPoint>, string]>([
    [{ sensorStatus: 'stale', lastSeenAt: threeHoursAgo }, 'Stale 3h'],
    [{ sensorStatus: 'offline' }, 'Offline'],
  ])('shows a visible icon and label when not online: %o → %s', (overrides, label) => {
    const { indicator } = renderStatus(overrides)
    expect(indicator.querySelector('svg')).not.toBeNull()
    expect(indicator).toHaveTextContent(`Sensor ${label}`)
    expect(screen.getByText('Sensor')).toHaveClass('sr-only')
    expect(indicator.title).toMatch(new RegExp(`^Sensor ${overrides.sensorStatus} · Last reading `))
  })

  it('uses distinct icons for stale and offline', () => {
    const icons = (['stale', 'offline'] as const).map((sensorStatus) => {
      const { svg, unmount } = renderStatus({ sensorStatus })
      unmount()
      return svg
    })
    expect(new Set(icons).size).toBe(2)
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
