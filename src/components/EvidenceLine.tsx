import { describeEvidence, summariseEvidence } from '../domain/format'
import type { Evidence } from '../domain/types'

/**
 * One truncated line so a row stays scannable. The full text is also on
 * hover (title), and in the selected row's details for keyboard and
 * screen-reader users.
 */
export function EvidenceLine({ evidence }: { evidence: readonly Evidence[] }) {
  return (
    <p className="truncate text-sm text-secondary" title={describeEvidence(evidence).join('\n')}>
      {summariseEvidence(evidence)}
    </p>
  )
}
