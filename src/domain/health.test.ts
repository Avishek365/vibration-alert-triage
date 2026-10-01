import { assetHealth, healthRank, sensorStatusFor, severityForReading } from './health'
import type { Alert, Asset, MeasurementPoint } from './types'

const thresholds = { warning: 4.5, critical: 7.1 }
const now = new Date('2026-09-30T08:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

function point(overrides: Partial<MeasurementPoint> = {}): MeasurementPoint {
  return {
    id: 'p1',
    name: 'Motor DE bearing',
    sensorStatus: 'online',
    lastSeenAt: hoursAgo(0.1),
    thresholds,
    ...overrides,
  }
}

function asset(points: MeasurementPoint[] = [point()]): Asset {
  return {
    id: 'a1',
    siteId: 's1',
    tag: 'T-1',
    name: 'Test motor',
    type: 'motor',
    runningSpeedRpm: 1490,
    points,
  }
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'al-1',
    assetId: 'a1',
    pointId: 'p1',
    severity: 'warning',
    faultType: 'imbalance',
    confidence: 0.8,
    evidence: [],
    reading: 5,
    thresholds,
    triggeredAt: hoursAgo(1),
    status: 'new',
    ...overrides,
  } as Alert
}

describe('severityForReading', () => {
  it.each([
    [4.49, null],
    [4.5, 'warning'],
    [7.09, 'warning'],
    [7.1, 'critical'],
  ])('%s mm/s is %s', (value, expected) => {
    expect(severityForReading(value, thresholds)).toBe(expected)
  })
})

describe('sensorStatusFor', () => {
  it.each([
    [0.5, 'online'],
    [1, 'stale'],
    [23.9, 'stale'],
    [24, 'offline'],
  ])('%s hours since last reading is %s', (hours, expected) => {
    expect(sensorStatusFor(hoursAgo(hours), now)).toBe(expected)
  })
})

describe('assetHealth', () => {
  it('is healthy with no alerts and sensors online', () => {
    expect(assetHealth(asset(), [])).toBe('healthy')
  })

  it('takes the worst open alert', () => {
    const alerts = [alert(), alert({ id: 'al-2', severity: 'critical' })]
    expect(assetHealth(asset(), alerts)).toBe('critical')
  })

  it('counts acknowledged alerts but ignores dismissed ones', () => {
    const alerts = [
      alert({ status: 'acknowledged', acknowledgedAt: hoursAgo(0.5) }),
      alert({
        id: 'al-2',
        severity: 'critical',
        status: 'dismissed',
        dismissedAt: hoursAgo(0.5),
        dismissReason: 'model_wrong',
      }),
    ]
    expect(assetHealth(asset(), alerts)).toBe('warning')
  })

  it('ignores alerts for other assets', () => {
    expect(assetHealth(asset(), [alert({ assetId: 'other' })])).toBe('healthy')
  })

  it('is unknown when a sensor is offline and there are no open alerts', () => {
    const points = [point(), point({ id: 'p2', sensorStatus: 'offline' })]
    expect(assetHealth(asset(points), [])).toBe('unknown')
  })

  it('stays healthy when a sensor is only stale', () => {
    expect(assetHealth(asset([point({ sensorStatus: 'stale' })]), [])).toBe('healthy')
  })

  it('reports an open alert even when a sensor is offline', () => {
    const points = [point({ sensorStatus: 'offline' })]
    expect(assetHealth(asset(points), [alert()])).toBe('warning')
  })
})

it('ranks unknown above healthy so it is never hidden', () => {
  expect(healthRank('unknown')).toBeGreaterThan(healthRank('healthy'))
  expect(healthRank('warning')).toBeGreaterThan(healthRank('unknown'))
})
