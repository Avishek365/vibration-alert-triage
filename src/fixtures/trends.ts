import { trendWindow } from '../domain/trend'
import type { Alert, AlertTrend, MeasurementPoint, TrendPoint } from '../domain/types'
import { between, createRandom, hashString, round } from './random'

const HOUR_MS = 60 * 60 * 1000
/** Hours before the alert over which vibration climbs from baseline. */
const RAMP_HOURS = 17

/**
 * Hourly velocity readings across the alert's trend window, seeded by alert id.
 * Flat near baseline, rising to the alert reading, then holding near it.
 * Readings stop at the sensor's last reading when it is stale or offline.
 */
export function buildTrend(alert: Alert, point: MeasurementPoint, now: Date): AlertTrend {
  const random = createRandom(hashString(alert.id))
  const { start, end } = trendWindow(alert.triggeredAt, now)
  const trigger = Date.parse(alert.triggeredAt)
  const quiet = point.sensorStatus !== 'online'
  const lastSeen = Date.parse(point.lastSeenAt)
  // No reading can be later than the sensor's last report, online or not.
  const dataEnd = Math.min(end.getTime(), lastSeen)
  const baseline = alert.thresholds.warning * between(random, 0.35, 0.55)

  const valueAt = (hoursFromTrigger: number) => {
    if (hoursFromTrigger === 0) return alert.reading
    const noise = 1 + between(random, -0.05, 0.05)
    if (hoursFromTrigger > 0) return round(alert.reading * noise)
    const before = -hoursFromTrigger
    const progress = before >= RAMP_HOURS ? 0 : ((RAMP_HOURS - before) / RAMP_HOURS) ** 2
    return round((baseline + (alert.reading - baseline) * progress) * noise)
  }

  // Grid aligned to the alert, so the alert reading is always one of the points.
  const first = Math.ceil((start.getTime() - trigger) / HOUR_MS)
  const last = Math.floor((dataEnd - trigger) / HOUR_MS)
  const points: TrendPoint[] = []
  for (let k = first; k <= last; k++) {
    points.push({ at: new Date(trigger + k * HOUR_MS).toISOString(), value: valueAt(k) })
  }

  // A quiet sensor's final reading rarely lands on the hour; include it exactly.
  const lastPoint = points.at(-1)
  if (quiet && lastSeen <= end.getTime() && lastPoint && Date.parse(lastPoint.at) < lastSeen) {
    points.push({ at: point.lastSeenAt, value: valueAt((lastSeen - trigger) / HOUR_MS) })
  }

  return {
    points,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    lastReadingAt: points.at(-1)?.at ?? point.lastSeenAt,
    sensorStatus: point.sensorStatus,
  }
}
