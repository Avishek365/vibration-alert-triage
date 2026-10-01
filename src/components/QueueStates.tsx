// Loading, empty and error states. Errors are neutral grey: red, amber and
// green are reserved for machine health, so a failed request never uses them.

const secondaryButton =
  'rounded-md border border-strong bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-subtle'

export function LoadingRows({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading alerts" role="status">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-hairline px-4 py-4">
          <div className="h-5 w-20 rounded-sm bg-subtle" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded-sm bg-subtle" />
            <div className="h-3 w-2/3 rounded-sm bg-subtle" />
          </div>
          <div className="h-4 w-24 rounded-sm bg-subtle" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="px-4 py-12 text-center">
      {filtered ? (
        <>
          <p className="font-medium text-heading">No alerts match these filters</p>
          <button type="button" className={`mt-4 ${secondaryButton}`} onClick={onClear}>
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p className="font-medium text-heading">No open alerts</p>
          <p className="mt-1 text-sm text-secondary">All caught up.</p>
        </>
      )}
    </div>
  )
}

export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title: string
  error: unknown
  onRetry: () => void
}) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className="flex items-start gap-3 px-4 py-6">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-secondary">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 4.5v4.5M8 11v.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className="font-medium text-heading">{title}</p>
        <p className="mt-1 text-sm text-secondary">{message}</p>
        <button type="button" className={`mt-3 ${secondaryButton}`} onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  )
}
