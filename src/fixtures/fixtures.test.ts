import { CONFIDENCE_BANDS, confidenceBand } from '../domain/confidence'
import { assetHealth, assetStatus, sensorStatusFor, severityForReading } from '../domain/health'
import { describeEvidence, formatHz } from '../domain/format'
import { DISMISS_REASONS, FAULT_TYPES } from '../domain/types'
import { EVIDENCE_BANDS } from './alerts'
import { buildFixtures, buildTrend } from '.'
import { trendWindow } from '../domain/trend'
import { explainConfidence } from '../domain/confidence'
import { TECHNICIANS } from './alerts'

const now = new Date('2026-09-30T08:00:00Z')
const { sites, assets, alerts } = buildFixtures(now)

function expectUnique(ids: string[]) {
  expect(new Set(ids).size).toBe(ids.length)
}

it('is deterministic for a given time', () => {
  expect(buildFixtures(now)).toEqual(buildFixtures(now))
})

it('has unique ids', () => {
  expectUnique(sites.map((s) => s.id))
  expectUnique(assets.map((a) => a.id))
  expectUnique(assets.flatMap((a) => a.points.map((p) => p.id)))
  expectUnique(alerts.map((a) => a.id))
})

it('links every asset to a site and every alert to an asset and point', () => {
  const siteIds = new Set(sites.map((s) => s.id))
  for (const asset of assets) expect(siteIds).toContain(asset.siteId)

  for (const alert of alerts) {
    const asset = assets.find((a) => a.id === alert.assetId)
    expect(asset, alert.id).toBeDefined()
    expect(asset!.points.map((p) => p.id)).toContain(alert.pointId)
  }
})

describe('alerts', () => {
  it.each(alerts.map((a) => [a.id, a] as const))('%s severity matches its reading', (_, alert) => {
    expect(severityForReading(alert.reading, alert.thresholds)).toBe(alert.severity)
  })

  it('have confidence in [0, 1], a known fault type and at least one evidence item', () => {
    for (const alert of alerts) {
      expect(alert.confidence).toBeGreaterThanOrEqual(0)
      expect(alert.confidence).toBeLessThanOrEqual(1)
      expect(FAULT_TYPES).toContain(alert.faultType)
      expect(alert.evidence.length).toBeGreaterThan(0)
    }
  })

  it('include several low-confidence alerts, some still awaiting triage', () => {
    const low = alerts.filter((a) => a.confidence >= 0.4 && a.confidence <= 0.6)
    expect(low.length).toBeGreaterThanOrEqual(6)
    expect(low.filter((a) => a.status === 'new').length).toBeGreaterThanOrEqual(3)
  })

  it.each(CONFIDENCE_BANDS)('include at least 5 %s-confidence alerts', (band) => {
    expect(
      alerts.filter((a) => confidenceBand(a.confidence) === band).length,
    ).toBeGreaterThanOrEqual(5)
  })

  it('have evidence where the band exceeds baseline and lowHz < highHz', () => {
    for (const { evidence } of alerts) {
      for (const e of evidence) {
        expect(e.observed).toBeGreaterThan(e.baseline)
        expect(e.lowHz).toBeLessThan(e.highHz)
      }
    }
  })

  it('cover every status and severity', () => {
    expect(new Set(alerts.map((a) => a.status))).toEqual(
      new Set(['new', 'acknowledged', 'dismissed']),
    )
    expect(new Set(alerts.map((a) => a.severity))).toEqual(new Set(['critical', 'warning']))
  })

  it('use only fixed dismissal reasons, with a note whenever the reason is "other"', () => {
    for (const alert of alerts) {
      if (alert.status !== 'dismissed') continue
      expect(DISMISS_REASONS).toContain(alert.dismissReason)
      if (alert.dismissReason === 'other') expect(alert.dismissNote).toBeTruthy()
    }
  })

  it('are triggered in the past, and triaged after triggering', () => {
    for (const alert of alerts) {
      expect(alert.triggeredAt < now.toISOString()).toBe(true)
      if (alert.status === 'acknowledged')
        expect(alert.acknowledgedAt > alert.triggeredAt).toBe(true)
      if (alert.status === 'dismissed') expect(alert.dismissedAt > alert.triggeredAt).toBe(true)
    }
  })
})

