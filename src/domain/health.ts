import type {
  Alert,
  Asset,
  DismissReason,
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

/**
 * Health of an asset, and a note when a dismissed alert explains it.
 *
 * Health is the worst of, across measurement points:
 * - the severity of any open alert;
 * - what the latest reading implies against the thresholds, whatever the
 *   alert status (dismissing an alert does not change the reading);
 * - unknown, when the point's latest alert was dismissed as a sensor fault
 *   (its reading is not trusted, so it is not counted) or the sensor is offline.
 *
 * Order: critical > warning > unknown > healthy.
 */
export function assetStatus(
  asset: Asset,
  alerts: readonly Alert[],
): { health: HealthState; note?: HealthNote } {
  let health: HealthState = 'healthy'
  let note: HealthNote | undefined
  const raise = (state: HealthState) => {
    if (healthRank(state) > healthRank(health)) health = state
  }

  for (const point of asset.points) {
    const pointAlerts = alerts.filter((a) => a.assetId === asset.id && a.pointId === point.id)
    for (const alert of pointAlerts) if (isOpen(alert)) raise(alert.severity)

    const latest = [...pointAlerts].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]
    const dismissed = latest?.status === 'dismissed' ? latest : undefined

    if (dismissed?.dismissReason === 'sensor_fault') {
      raise('unknown')
      note ??= 'sensor_fault'
      continue
    }
    if (point.sensorStatus === 'offline') raise('unknown')

    const fromReading = severityForReading(point.latestReading, point.thresholds)
    if (fromReading) {
      raise(fromReading)
      if (dismissed) note ??= NOTE_FOR_REASON[dismissed.dismissReason]
    }
  }

  return note ? { health, note } : { health }
}

export function assetHealth(asset: Asset, alerts: readonly Alert[]): HealthState {
  return assetStatus(asset, alerts).health
}
