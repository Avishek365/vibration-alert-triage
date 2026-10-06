import { render, screen } from '@testing-library/react'
import { dismiss } from '../domain/alerts'
import type { Alert, DismissedAlert, MeasurementPoint } from '../domain/types'
import { CorrectionBanner, SensorQuietBanner } from './StateBanners'

const now = new Date('2026-09-30T08:00:00Z')
const thresholds = { warning: 4.5, critical: 7.1 }
const point: MeasurementPoint = {
  id: 'p1',
  name: 'Motor DE bearing',
  sensorStatus: 'offline',
  lastSeenAt: '2026-09-29T02:00:00.000Z',
  latestReading: 2,
  thresholds,
}
const alert: Alert = {
  id: 'al-1',
  assetId: 'a1',
  pointId: 'p1',
  severity: 'warning',
  faultType: 'imbalance',
  confidence: 0.41,
  evidence: [],
  reading: 5,
  thresholds,
  triggeredAt: '2026-09-29T00:00:00.000Z',
  status: 'new',
}

describe('SensorQuietBanner', () => {
  it.each([
    [8.1, 'The last reading, 8.10 mm/s, was above the critical limit.'],
    [5.2, 'The last reading, 5.20 mm/s, was above the warning limit.'],
    [3.1, 'The last reading, 3.10 mm/s, was below the warning limit.'],
  ])('states the last reading %s and where it sat against the limits', (value, sentence) => {
    render(
      <SensorQuietBanner point={point} thresholds={thresholds} lastReading={value} now={now} />,
    )
    expect(
      screen.getByRole('region', { name: 'Sensor stopped reporting 30 h ago' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/missing, not normal/)).toHaveTextContent(
      "The machine's current condition is unknown.",
    )
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  it('is neutral, not a health colour', () => {
    const { container } = render(
      <SensorQuietBanner point={point} thresholds={thresholds} lastReading={8.1} now={now} />,
    )
    expect(container.innerHTML).not.toMatch(/health-/)
  })
})

describe('CorrectionBanner', () => {
  const corrected = dismiss(
    alert,
    { reason: 'model_wrong' },
    new Date('2026-09-29T09:00:00Z'),
    'Tess Marrowby',
  ) as DismissedAlert

  it('reads as a correction recorded as feedback', () => {
    const { container } = render(<CorrectionBanner alert={corrected} />)
    expect(screen.getByRole('region', { name: 'Corrected by technician' })).toBeInTheDocument()
    expect(container).toHaveTextContent(
      'The model suggested imbalance (confidence 0.41). Tess Marrowby marked this as incorrect on',
    )
    expect(screen.getByText('Recorded as feedback on this alert.')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/improve the model/)
  })

  it('does not look like a failure', () => {
    const { container } = render(<CorrectionBanner alert={corrected} lastReading={8.1} />)
    expect(container.textContent).not.toMatch(/\b(error|fail(ed|ure)?|wrong)\b/i)
    expect(container.innerHTML).not.toMatch(/health-/)
  })

  it.each([
    [
      8.1,
      'Vibration is still above the critical limit. Dismissing this alert does not change the reading.',
    ],
    [
      5.2,
      'Vibration is still above the warning limit. Dismissing this alert does not change the reading.',
    ],
  ])('warns when the latest reading %s is still above a limit', (value, sentence) => {
    render(<CorrectionBanner alert={corrected} lastReading={value} />)
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  it.each([[3.1], [undefined]])('adds nothing when the latest reading is %s', (value) => {
    render(<CorrectionBanner alert={corrected} lastReading={value} />)
    expect(screen.queryByText(/still above/)).not.toBeInTheDocument()
  })

  it('says "You" for the current user', () => {
    const mine = dismiss(alert, { reason: 'model_wrong' }, now) as DismissedAlert
    render(<CorrectionBanner alert={mine} />)
    expect(screen.getByText(/You marked this as incorrect/)).toBeInTheDocument()
  })
})