describe('sensors', () => {
  const points = assets.flatMap((a) => a.points)

  it('have a sensor status consistent with last-seen time', () => {
    for (const p of points) expect(p.sensorStatus).toBe(sensorStatusFor(p.lastSeenAt, now))
  })

  it('include stale and offline sensors', () => {
    expect(points.some((p) => p.sensorStatus === 'stale')).toBe(true)
    expect(points.some((p) => p.sensorStatus === 'offline')).toBe(true)
  })
})

it('produces every health state across assets', () => {
  const states = new Set(assets.map((a) => assetHealth(a, alerts)))
  expect(states).toEqual(new Set(['critical', 'warning', 'healthy', 'unknown']))
})

it('includes a critical asset with an offline sensor, showing the two are independent', () => {
  const match = assets.find(
    (a) =>
      assetHealth(a, alerts) === 'critical' && a.points.some((p) => p.sensorStatus === 'offline'),
  )
  expect(match).toBeDefined()
})

describe('buildTrend', () => {
  const HOUR = 3_600_000
  const pointOf = (alert: (typeof alerts)[number]) =>
    assets.find((a) => a.id === alert.assetId)!.points.find((p) => p.id === alert.pointId)!

  it.each(alerts.map((a) => [a.id, a] as const))(
    '%s: hourly readings inside the window, including the alert reading',
    (_, alert) => {
      const point = pointOf(alert)
      const trend = buildTrend(alert, point, now)
      const { start, end } = trendWindow(alert.triggeredAt, now)
      expect(trend.windowStart).toBe(start.toISOString())
      expect(trend.windowEnd).toBe(end.toISOString())
      expect(trend.points.find((p) => p.at === alert.triggeredAt)?.value).toBe(alert.reading)

      const times = trend.points.map((p) => Date.parse(p.at))
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(start.getTime())
        expect(t).toBeLessThanOrEqual(
          Math.min(end.getTime(), Date.parse(point.lastSeenAt), now.getTime()) + 1,
        )
      }
      // Hourly steps, except a quiet sensor's final reading, which may be closer.
      for (let i = 1; i < times.length - 1; i++) expect(times[i] - times[i - 1]).toBe(HOUR)
      expect(trend.lastReadingAt).toBe(trend.points.at(-1)!.at)
    },
  )

  it('starts below the warning limit for recent alerts and is deterministic', () => {
    const alert = alerts[0]
    const trend = buildTrend(alert, pointOf(alert), now)
    expect(trend.points[0].value).toBeLessThan(alert.thresholds.warning)
    expect(buildTrend(alert, pointOf(alert), now)).toEqual(trend)
  })

  it('stops at the last reading when the sensor is quiet', () => {
    const quiet = alerts.filter((a) => pointOf(a).sensorStatus !== 'online')
    expect(quiet.length).toBeGreaterThan(0)
    for (const alert of quiet) {
      const point = pointOf(alert)
      const trend = buildTrend(alert, point, now)
      expect(trend.lastReadingAt).toBe(point.lastSeenAt)
      expect(trend.sensorStatus).toBe(point.sensorStatus)
    }
  })
})

it('never raises an alert after its sensor stopped reporting', () => {
  for (const alert of alerts) {
    const point = assets
      .find((a) => a.id === alert.assetId)!
      .points.find((p) => p.id === alert.pointId)!
    expect(alert.triggeredAt <= point.lastSeenAt).toBe(true)
  }
})

it('attributes triage actions to fictional technicians', () => {
  for (const alert of alerts) {
    if (alert.status === 'acknowledged') expect(TECHNICIANS).toContain(alert.acknowledgedBy)
    if (alert.status === 'dismissed') {
      expect(TECHNICIANS).toContain(alert.dismissedBy)
      if (alert.acknowledgedAt) expect(TECHNICIANS).toContain(alert.acknowledgedBy)
    }
  }
})

