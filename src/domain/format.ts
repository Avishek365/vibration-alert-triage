// Display text for domain values. Locale is fixed to en-GB so output is stable.

import type { AlertStatus, DismissReason, Evidence, FaultType, SensorStatus } from './types'

export const FAULT_LABELS: Record<FaultType, string> = {
  imbalance: 'Imbalance',
  misalignment: 'Misalignment',
  bearing_wear: 'Bearing wear',
  looseness: 'Looseness',
  gear_mesh: 'Gear mesh',
  cavitation: 'Cavitation',
}

export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  model_wrong: 'Model was wrong',
  known_condition: 'Known condition',
  maintenance_in_progress: 'Maintenance in progress',
  sensor_fault: 'Sensor fault',
  other: 'Other',
}

export const STATUS_LABELS: Record<AlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  dismissed: 'Dismissed',
}

export const SENSOR_STATUS_LABELS: Record<SensorStatus, string> = {
  online: 'Online',
  stale: 'Stale',
  offline: 'Offline',
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Short age, e.g. "12 min", "5 h", "3 d". */
export function formatAge(iso: string, now: Date): string {
  const age = Math.max(0, now.getTime() - Date.parse(iso))
  if (age < MINUTE_MS) return 'now'
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} min`
  if (age < 2 * DAY_MS) return `${Math.floor(age / HOUR_MS)} h`
  return `${Math.floor(age / DAY_MS)} d`
}

/** Compact age for tight labels, e.g. "45m", "3h", "2d". */
export function formatAgeCompact(iso: string, now: Date): string {
  const age = formatAge(iso, now)
  return age === 'now' ? 'now' : age.replace(' min', 'm').replace(' ', '')
}

export function formatRelative(iso: string, now: Date): string {
  const age = formatAge(iso, now)
  return age === 'now' ? 'just now' : `${age} ago`
}

// Fixed month names: locale data disagrees on abbreviations ("Sep" vs "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Exact time with zone, e.g. "30 Sep 2026, 06:30 UTC". Uses the viewer's zone by default. */
export function formatExact(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    timeZone,
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const month = MONTHS[Number(part('month')) - 1]
  return `${part('day')} ${month} ${part('year')}, ${part('hour')}:${part('minute')} ${part('timeZoneName')}`
}

/** Full sensor sentence for tooltips and screen readers. */
export function describeSensor(
  status: SensorStatus,
  lastSeenAt: string,
  timeZone?: string,
): string {
  return `Sensor ${status} · Last reading ${formatExact(lastSeenAt, timeZone)}`
}

export function formatMmS(value: number): string {
  return `${value.toFixed(2)} mm/s`
}

export function formatHz(value: number): string {
  return value >= 1000 ? `${round1(value / 1000)} kHz` : `${round1(value)} Hz`
}

function round1(value: number): string {
  return String(Math.round(value * 10) / 10)
}

export function exceedance(e: Evidence): string {
  return `${(e.observed / e.baseline).toFixed(1)}×`
}

/** One line for the queue row: "1× running speed 4.1× baseline · 1× axial 2.3×". */
export function summariseEvidence(evidence: readonly Evidence[]): string {
  return evidence
    .map((e, i) => `${e.bandLabel} ${exceedance(e)}${i === 0 ? ' baseline' : ''}`)
    .join(' · ')
}

/** Every band with its range and values, for the expanded row and screen readers. */
export function describeEvidence(evidence: readonly Evidence[]): string[] {
  return evidence.map(
    (e) =>
      `${e.bandLabel} (${formatHz(e.lowHz)}–${formatHz(e.highHz)}): ` +
      `${formatMmS(e.observed)} vs baseline ${formatMmS(e.baseline)}, ${exceedance(e)}`,
  )
}
