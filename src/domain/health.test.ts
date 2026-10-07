import {
  assetHealth,
  assetStatus,
  healthDriver,
  healthRank,
  sensorStatusFor,
  severityForReading,
} from './health'
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

describe('assetStatus: a dismissal label only when the dismissed point sets the health', () => {
  const p1 = (o: Partial<MeasurementPoint> = {}) => point({ id: 'p1', ...o })
  const p2 = (o: Partial<MeasurementPoint> = {}) =>
    point({ id: 'p2', name: 'Motor NDE bearing', ...o })
  const dismissedOn = (pointId: string, reason: Parameters<typeof dismiss>[1]['reason']) =>
    dismiss(alert({ id: `d-${pointId}`, pointId }), { reason, note: 'x' }, now)
  const openOn = (pointId: string, severity: 'warning' | 'critical') =>
    alert({ id: `o-${pointId}`, pointId, severity, triggeredAt: hoursAgo(0.5) })

  it('dismissed-and-elevated on one point, open critical on another: Critical, no label', () => {
    const machine = asset([p1({ latestReading: 5.2 }), p2({ latestReading: 8 })])
    expect(
      assetStatus(machine, [dismissedOn('p1', 'model_wrong'), openOn('p2', 'critical')]),
    ).toEqual({
      health: 'critical',
    })
  })

  it('no label when an open alert elsewhere reaches the same level as the dismissed reading', () => {
    const machine = asset([p1({ latestReading: 7.5 }), p2({ latestReading: 8 })])
    expect(
      assetStatus(machine, [dismissedOn('p1', 'known_condition'), openOn('p2', 'critical')]),
    ).toEqual({
      health: 'critical',
    })
  })

  it('no label when a newer open alert on the same point sets the level', () => {
    const older = dismiss(
      alert({ id: 'old', triggeredAt: hoursAgo(10) }),
      { reason: 'model_wrong' },
      now,
    )
    const newer = alert({ id: 'new', triggeredAt: hoursAgo(1) })
    expect(assetStatus(asset([p1({ latestReading: 5 })]), [older, newer])).toEqual({
      health: 'warning',
    })
  })

  it('label when the dismissed point alone sets the level, even with a lower open alert elsewhere', () => {
    const machine = asset([p1({ latestReading: 7.4 }), p2({ latestReading: 5 })])
    expect(
      assetStatus(machine, [dismissedOn('p1', 'maintenance_in_progress'), openOn('p2', 'warning')]),
    ).toEqual({
      health: 'critical',
      note: 'in_maintenance',
    })
  })

  it('"Sensor fault reported" only as the single reason for Unknown', () => {
    // Alone: the one reason.
    expect(assetStatus(asset([p1()]), [dismissedOn('p1', 'sensor_fault')])).toEqual({
      health: 'unknown',
      note: 'sensor_fault',
    })
    // Another point is open warning: Warning, no label.
    expect(
      assetStatus(asset([p1(), p2({ latestReading: 5 })]), [
        dismissedOn('p1', 'sensor_fault'),
        openOn('p2', 'warning'),
      ]),
    ).toEqual({ health: 'warning' })
    // Another point is offline, so Unknown has a second cause: no label.
    expect(
      assetStatus(asset([p1(), p2({ sensorStatus: 'offline' })]), [
        dismissedOn('p1', 'sensor_fault'),
      ]),
    ).toEqual({ health: 'unknown' })
  })

  it('never stacks labels: two dismissed points setting the level give one label', () => {
    const machine = asset([p1({ latestReading: 5 }), p2({ latestReading: 5.5 })])
    const result = assetStatus(machine, [
      dismissedOn('p1', 'known_condition'),
      dismissedOn('p2', 'model_wrong'),
    ])
    expect(result.health).toBe('warning')
    expect(typeof result.note).toBe('string')
  })
})

describe('healthDriver', () => {
  const p1 = (o: Partial<MeasurementPoint> = {}) => point({ id: 'p1', ...o })
  const p2 = (o: Partial<MeasurementPoint> = {}) => point({ id: 'p2', ...o })

  it('is undefined for a healthy machine', () => {
    expect(healthDriver(asset([p1()]), [])).toBeUndefined()
  })

  it('names an open alert when the reading is below that limit', () => {
    expect(
      healthDriver(asset([p1({ latestReading: 6.5 })]), [alert({ severity: 'critical' })]),
    ).toEqual({
      pointId: 'p1',
      cause: 'alert',
    })
  })

  it('names the reading when it reaches the level, even with an open alert', () => {
    expect(
      healthDriver(asset([p1({ latestReading: 7.3 })]), [alert({ severity: 'critical' })]),
    ).toEqual({
      pointId: 'p1',
      cause: 'reading',
    })
  })

  it('names an offline sensor or a sensor fault for Unknown', () => {
    expect(healthDriver(asset([p1({ sensorStatus: 'offline' })]), [])).toEqual({
      pointId: 'p1',
      cause: 'offline',
    })
    const faulty = dismiss(alert(), { reason: 'sensor_fault' }, now)
    expect(healthDriver(asset([p1()]), [faulty])).toEqual({ pointId: 'p1', cause: 'sensor_fault' })
  })

  it('picks the setter whose reading is highest against its critical limit', () => {
    const machine = asset([p1({ latestReading: 7.2 }), p2({ latestReading: 9 })])
    expect(healthDriver(machine, [])).toEqual({ pointId: 'p2', cause: 'reading' })
  })
})
