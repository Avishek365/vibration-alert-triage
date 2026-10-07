// Domain model for the vibration alert triage tool. All values are fictional.

import type { ConfidenceBand } from './confidence'

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
  /** Velocity RMS in mm/s of that last reading. */
  latestReading: number
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
  /** The model's runner-up fault, when it was not confident. */
  alternativeFault?: { faultType: FaultType; confidence: number }
}

export interface NewAlert extends AlertBase {
  status: 'new'
}

export interface AcknowledgedAlert extends AlertBase {
  status: 'acknowledged'
  acknowledgedAt: string
  /** Who acknowledged it: a fictional technician in fixtures, "You" for the current user. */
  acknowledgedBy: string
}

export interface DismissedAlert extends AlertBase {
  status: 'dismissed'
  acknowledgedAt?: string
  acknowledgedBy?: string
  dismissedAt: string
  dismissedBy: string
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

/** Hourly readings for the chart, plus the window they are drawn in. */
export interface AlertTrend {
  points: TrendPoint[]
  windowStart: string
  windowEnd: string
  /** Time of the last reading received. Readings stop here when the sensor goes quiet. */
  lastReadingAt: string
  sensorStatus: SensorStatus
}

export interface AlertFilters {
  status?: AlertStatus[]
  severity?: Severity[]
  siteId?: string
  minConfidence?: number
  confidence?: ConfidenceBand[]
}

export interface AssetFilters {
  siteId?: string
}

/**
 * Why a machine's health is what it is when a dismissed alert is involved.
 * Shown as a small neutral label next to the machine.
 */
export type HealthNote =
  'known_condition' | 'in_maintenance' | 'dismissed_elevated' | 'sensor_fault'

/** What sets a machine's health: an open alert, the latest reading, a sensor fault or an offline sensor. */
export type HealthCause = 'alert' | 'reading' | 'sensor_fault' | 'offline' | 'none'

export interface HealthDriver {
  /** Measurement point that sets the machine's health. */
  pointId: string
  cause: HealthCause
}

/** Asset with its derived health, as returned by list endpoints. */
export interface AssetSummary {
  asset: Asset
  health: HealthState
  note?: HealthNote
  /** Absent for a healthy machine. */
  driver?: HealthDriver
  openAlertCount: number
  /** Most recent open alert, else most recent dismissed one; absent with no alerts. */
  relevantAlertId?: string
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
