import { CONFIDENCE_BANDS, confidenceBand } from '../domain/confidence'
import { assetHealth, sensorStatusFor, severityForReading } from '../domain/health'
import { describeEvidence, formatHz } from '../domain/format'
import { DISMISS_REASONS, FAULT_TYPES } from '../domain/types'
import { EVIDENCE_BANDS } from './alerts'
import { buildFixtures, buildTrend } from '.'
import { TREND_POINTS } from './trends'

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
  const alert = alerts[0]
  const trend = buildTrend(alert)

  it('has hourly points ending at the alert reading', () => {
    expect(trend).toHaveLength(TREND_POINTS)
    expect(trend.at(-1)).toEqual({ at: alert.triggeredAt, value: alert.reading })
    expect(Date.parse(trend[1].at) - Date.parse(trend[0].at)).toBe(3_600_000)
  })

  it('starts below the warning threshold and is deterministic', () => {
    expect(trend[0].value).toBeLessThan(alert.thresholds.warning)
    expect(buildTrend(alert)).toEqual(trend)
  })
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
