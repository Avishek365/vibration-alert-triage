import type { Alert, Asset, HealthState, SensorStatus, Severity, Thresholds } from './types'

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

/**
 * Health of an asset:
 * - the worst severity among its open alerts, otherwise
 * - unknown if any measurement point is offline (we cannot confirm it is fine), otherwise
 * - healthy.
 */
export function assetHealth(asset: Asset, alerts: readonly Alert[]): HealthState {
  let worst: Severity | null = null
  for (const alert of alerts) {
    if (alert.assetId !== asset.id || !isOpen(alert)) continue
    if (worst === null || severityRank(alert.severity) > severityRank(worst)) {
      worst = alert.severity
    }
  }
  if (worst) return worst
  if (asset.points.some((p) => p.sensorStatus === 'offline')) return 'unknown'
  return 'healthy'
}
