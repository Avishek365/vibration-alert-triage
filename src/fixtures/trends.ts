import type { Alert, TrendPoint } from '../domain/types'
import { between, createRandom, hashString, round } from './random'

const HOUR_MS = 60 * 60 * 1000
export const TREND_POINTS = 48
const RAMP_START = 30

/**
 * Hourly velocity history for the 48 hours up to and including the alert.
 * Flat near baseline, then rising to the alert reading. Seeded by alert id.
 */
export function buildTrend(alert: Alert): TrendPoint[] {
  const random = createRandom(hashString(alert.id))
  const end = new Date(alert.triggeredAt).getTime()
  const baseline = alert.thresholds.warning * between(random, 0.35, 0.55)
  const rampLength = TREND_POINTS - 1 - RAMP_START

  return Array.from({ length: TREND_POINTS }, (_, i) => {
    const at = new Date(end - (TREND_POINTS - 1 - i) * HOUR_MS).toISOString()
    if (i === TREND_POINTS - 1) return { at, value: alert.reading }
    const progress = i < RAMP_START ? 0 : ((i - RAMP_START) / rampLength) ** 2
    const level = baseline + (alert.reading - baseline) * progress
    const noise = 1 + between(random, -0.06, 0.06)
    return { at, value: round(level * noise) }
  })
}
