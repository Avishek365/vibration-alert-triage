import { CONFIDENCE_BANDS, CONFIDENCE_LABELS } from '../domain/confidence'
import { STATUS_LABELS } from '../domain/format'
import type { AlertFilters, AlertStatus, Severity, Site } from '../domain/types'
import { DEFAULT_STATUS, hasActiveFilters } from '../hooks/useUrlFilters'

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
]
const STATUSES: AlertStatus[] = ['new', 'acknowledged', 'dismissed']

function toggle<T>(list: readonly T[] = [], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

interface ToggleGroupProps<T extends string> {
  label: string
  options: { value: T; label: string }[]
  selected: readonly T[]
  onToggle: (value: T) => void
  /** Prevent turning off the last selected option. */
  keepOne?: boolean
}

// Pressed state uses the indigo accent, which marks selection.
function ToggleGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  keepOne,
}: ToggleGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="text-sm text-tertiary">{label}</span>
      <div className="flex">
        {options.map((option, i) => {
          const pressed = selected.includes(option.value)
          const locked = keepOne && pressed && selected.length === 1
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              disabled={locked}
              onClick={() => onToggle(option.value)}
              className={`border px-2.5 py-1 text-sm ${i === 0 ? 'rounded-l-md' : '-ml-px'} ${
                i === options.length - 1 ? 'rounded-r-md' : ''
              } ${
                pressed
                  ? 'relative z-10 border-accent bg-accent-subtle font-medium text-heading'
                  : 'border-strong bg-surface text-secondary hover:bg-subtle'
              } disabled:cursor-not-allowed`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface FilterBarProps {
  filters: AlertFilters
  sites: readonly Site[]
  onChange: (filters: AlertFilters) => void
}

export function FilterBar({ filters, sites, onChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="Filters" role="search">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-tertiary">Site</span>
        <select
          value={filters.siteId ?? ''}
          onChange={(e) => onChange({ ...filters, siteId: e.target.value || undefined })}
          className="rounded-md border border-strong bg-surface px-2 py-1 text-sm text-primary"
        >
          <option value="">All sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>

      <ToggleGroup
        label="Severity"
        options={SEVERITIES}
        selected={filters.severity ?? []}
        onToggle={(v) => onChange({ ...filters, severity: toggle(filters.severity, v) })}
      />
      <ToggleGroup
        label="Status"
        options={STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
        selected={filters.status ?? DEFAULT_STATUS}
        keepOne
        onToggle={(v) =>
          onChange({ ...filters, status: toggle(filters.status ?? DEFAULT_STATUS, v) })
        }
      />
      <ToggleGroup
        label="Confidence"
        options={CONFIDENCE_BANDS.map((value) => ({ value, label: CONFIDENCE_LABELS[value] }))}
        selected={filters.confidence ?? []}
        onToggle={(v) => onChange({ ...filters, confidence: toggle(filters.confidence, v) })}
      />

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange({ status: DEFAULT_STATUS })}
          className="text-sm font-medium text-accent underline underline-offset-2"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