describe('evidence band labels', () => {
  // A unit (Hz/kHz) or a numeric span such as "2–10" or "1×–5×" means the label carries a range.
  const RANGE_IN_LABEL = /\d\s*k?Hz\b|\d×?\s*[–-]\s*\d/i

  it.each(
    Object.values(EVIDENCE_BANDS)
      .flat()
      .map((b) => [b.label]),
  )('"%s" does not contain a range', (label) => {
    expect(label).not.toMatch(RANGE_IN_LABEL)
  })

  it('no fixture evidence label contains its own range, which appears exactly once', () => {
    const all = alerts.flatMap((a) => a.evidence)
    expect(all.length).toBeGreaterThan(0)
    for (const e of all) {
      const low = formatHz(e.lowHz)
      const high = formatHz(e.highHz)
      expect(e.bandLabel).not.toMatch(RANGE_IN_LABEL)
      expect(e.bandLabel).not.toContain(low)
      expect(e.bandLabel).not.toContain(high)
      const [line] = describeEvidence([e])
      expect(line.startsWith(`${e.bandLabel} (${low}–${high}):`)).toBe(true)
      expect(line.split(low).length - 1).toBe(1)
    }
  })

  it('covers every band in the table', () => {
    const used = new Set(alerts.flatMap((a) => a.evidence.map((e) => e.bandLabel)))
    for (const band of Object.values(EVIDENCE_BANDS).flat()) expect(used).toContain(band.label)
  })
})

describe('special states and explanations', () => {
  const pointOf = (alert: (typeof alerts)[number]) =>
    assets.find((a) => a.id === alert.assetId)!.points.find((p) => p.id === alert.pointId)!

  it('includes a "model was wrong" correction', () => {
    expect(alerts.some((a) => a.status === 'dismissed' && a.dismissReason === 'model_wrong')).toBe(
      true,
    )
  })

  it('includes an open critical alert whose own sensor went offline', () => {
    const match = alerts.find(
      (a) =>
        a.severity === 'critical' &&
        a.status !== 'dismissed' &&
        pointOf(a).sensorStatus === 'offline',
    )
    expect(match).toBeDefined()
  })

  it('gives every alert below high confidence a different, less likely runner-up fault', () => {
    for (const alert of alerts) {
      if (alert.confidence >= 0.8) {
        expect(alert.alternativeFault).toBeUndefined()
        continue
      }
      expect(alert.alternativeFault!.faultType).not.toBe(alert.faultType)
      expect(alert.alternativeFault!.confidence).toBeLessThan(alert.confidence)
    }
  })

  it.each(alerts.map((a) => [a.id, a] as const))(
    '%s: has a plain-language explanation phrased as tendencies',
    (_, alert) => {
      const { heading, points } = explainConfidence(alert, pointOf(alert), now)
      expect(heading).toBeTruthy()
      expect(points.length).toBeGreaterThan(0)
      for (const p of points) {
        // Domain statements are tendencies; the sensor sentence is a plain fact.
        if (!p.startsWith('This sensor stopped')) expect(p).toMatch(/\b(often|typically)\b/)
        expect(p).not.toMatch(/\b(always|never|definitely|certainly)\b/i)
      }
    },
  )
})

describe('warning trends', () => {
  // The trend shifts with the clock, so check several viewing times.
  it.each([0, 5, 17, 29, 41, 60].map((h) => [h]))(
    'stay below the critical limit when viewed %s h later',
    (hoursLater) => {
      const viewedAt = new Date(now.getTime() + hoursLater * 3_600_000)
      const { assets: a, alerts: list } = buildFixtures(viewedAt)
      const warnings = list.filter((alert) => alert.severity === 'warning')
      expect(warnings.length).toBeGreaterThan(0)
      for (const alert of warnings) {
        const point = a
          .find((s) => s.id === alert.assetId)!
          .points.find((p) => p.id === alert.pointId)!
        for (const reading of buildTrend(alert, point, viewedAt).points) {
          expect(reading.value).toBeLessThan(alert.thresholds.critical)
        }
      }
    },
  )
})

