import type {
  Alert,
  Asset,
  DismissReason,
  MeasurementPoint,
  HealthCause,
  HealthDriver,
  HealthNote,
  HealthState,
  SensorStatus,
  Severity,
  Thresholds,
} from './types'

const HOUR_MS = 60 * 60 * 1000

/** A sensor is stale after 1 hour without data and offline after 24 hours. */
export const STALE_AFTER_MS = HOUR_MS
export const OFFLINE_AFTER_MS = 24 * HOUR_MS

const HEALTH_RANK: Record<HealthState, number> = {
  critical: 3,
  warning: 2,
  unknown: 1,
  healthy: 0,
}

/** Higher is worse. Unknown ranks above healthy so it is never hidden. */
export function healthRank(state: HealthState): number {
  return HEALTH_RANK[state]
}

export function severityRank(severity: Severity): number {
  return HEALTH_RANK[severity]
}

/** Severity of a velocity reading, or null when it is below the warning limit. */
export function severityForReading(value: number, thresholds: Thresholds): Severity | null {
  if (value >= thresholds.critical) return 'critical'
  if (value >= thresholds.warning) return 'warning'
  return null
}

export function sensorStatusFor(lastSeenAt: string, now: Date): SensorStatus {
  const age = now.getTime() - new Date(lastSeenAt).getTime()
  if (age >= OFFLINE_AFTER_MS) return 'offline'
  if (age >= STALE_AFTER_MS) return 'stale'
  return 'online'
}

/** New and acknowledged alerts still describe a live problem. */
export function isOpen(alert: Alert): boolean {
  return alert.status !== 'dismissed'
}

const NOTE_FOR_REASON: Record<Exclude<DismissReason, 'sensor_fault'>, HealthNote> = {
  known_condition: 'known_condition',
  maintenance_in_progress: 'in_maintenance',
  model_wrong: 'dismissed_elevated',
  other: 'dismissed_elevated',
}

const worse = (a: HealthState, b: HealthState) => (healthRank(b) > healthRank(a) ? b : a)

/** What one measurement point contributes, and whether a dismissal is what sets it. */
interface PointStatus {
  level: HealthState
  /** Set only when a dismissed alert, and nothing else on this point, sets `level`. */
  note?: HealthNote
  /** What sets `level` on this point. */
  cause: HealthCause
}

function pointStatus(point: MeasurementPoint, pointAlerts: readonly Alert[]): PointStatus {
  const fromOpen = pointAlerts
    .filter(isOpen)
    .reduce<HealthState>((level, alert) => worse(level, alert.severity), 'healthy')

  const latest = [...pointAlerts].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]
  const dismissed = latest?.status === 'dismissed' ? latest : undefined

  // A sensor fault means the reading is not trusted: it is not counted, and the
  // point is at least Unknown. The fault is the reason only if nothing worse is open.
  if (dismissed?.dismissReason === 'sensor_fault') {
    const level = worse(fromOpen, 'unknown')
    return level === 'unknown' && fromOpen !== 'unknown'
      ? { level, note: 'sensor_fault', cause: 'sensor_fault' }
      : { level, cause: 'alert' }
  }

  const fromReading: HealthState =
    severityForReading(point.latestReading, point.thresholds) ?? 'healthy'
  const fromSensor: HealthState = point.sensorStatus === 'offline' ? 'unknown' : 'healthy'
  const level = worse(worse(fromOpen, fromReading), fromSensor)

  // The dismissal explains the level only when the elevated reading alone sets it:
  // no open alert or offline sensor on this point reaches the same level.
  const readingAlone =
    fromReading === level &&
    level !== 'healthy' &&
    healthRank(fromOpen) < healthRank(level) &&
    healthRank(fromSensor) < healthRank(level)
  // When several sources reach the level, the reading is the most direct explanation.
  const cause: HealthCause =
    level === 'healthy'
      ? 'none'
      : fromReading === level
        ? 'reading'
        : fromOpen === level
          ? 'alert'
          : 'offline'
  return dismissed && readingAlone
    ? { level, note: NOTE_FOR_REASON[dismissed.dismissReason], cause }
    : { level, cause }
}

/**
 * Health of an asset, and at most one note when a dismissed alert explains it.
 *
 * Health is the worst of, across measurement points:
 * - the severity of any open alert;
 * - what the latest reading implies against the thresholds, whatever the
 *   alert status (dismissing an alert does not change the reading);
 * - unknown, when the point's latest alert was dismissed as a sensor fault
 *   (its reading is not trusted, so it is not counted) or the sensor is offline.
 *
 * A note is shown only when the dismissed point is what sets the machine's
 * health: if any other point, open alert or offline sensor reaches the same
 * level, there is no note. Notes never stack.
 *
 * Order: critical > warning > unknown > healthy.
 */
export function assetStatus(
  asset: Asset,
  alerts: readonly Alert[],
): { health: HealthState; note?: HealthNote } {
  const points = asset.points.map((point) =>
    pointStatus(
      point,
      alerts.filter((a) => a.assetId === asset.id && a.pointId === point.id),
    ),
  )
  const health = points.reduce<HealthState>((level, p) => worse(level, p.level), 'healthy')
  if (health === 'healthy') return { health }

  const setters = points.filter((p) => p.level === health)
  const note = setters.every((p) => p.note) ? setters[0].note : undefined
  return note ? { health, note } : { health }
}

/**
 * The measurement point that sets the machine's health, and why. When several
 * points set it, the one whose reading is highest against its critical limit.
 * Undefined for a healthy machine.
 */
export function healthDriver(asset: Asset, alerts: readonly Alert[]): HealthDriver | undefined {
  const points = asset.points.map((point) => ({
    point,
    status: pointStatus(
      point,
      alerts.filter((a) => a.assetId === asset.id && a.pointId === point.id),
    ),
  }))
  const health = points.reduce<HealthState>((level, p) => worse(level, p.status.level), 'healthy')
  if (health === 'healthy') return undefined
  const setter = points
    .filter((p) => p.status.level === health)
    .reduce((best, p) =>
      p.point.latestReading / p.point.thresholds.critical >
      best.point.latestReading / best.point.thresholds.critical
        ? p
        : best,
    )
  return { pointId: setter.point.id, cause: setter.status.cause }
}

export function assetHealth(asset: Asset, alerts: readonly Alert[]): HealthState {
  return assetStatus(asset, alerts).health
}
