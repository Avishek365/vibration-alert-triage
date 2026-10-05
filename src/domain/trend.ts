// Trend window and plain-language descriptions of a vibration trend.

import { formatDayTime, formatMmS } from './format'
import type { Alert, AlertTrend, Thresholds } from './types'

const HOUR_MS = 60 * 60 * 1000
export const WINDOW_HOURS = 48
/** Alerts older than this are shown 36 h before to 12 h after, so the alert stays in view. */
const RECENT_HOURS = 42

export function trendWindow(triggeredAt: string, now: Date): { start: Date; end: Date } {
  const trigger = Date.parse(triggeredAt)
  const end =
    now.getTime() - trigger > RECENT_HOURS * HOUR_MS
      ? trigger + (WINDOW_HOURS - 36) * HOUR_MS
      : now.getTime()
  return { start: new Date(end - WINDOW_HOURS * HOUR_MS), end: new Date(end) }
}

export type ThresholdPosition = 'above_critical' | 'above_warning' | 'below_warning'

export function thresholdPosition(value: number, thresholds: Thresholds): ThresholdPosition {
  if (value >= thresholds.critical) return 'above_critical'
  if (value >= thresholds.warning) return 'above_warning'
  return 'below_warning'
}

const POSITION_PHRASES: Record<ThresholdPosition, string> = {
  above_critical: 'above the critical limit',
  above_warning: 'above the warning limit, below critical',
  below_warning: 'below the warning limit',
}

/** "6.82 mm/s, above the warning limit, below critical" */
export function describeReading(value: number, thresholds: Thresholds): string {
  return `${formatMmS(value)}, ${POSITION_PHRASES[thresholdPosition(value, thresholds)]}`
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * A few sentences a screen reader can use in place of the chart. Mentions the
 * starting level, when the warning limit was first crossed, the peak, when the
 * alert was raised and the last reading.
 */
export function describeTrend(trend: AlertTrend, alert: Alert, timeZone?: string): string {
  const { points } = trend
  if (points.length === 0) return 'No readings in this period.'
  const { warning, critical } = alert.thresholds
  const at = (iso: string) => formatDayTime(iso, timeZone)
  const sentences: string[] = []

  const opening = points.slice(0, Math.max(1, Math.floor(points.length / 4)))
  const firstAbove = points.findIndex((p) => p.value >= warning)
  if (firstAbove === 0) {
    sentences.push(
      `At the start of the window, vibration was already above the warning limit of ${formatMmS(warning)}.`,
    )
  } else {
    const start = `Vibration stayed near ${formatMmS(median(opening.map((p) => p.value)))}`
    sentences.push(
      firstAbove === -1
        ? `${start} and did not reach the warning limit of ${formatMmS(warning)}.`
        : `${start}, then first went above the warning limit of ${formatMmS(warning)} at ${at(points[firstAbove].at)}.`,
    )
  }

  const peak = points.reduce((max, p) => (p.value > max.value ? p : max))
  const peakIsCritical = peak.value >= critical
  sentences.push(
    `It peaked at ${formatMmS(peak.value)} at ${at(peak.at)}${
      peakIsCritical ? `, above the critical limit of ${formatMmS(critical)}` : ''
    }.`,
  )

  const trigger = Date.parse(alert.triggeredAt)
  if (trigger >= Date.parse(trend.windowStart) && trigger <= Date.parse(trend.windowEnd)) {
    sentences.push(`The alert was raised at ${at(alert.triggeredAt)}.`)
  }

  const last = points[points.length - 1]
  sentences.push(
    `The last reading, ${formatMmS(last.value)} at ${at(last.at)}, was ${
      POSITION_PHRASES[thresholdPosition(last.value, alert.thresholds)]
    }.`,
  )

  if (trend.sensorStatus !== 'online') {
    sentences.push(
      `Readings stop at ${at(trend.lastReadingAt)} because the sensor stopped reporting. The time after that is missing data, not a steady or healthy signal.`,
    )
  }

  return sentences.join(' ')
}