describe('latest readings and health', () => {
  const summaries = assets.map((a) => ({ asset: a, ...assetStatus(a, alerts) }))

  it('match the last trend value on points with alerts, and stay normal elsewhere', () => {
    for (const asset of assets) {
      for (const point of asset.points) {
        const latest = alerts
          .filter((a) => a.pointId === point.id)
          .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]
        if (latest) {
          expect(point.latestReading).toBe(buildTrend(latest, point, now).points.at(-1)!.value)
        } else {
          expect(point.latestReading).toBeLessThan(point.thresholds.warning)
        }
      }
    }
  })

  it('never shows a machine as healthier than its readings', () => {
    for (const { asset, health } of summaries) {
      for (const point of asset.points) {
        const fromReading = severityForReading(point.latestReading, point.thresholds)
        const faulty = alerts.some(
          (a) =>
            a.pointId === point.id &&
            a.status === 'dismissed' &&
            a.dismissReason === 'sensor_fault',
        )
        if (fromReading && !faulty) {
          expect(['critical', 'warning'].indexOf(health)).toBeLessThanOrEqual(
            ['critical', 'warning'].indexOf(fromReading),
          )
          expect(health).not.toMatch(/healthy|unknown/)
        }
      }
    }
  })

  it('labels machines kept elevated after a dismissal', () => {
    const noted = summaries.filter((s) => s.note)
    expect(noted.map((s) => s.asset.name)).toEqual(
      expect.arrayContaining(['Raw water intake pump 2', 'White water pump']),
    )
    expect(summaries.find((s) => s.asset.name === 'White water pump')).toMatchObject({
      health: 'warning',
      note: 'in_maintenance',
    })
    expect(summaries.find((s) => s.asset.name === 'Raw water intake pump 2')).toMatchObject({
      note: 'dismissed_elevated',
    })
  })
})

describe('dismissal labels on fixture machines', () => {
  const byName = (name: string) => {
    const asset = assets.find((a) => a.name === name)!
    return {
      asset,
      status: assetStatus(asset, alerts),
      own: alerts.filter((a) => a.assetId === asset.id),
    }
  }

  it.each(['Kiln ID fan', 'Odour control fan', 'Calender gearbox'])(
    '%s: Critical from an open alert on one point, so no label for the dismissal on the other',
    (name) => {
      const { status, own } = byName(name)
      // The case only means something if both parts are present.
      expect(own.some((a) => a.status !== 'dismissed' && a.severity === 'critical')).toBe(true)
      expect(own.some((a) => a.status === 'dismissed')).toBe(true)
      const pointsWithOpenCritical = new Set(
        own
          .filter((a) => a.status !== 'dismissed' && a.severity === 'critical')
          .map((a) => a.pointId),
      )
      expect(
        own
          .filter((a) => a.status === 'dismissed')
          .every((a) => !pointsWithOpenCritical.has(a.pointId)),
      ).toBe(true)
      expect(status).toEqual({ health: 'critical' })
    },
  )

  it('keeps labels where the dismissed point alone sets the health', () => {
    expect(byName('White water pump').status).toEqual({ health: 'warning', note: 'in_maintenance' })
    expect(byName('Raw water intake pump 2').status).toEqual({
      health: 'warning',
      note: 'dismissed_elevated',
    })
  })
})

describe('trend stability', () => {
  // Regression: noise used to follow the order of draws from the window start, so
  // the same reading changed as the window slid (Raw mill motor: 9.02 vs 8.63).
  it.each(alerts.map((a) => [a.id, a] as const))(
    '%s: a reading at a given time is the same whenever the trend is viewed',
    (_, alert) => {
      const point = assets
        .find((a) => a.id === alert.assetId)!
        .points.find((p) => p.id === alert.pointId)!
      const values = new Map<string, number>()
      for (const hoursLater of [0, 0.5, 1, 2, 5, 13]) {
        const viewedAt = new Date(now.getTime() + hoursLater * 3_600_000)
        for (const p of buildTrend(alert, point, viewedAt).points) {
          if (values.has(p.at)) expect(p.value).toBe(values.get(p.at))
          else values.set(p.at, p.value)
        }
      }
    },
  )

  it("matches each point's latest reading to the detail trend's last reading, viewed later", () => {
    for (const hoursLater of [0, 0.5, 1, 2, 5]) {
      const viewedAt = new Date(now.getTime() + hoursLater * 3_600_000)
      for (const alert of alerts) {
        const point = assets
          .find((a) => a.id === alert.assetId)!
          .points.find((p) => p.id === alert.pointId)!
        const latestOnPoint = alerts
          .filter((a) => a.pointId === point.id)
          .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]
        if (latestOnPoint.id !== alert.id) continue
        const last = buildTrend(alert, point, viewedAt).points.at(-1)!
        if (last.at === buildTrend(alert, point, now).points.at(-1)!.at) {
          expect(last.value).toBe(point.latestReading)
        }
      }
    }
  })
})
