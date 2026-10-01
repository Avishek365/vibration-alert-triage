import type { Ref } from 'react'
import {
  describeEvidence,
  FAULT_LABELS,
  formatExact,
  formatMmS,
  formatRelative,
} from '../domain/format'
import type { Alert, Asset, MeasurementPoint, Site } from '../domain/types'
import { ConfidenceMeter } from './ConfidenceMeter'
import { EvidenceLine } from './EvidenceLine'
import { HealthIndicator } from './HealthIndicator'
import { SensorStatusIndicator } from './SensorStatusIndicator'

interface AlertRowProps {
  alert: Alert
  asset: Asset
  site: Site
  point: MeasurementPoint
  now: Date
  selected: boolean
  rowRef?: Ref<HTMLLIElement>
  onSelect: () => void
  onAcknowledge: () => void
  onDismiss: () => void
}

const button =
  'inline-flex items-center gap-1.5 rounded-md border border-strong bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-subtle'

export function AlertRow({
  alert,
  asset,
  site,
  point,
  now,
  selected,
  rowRef,
  onSelect,
  onAcknowledge,
  onDismiss,
}: AlertRowProps) {
  const titleId = `${alert.id}-title`
  const detailsId = `${alert.id}-details`
  const exact = formatExact(alert.triggeredAt)
  // Only the selected row is in the Tab order (roving focus), including its buttons.
  const tabIndex = selected ? 0 : -1

  return (
    <li
      ref={rowRef}
      data-alert-id={alert.id}
      tabIndex={tabIndex}
      aria-current={selected ? 'true' : undefined}
      aria-labelledby={titleId}
      aria-describedby={detailsId}
      onClick={onSelect}
      className={`relative border-b border-hairline px-4 py-3 focus-visible:outline-offset-[-2px] ${
        selected ? 'bg-subtle' : 'bg-surface hover:bg-app'
      }`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />}

      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 lg:flex-nowrap">
        <div className="w-24 shrink-0 pt-0.5">
          <HealthIndicator state={alert.severity} />
        </div>

        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p id={titleId} className="truncate font-medium text-heading">
            {asset.name} <span className="font-normal text-tertiary">{asset.tag}</span>
            <span className="sr-only">
              , {alert.severity} {FAULT_LABELS[alert.faultType]}
            </span>
          </p>
          <p className="truncate text-sm text-secondary">
            {site.name} · {point.name}
          </p>
          <p className="mt-1 text-sm font-medium text-primary">{FAULT_LABELS[alert.faultType]}</p>
          <EvidenceLine evidence={alert.evidence} />
        </div>

        <div className="w-40 shrink-0 space-y-1">
          <ConfidenceMeter confidence={alert.confidence} />
          <p className="text-sm text-secondary tabular-nums">
            <span className="text-primary">{formatMmS(alert.reading)}</span> /{' '}
            {alert.thresholds[alert.severity].toFixed(2)}
          </p>
        </div>

        <div className="w-32 shrink-0 space-y-1 text-sm">
          <SensorStatusIndicator point={point} now={now} />
          <p className="text-secondary">
            <time dateTime={alert.triggeredAt} title={exact}>
              {formatRelative(alert.triggeredAt, now)}
            </time>
          </p>
          {alert.status === 'acknowledged' && (
            <span className="inline-block rounded-sm border border-hairline px-1.5 text-xs text-secondary">
              Acknowledged
            </span>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {alert.status === 'new' && (
            <button
              type="button"
              tabIndex={tabIndex}
              className={button}
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
                onAcknowledge()
              }}
            >
              Acknowledge <kbd className="text-xs text-tertiary">a</kbd>
            </button>
          )}
          {alert.status !== 'dismissed' && (
            <button
              type="button"
              tabIndex={tabIndex}
              className={button}
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
                onDismiss()
              }}
            >
              Dismiss <kbd className="text-xs text-tertiary">d</kbd>
            </button>
          )}
        </div>
      </div>

      {/* Always rendered so aria-describedby works; visible only on the selected row. */}
      <div
        id={detailsId}
        hidden={!selected}
        className="mt-3 rounded-md border border-hairline bg-surface p-3 text-sm text-primary sm:ml-28"
      >
        <p>
          Triggered <time dateTime={alert.triggeredAt}>{exact}</time>
        </p>
        <p className="mt-2 font-medium">Evidence</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-secondary tabular-nums">
          {describeEvidence(alert.evidence).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </li>
  )
}
