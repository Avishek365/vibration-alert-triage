// Domain model for the vibration alert triage tool. All values are fictional.

/** Overall machine health shown to the user. */
export type HealthState = 'critical' | 'warning' | 'healthy' | 'unknown'

/** Alert severity. A subset of health: alerts are only raised for problems. */
export type Severity = 'critical' | 'warning'

/**
 * Whether a sensor is reporting. Independent of health: a machine can be
 * critical with a stale sensor, or have no alerts with an offline one.
 */
export type SensorStatus = 'online' | 'stale' | 'offline'

export type AlertStatus = 'new' | 'acknowledged' | 'dismissed'

export const DISMISS_REASONS = [
  'model_wrong',
  'known_condition',
  'maintenance_in_progress',
  'sensor_fault',
  'other',
] as const

export type DismissReason = (typeof DISMISS_REASONS)[number]

export const FAULT_TYPES = [
  'imbalance',
  'misalignment',
  'bearing_wear',
  'looseness',
  'gear_mesh',
  'cavitation',
] as const

export type FaultType = (typeof FAULT_TYPES)[number]

export type AssetType = 'motor' | 'pump' | 'fan' | 'gearbox' | 'compressor'

export interface Site {
  id: string
  name: string
  location: string
}

/** Velocity RMS limits in mm/s. */
export interface Thresholds {
  warning: number
  critical: number
}

export interface MeasurementPoint {
  id: string
  name: string
  sensorStatus: SensorStatus
  /** ISO timestamp of the last reading received. */
  lastSeenAt: string
  thresholds: Thresholds
}

export interface Asset {
  id: string
  siteId: string
  tag: string
  name: string
  type: AssetType
  runningSpeedRpm: number
  points: MeasurementPoint[]
}

/** One frequency band that exceeded its learned baseline. Values in mm/s. */
export interface Evidence {
  bandLabel: string
  lowHz: number
  highHz: number
  observed: number
  baseline: number
}

interface AlertBase {
  id: string
  assetId: string
  pointId: string
  severity: Severity
  faultType: FaultType
  /** Model confidence in the fault type, 0 to 1. */
  confidence: number
  evidence: Evidence[]
  /** Overall velocity RMS in mm/s at the time the alert was raised. */
  reading: number
  thresholds: Thresholds
  triggeredAt: string
}

export interface NewAlert extends AlertBase {
  status: 'new'
}

export interface AcknowledgedAlert extends AlertBase {
  status: 'acknowledged'
  acknowledgedAt: string
}

export interface DismissedAlert extends AlertBase {
  status: 'dismissed'
  acknowledgedAt?: string
  dismissedAt: string
  dismissReason: DismissReason
  /** Required when the reason is `other`. */
  dismissNote?: string
}

export type Alert = NewAlert | AcknowledgedAlert | DismissedAlert

export interface DismissInput {
  reason: DismissReason
  note?: string
}

export interface TrendPoint {
  at: string
  value: number
}

export interface AlertFilters {
  status?: AlertStatus[]
  severity?: Severity[]
  siteId?: string
  minConfidence?: number
}

export interface AssetFilters {
  siteId?: string
}

/** Asset with its derived health, as returned by list endpoints. */
export interface AssetSummary {
  asset: Asset
  health: HealthState
  openAlertCount: number
}

export interface AssetDetail extends AssetSummary {
  site: Site
  alerts: Alert[]
}

export interface AlertDetail {
  alert: Alert
  asset: Asset
  site: Site
  point: MeasurementPoint
}
