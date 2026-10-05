import { useId } from 'react'
import { explainConfidence } from '../domain/confidence'
import { FAULT_LABELS } from '../domain/format'
import type { Alert, MeasurementPoint } from '../domain/types'
import { ConfidenceMeter } from './ConfidenceMeter'

interface ConfidencePanelProps {
  alert: Alert
  point: MeasurementPoint
  now: Date
}

/** Model confidence and, in plain words, what it is unsure about. Neutral grey. */
export function ConfidencePanel({ alert, point, now }: ConfidencePanelProps) {
  const listId = useId()
  const corrected = alert.status === 'dismissed' && alert.dismissReason === 'model_wrong'
  const { heading, points } = explainConfidence(alert, point, now)

  return (
    <div className="space-y-3">
      {corrected && (
        <p className="text-xs font-medium tracking-wide text-tertiary uppercase">
          Original model estimate
        </p>
      )}
      <div className={corrected ? 'space-y-2 text-secondary' : 'space-y-2'}>
        <ConfidenceMeter confidence={alert.confidence} />
        <p className="text-sm text-primary">
          The model's best match {corrected ? 'was' : 'is'}{' '}
          <span className="font-medium">{FAULT_LABELS[alert.faultType].toLowerCase()}</span>.
        </p>
      </div>
      <div>
        <h4 id={listId} className="text-sm font-medium text-primary">
          {heading}
        </h4>
        <ul
          aria-labelledby={listId}
          className="mt-1 list-disc space-y-1 pl-5 text-sm text-secondary"
        >
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
