import { CONFIDENCE_LABELS, confidenceBand, confidenceLevel } from '../domain/confidence'

// Neutral grey only. Red, amber and green mean machine health, and indigo
// means "interactive or selected", so neither is used for model confidence.
export function ConfidenceMeter({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence)
  const level = confidenceLevel(band)

  return (
    <span data-confidence={band} className="inline-flex items-center gap-2 text-sm tabular-nums">
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {[1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`w-1.5 rounded-sm ${segment <= level ? 'bg-secondary' : 'bg-strong'}`}
            style={{ height: `${6 + segment * 3}px` }}
          />
        ))}
      </span>
      <span>
        <span className="sr-only">Confidence </span>
        <span className="font-medium text-primary">{CONFIDENCE_LABELS[band]}</span>{' '}
        <span className="text-secondary">{confidence.toFixed(2)}</span>
      </span>
    </span>
  )
}
