import { useAssets } from '../queries/assets'
import type { HealthState } from '../domain/types'
import { HealthIndicator } from './HealthIndicator'

const ORDER: HealthState[] = ['critical', 'warning', 'unknown', 'healthy']

/** Machine health counts for the current site filter. */
export function HealthSummary({ siteId }: { siteId?: string }) {
  const assets = useAssets(siteId ? { siteId } : {})

  return (
    <section aria-label="Machine health" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="text-sm font-medium text-tertiary">Machines</h2>
      {assets.isPending && <span className="text-sm text-tertiary">Loading…</span>}
      {assets.isError && (
        <span className="text-sm text-secondary">
          Machine health unavailable.{' '}
          <button
            type="button"
            className="font-medium text-accent underline"
            onClick={() => assets.refetch()}
          >
            Retry
          </button>
        </span>
      )}
      {assets.isSuccess && (
        <ul className="flex flex-wrap items-center gap-3">
          {ORDER.map((state) => (
            <li key={state}>
              <HealthIndicator
                state={state}
                count={assets.data.filter((a) => a.health === state).length}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
