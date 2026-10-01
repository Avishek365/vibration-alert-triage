import type { HealthState } from '../domain/types'

// Every state pairs colour with a shape and a text label. Healthy is a plain
// dot with no pill: only states that need attention get a filled badge.
const PILLS: Record<
  Exclude<HealthState, 'healthy'>,
  { shape: string; label: string; pill: string; mark: string }
> = {
  critical: {
    shape: '●',
    label: 'Critical',
    pill: 'bg-health-critical-tint text-health-critical-text',
    mark: 'text-health-critical-strong',
  },
  warning: {
    shape: '▲',
    label: 'Warning',
    pill: 'bg-health-warning-tint text-health-warning-text',
    mark: 'text-health-warning-strong',
  },
  unknown: {
    shape: '◌',
    label: 'Unknown',
    pill: 'bg-health-unknown-tint text-health-unknown-text',
    mark: 'text-health-unknown-strong',
  },
}

interface HealthIndicatorProps {
  state: HealthState
  /** Optional count shown after the label, e.g. in the summary strip. */
  count?: number
}

export function HealthIndicator({ state, count }: HealthIndicatorProps) {
  const suffix = count === undefined ? null : <span className="tabular-nums">{count}</span>

  if (state === 'healthy') {
    return (
      <span data-health="healthy" className="inline-flex items-center gap-1.5 text-sm text-primary">
        <span aria-hidden="true" className="size-2 rounded-full bg-health-healthy-strong" />
        Healthy
        {suffix}
      </span>
    )
  }

  const { shape, label, pill, mark } = PILLS[state]
  return (
    <span
      data-health={state}
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-sm font-medium ${pill}`}
    >
      <span aria-hidden="true" className={mark}>
        {shape}
      </span>
      {label}
      {suffix}
    </span>
  )
}
