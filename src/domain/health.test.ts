import { assetHealth, assetStatus, healthRank, sensorStatusFor, severityForReading } from './health'
import { dismiss } from './alerts'
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
    latestReading: 2,
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

describe('assetStatus: health never lower than the latest reading', () => {
  const dismissedAs = (reason: Parameters<typeof dismiss>[1]['reason']) =>
    dismiss(alert(), { reason, ...(reason === 'other' ? { note: 'Duplicate' } : {}) }, now)

  it.each([
    [4.49, 'healthy'],
    [4.5, 'warning'], // exactly at the warning limit
    [7.09, 'warning'],
    [7.1, 'critical'], // exactly at the critical limit
  ] as const)('a reading of %s mm/s with no alerts is %s', (latestReading, health) => {
    expect(assetStatus(asset([point({ latestReading })]), [])).toEqual({ health })
  })

  it.each([
    ['known_condition', 'known_condition'],
    ['maintenance_in_progress', 'in_maintenance'],
    ['model_wrong', 'dismissed_elevated'],
    ['other', 'dismissed_elevated'],
  ] as const)('dismissed as %s, still elevated: follows the reading, noted %s', (reason, note) => {
    const elevated = asset([point({ latestReading: 5.2 })])
    expect(assetStatus(elevated, [dismissedAs(reason)])).toEqual({ health: 'warning', note })
    const critical = asset([point({ latestReading: 7.1 })])
    expect(assetStatus(critical, [dismissedAs(reason)])).toEqual({ health: 'critical', note })
  })

  it.each(['known_condition', 'maintenance_in_progress', 'model_wrong', 'other'] as const)(
    'dismissed as %s, reading back below warning: healthy, no note',
    (reason) => {
      expect(assetStatus(asset([point({ latestReading: 3 })]), [dismissedAs(reason)])).toEqual({
        health: 'healthy',
      })
    },
  )

  it('dismissed as sensor_fault: unknown, and the untrusted reading is not counted', () => {
    for (const latestReading of [2, 5.2, 9]) {
      expect(assetStatus(asset([point({ latestReading })]), [dismissedAs('sensor_fault')])).toEqual(
        { health: 'unknown', note: 'sensor_fault' },
      )
    }
  })

  it('a sensor fault on one point does not hide a high reading on another', () => {
    const points = [point(), point({ id: 'p2', latestReading: 7.5 })]
    expect(assetStatus(asset(points), [dismissedAs('sensor_fault')]).health).toBe('critical')
  })

  it('an open alert counts even if the latest reading has dropped', () => {
    expect(
      assetHealth(asset([point({ latestReading: 2 })]), [alert({ severity: 'critical' })]),
    ).toBe('critical')
  })

  it('the reading wins when it is worse than the open alert', () => {
    expect(assetHealth(asset([point({ latestReading: 7.4 })]), [alert()])).toBe('critical')
  })

  it('an offline sensor is unknown unless its last reading is above a limit', () => {
    expect(assetHealth(asset([point({ sensorStatus: 'offline' })]), [])).toBe('unknown')
    expect(assetHealth(asset([point({ sensorStatus: 'offline', latestReading: 5 })]), [])).toBe(
      'warning',
    )
  })

  it('uses the most recent alert on a point to decide whether its reading is trusted', () => {
    const older = dismiss(
      alert({ id: 'old', triggeredAt: hoursAgo(10) }),
      { reason: 'sensor_fault' },
      now,
    )
    const newer = alert({
      id: 'new',
      triggeredAt: hoursAgo(1),
      status: 'acknowledged',
      acknowledgedAt: hoursAgo(0.5),
      acknowledgedBy: 'You',
    })
    expect(assetStatus(asset([point({ latestReading: 5.5 })]), [older, newer])).toEqual({
      health: 'warning',
    })
  })
})
