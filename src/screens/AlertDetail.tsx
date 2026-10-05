import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ApiError } from '../api/mockApi'
import { ConfidencePanel } from '../components/ConfidencePanel'
import { DismissDialog } from '../components/DismissDialog'
import { EvidenceTable } from '../components/EvidenceTable'
import { HealthIndicator } from '../components/HealthIndicator'
import { ErrorState } from '../components/QueueStates'
import { TrendSection } from '../components/TrendSection'
import { TriageHistory } from '../components/TriageHistory'
import { FAULT_LABELS, STATUS_LABELS, formatMmS } from '../domain/format'
import { useAcknowledgeAlert, useAlert, useAlertTrend, useDismissAlert } from '../queries/alerts'

interface AlertDetailProps {
  id: string
  /** Href of the queue (current filters, no alert), for the Back link. */
  backHref: string
  onBack: () => void
}

const button =
  'inline-flex items-center gap-1.5 rounded-md border border-strong bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-subtle'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-lg border border-hairline bg-surface p-4 sm:p-5"
    >
      <h3 className="font-semibold text-heading">{title}</h3>
      {children}
    </section>
  )
}

export function AlertDetail({ id, backHref, onBack }: AlertDetailProps) {
  const detail = useAlert(id)
  const trend = useAlertTrend(id)
  const acknowledge = useAcknowledgeAlert()
  const dismiss = useDismissAlert()
  const [dismissing, setDismissing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the heading once the alert has loaded, so screen readers start here.
  const loaded = detail.isSuccess
  useEffect(() => {
    if (loaded) headingRef.current?.focus()
  }, [loaded])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Esc is not a character key, so a page-level shortcut is fine (WCAG 2.1.4).
    if (e.key === 'Escape' && !e.defaultPrevented && !dismissing) {
      e.preventDefault()
      onBack()
    }
  }

  const backLink = (
    <a
      href={backHref}
      onClick={(e) => {
        e.preventDefault()
        onBack()
      }}
      className="inline-flex items-center gap-1 text-sm font-medium text-accent underline underline-offset-2"
    >
      <span aria-hidden="true">←</span> Back to queue
    </a>
  )

  if (detail.isPending) {
    return (
      <div className="space-y-4">
        {backLink}
        <p role="status" className="text-sm text-secondary">
          Loading alert…
        </p>
      </div>
    )
  }

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404
    return (
      <div className="space-y-4" onKeyDown={onKeyDown}>
        {backLink}
        <div className="rounded-lg border border-hairline bg-surface">
          {notFound ? (
            <div role="alert" className="px-4 py-6">
              <p className="font-medium text-heading">Alert not found</p>
              <p className="mt-1 text-sm text-secondary">
                It may have been removed, or the link is wrong.
              </p>
            </div>
          ) : (
            <ErrorState
              title="This alert could not be loaded"
              error={detail.error}
              onRetry={() => detail.refetch()}
            />
          )}
        </div>
      </div>
    )
  }

  const { alert, asset, site, point } = detail.data
  const name = asset.name

  function runAcknowledge() {
    setNotice(null)
    acknowledge.mutate(alert.id, {
      onError: (error) =>
        setNotice(`Could not acknowledge ${name}. It has been put back. ${error.message}`),
    })
  }

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      {backLink}

      <header className="space-y-3 rounded-lg border border-hairline bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <HealthIndicator state={alert.severity} />
          <span className="rounded-sm border border-hairline px-1.5 text-xs text-secondary">
            {STATUS_LABELS[alert.status]}
          </span>
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-heading focus:outline-none"
        >
          {name} <span className="font-normal text-tertiary">{asset.tag}</span>
        </h2>
        <p className="text-sm text-secondary">
          {site.name} · {point.name}
        </p>
        <p className="text-sm text-primary">
          <span className="font-medium">{FAULT_LABELS[alert.faultType]}</span> ·{' '}
          <span className="tabular-nums">
            {formatMmS(alert.reading)} against a {alert.severity} limit of{' '}
            {formatMmS(alert.thresholds[alert.severity])}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {alert.status === 'new' && (
            <button type="button" className={button} onClick={runAcknowledge}>
              Acknowledge
            </button>
          )}
          {alert.status !== 'dismissed' && (
            <button
              type="button"
              className={button}
              onClick={() => {
                setNotice(null)
                setDismissing(true)
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      </header>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-primary">
        {notice}
      </p>

      <div className="rounded-lg border border-hairline bg-surface p-4 sm:p-5">
        {trend.isPending && <p className="text-sm text-secondary">Loading trend…</p>}
        {trend.isError && (
          <ErrorState
            title="The trend could not be loaded"
            error={trend.error}
            onRetry={() => trend.refetch()}
          />
        )}
        {trend.isSuccess && <TrendSection trend={trend.data} alert={alert} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Model confidence">
          <ConfidencePanel alert={alert} />
        </Card>
        <Card title="Triage history">
          <TriageHistory alert={alert} />
        </Card>
      </div>

      <Card title="Evidence">
        <EvidenceTable evidence={alert.evidence} />
      </Card>

      {dismissing && (
        <DismissDialog
          subject={[name, site.name, FAULT_LABELS[alert.faultType]].join(' · ')}
          onCancel={() => {
            setDismissing(false)
            headingRef.current?.focus()
          }}
          onConfirm={(input) => {
            setDismissing(false)
            headingRef.current?.focus()
            dismiss.mutate(
              { id: alert.id, input },
              {
                onError: (error) =>
                  setNotice(`Could not dismiss ${name}. It has been put back. ${error.message}`),
              },
            )
          }}
        />
      )}
    </div>
  )
}
