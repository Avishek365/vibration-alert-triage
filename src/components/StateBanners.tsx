import { useId, type ReactNode } from 'react'
import { FAULT_LABELS, formatAge, formatDayTime, formatExact, formatMmS } from '../domain/format'
import { thresholdPosition } from '../domain/trend'
import type { DismissedAlert, MeasurementPoint, Thresholds } from '../domain/types'

// Both banners are neutral grey: neither is about machine health, and a
// correction is useful feedback, not a failure.

function Banner({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex gap-3 rounded-lg border border-strong bg-subtle p-4 text-sm"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-secondary">
        {icon}
      </span>
      <div className="space-y-1">
        <h3 id={titleId} className="font-semibold text-heading">
          {title}
        </h3>
        {children}
      </div>
    </section>
  )
}

const LAST_READING_PHRASES = {
  above_critical: 'was above the critical limit',
  above_warning: 'was above the warning limit',
  below_warning: 'was below the warning limit',
} as const

interface SensorQuietBannerProps {
  point: MeasurementPoint
  thresholds: Thresholds
  /** Value of the last reading received, when the trend has loaded. */
  lastReading?: number
  now: Date
}

/** Missing data must never read as a healthy machine. */
export function SensorQuietBanner({ point, thresholds, lastReading, now }: SensorQuietBannerProps) {
  return (
    <Banner
      title={`Sensor stopped reporting ${formatAge(point.lastSeenAt, now)} ago`}
      icon={
        <svg viewBox="0 0 16 16" className="size-4">
          <path
            d="M2 11h2M6 8v3M10 5v6M14 2v9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M1.5 14.5 14.5 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      }
    >
      <p className="text-primary">
        Readings after {formatDayTime(point.lastSeenAt)} are missing, not normal. The machine's
        current condition is unknown.
      </p>
      {lastReading !== undefined && (
        <p className="text-primary">
          The last reading, {formatMmS(lastReading)},{' '}
          {LAST_READING_PHRASES[thresholdPosition(lastReading, thresholds)]}.
        </p>
      )}
    </Banner>
  )
}

const STILL_ABOVE = {
  above_critical: 'critical',
  above_warning: 'warning',
} as const

/**
 * A dismissal with reason "model was wrong", shown as a correction. The fault
 * label may have been wrong, but a high reading is still a high reading, so
 * say so when the latest one is above a limit.
 */
export function CorrectionBanner({
  alert,
  lastReading,
}: {
  alert: DismissedAlert
  /** Latest reading, when the trend has loaded. */
  lastReading?: number
}) {
  const position =
    lastReading === undefined ? null : thresholdPosition(lastReading, alert.thresholds)
  const stillAbove = position && position !== 'below_warning' ? STILL_ABOVE[position] : null

  return (
    <Banner
      title="Corrected by technician"
      icon={
        <svg viewBox="0 0 16 16" className="size-4">
          <path
            d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      }
    >
      <p className="text-primary">
        The model suggested {FAULT_LABELS[alert.faultType].toLowerCase()} (confidence{' '}
        {alert.confidence.toFixed(2)}). {alert.dismissedBy} marked this as incorrect on{' '}
        <time dateTime={alert.dismissedAt}>{formatExact(alert.dismissedAt)}</time>.
      </p>
      {alert.dismissNote && <p className="text-primary">“{alert.dismissNote}”</p>}
      <p className="text-secondary">Recorded as feedback on this alert.</p>
      {stillAbove && (
        <p className="font-medium text-primary">
          Vibration is still above the {stillAbove} limit. Dismissing this alert does not change the
          reading.
        </p>
      )}
    </Banner>
  )
}
