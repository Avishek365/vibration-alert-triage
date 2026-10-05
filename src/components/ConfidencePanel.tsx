import { FAULT_LABELS } from '../domain/format'
import type { Alert } from '../domain/types'
import { ConfidenceMeter } from './ConfidenceMeter'

/** Model confidence in the suggested fault. Neutral grey, like the queue. */
export function ConfidencePanel({ alert }: { alert: Alert }) {
  return (
    <div className="space-y-2">
      <ConfidenceMeter confidence={alert.confidence} />
      <p className="text-sm text-primary">
        The model's best match is{' '}
        <span className="font-medium">{FAULT_LABELS[alert.faultType].toLowerCase()}</span>.
      </p>
    </div>
  )
}
