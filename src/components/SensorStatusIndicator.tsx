import { describeSensor, formatAgeCompact, SENSOR_STATUS_LABELS } from '../domain/format'
import type { MeasurementPoint } from '../domain/types'

// Small and neutral grey, kept apart from the health badge: sensor status says
// whether data is arriving, not whether the machine is healthy. Each state has
// its own icon and a text label: filled dot, half dot, slashed circle.
function Icon({ status }: { status: MeasurementPoint['sensorStatus'] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" className="size-3 shrink-0">
      {status === 'online' && <circle cx="5" cy="5" r="4" fill="currentColor" />}
      {status === 'stale' && (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1.25 A3.75 3.75 0 0 1 5 8.75 Z" fill="currentColor" />
        </>
      )}
      {status === 'offline' && (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1.5 8.5 L8.5 1.5" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  )
}

/**
 * Visible only when there is something to act on (stale or offline). An
 * online sensor shows nothing, but keeps its tooltip and screen-reader text,
 * and the line is still reserved so rows stay aligned.
 */
export function SensorStatusIndicator({ point, now }: { point: MeasurementPoint; now: Date }) {
  const { sensorStatus, lastSeenAt } = point
  const description = describeSensor(sensorStatus, lastSeenAt)

  if (sensorStatus === 'online') {
    return (
      <span data-sensor="online" title={description} className="block h-4">
        <span className="sr-only">Sensor online</span>
      </span>
    )
  }

  return (
    <span
      data-sensor={sensorStatus}
      title={description}
      className="flex h-4 items-center gap-1 text-xs text-tertiary"
    >
      <Icon status={sensorStatus} />
      <span>
        <span className="sr-only">Sensor </span>
        {SENSOR_STATUS_LABELS[sensorStatus]}
        {sensorStatus === 'stale' && ` ${formatAgeCompact(lastSeenAt, now)}`}
      </span>
    </span>
  )
}
