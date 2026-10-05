import { formatExact } from '../domain/format'
import { triageHistory } from '../domain/history'
import type { Alert } from '../domain/types'

/** Timeline of what happened to the alert, oldest first. Neutral throughout. */
export function TriageHistory({ alert }: { alert: Alert }) {
  return (
    <ol className="space-y-3">
      {triageHistory(alert).map((entry) => (
        <li key={entry.kind} className="relative border-l-2 border-hairline pl-4">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-secondary"
          />
          <p className="text-sm font-medium text-primary">{entry.title}</p>
          <p className="text-sm text-secondary">
            {entry.by} · <time dateTime={entry.at}>{formatExact(entry.at)}</time>
          </p>
          {entry.detail && <p className="mt-1 text-sm text-primary">“{entry.detail}”</p>}
        </li>
      ))}
    </ol>
  )
}
