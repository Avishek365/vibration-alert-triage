import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertRow } from '../components/AlertRow'
import { DismissDialog } from '../components/DismissDialog'
import { FilterBar } from '../components/FilterBar'
import { HealthSummary } from '../components/HealthSummary'
import { EmptyState, ErrorState, LoadingRows } from '../components/QueueStates'
import { FAULT_LABELS } from '../domain/format'
import type { Alert, Asset, Site } from '../domain/types'
import { useNow } from '../hooks/useNow'
import { useQueueKeyboard } from '../hooks/useQueueKeyboard'
import { DEFAULT_STATUS, hasActiveFilters, useUrlFilters } from '../hooks/useUrlFilters'
import { useAcknowledgeAlert, useAlerts, useDismissAlert } from '../queries/alerts'
import { useAssets, useSites } from '../queries/assets'

export function AlertQueue() {
  const [filters, setFilters] = useUrlFilters()
  const alerts = useAlerts(filters)
  const assets = useAssets()
  const sites = useSites()
  const acknowledge = useAcknowledgeAlert()
  const dismiss = useDismissAlert()
  const now = useNow()

  // Selection remembers its index so that when the selected alert leaves the
  // list (dismissed, or acknowledged under a "new" filter) the next row takes over.
  const [selection, setSelection] = useState<{ id: string | null; index: number }>({
    id: null,
    index: 0,
  })
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  /** Alert just acted on from the queue; if it disappears, focus moves to its replacement. */
  const actedOn = useRef<string | null>(null)

  const rows = useMemo(() => alerts.data ?? [], [alerts.data])
  const ids = useMemo(() => rows.map((a) => a.id), [rows])
  const assetsById = useMemo(
    () => new Map((assets.data ?? []).map((s) => [s.asset.id, s.asset])),
    [assets.data],
  )
  const sitesById = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s])), [sites.data])

  let selectedIndex = selection.id ? ids.indexOf(selection.id) : -1
  if (selectedIndex === -1 && rows.length > 0) {
    selectedIndex = Math.min(selection.index, rows.length - 1)
  }
  const selected: Alert | undefined = rows[selectedIndex]

  useEffect(() => {
    const id = actedOn.current
    if (!id || ids.includes(id)) return
    actedOn.current = null
    const active = document.activeElement
    if (selected && (!active || active === document.body)) {
      rowRefs.current.get(selected.id)?.focus()
    }
  }, [ids, selected])

  function select(id: string, focus = false) {
    setSelection({ id, index: ids.indexOf(id) })
    if (focus) rowRefs.current.get(id)?.focus()
  }

  function nameOf(alert: Alert) {
    return assetsById.get(alert.assetId)?.name ?? alert.assetId
  }

  function runAcknowledge(id: string) {
    const alert = rows.find((a) => a.id === id)
    if (!alert) return
    if (alert.status !== 'new') {
      setNotice(`${nameOf(alert)} is already ${alert.status}.`)
      return
    }
    setNotice(null)
    actedOn.current = id
    acknowledge.mutate(id, {
      onError: (error) =>
        setNotice(
          `Could not acknowledge ${nameOf(alert)}. It has been put back. ${messageOf(error)}`,
        ),
      onSettled: () => {
        if (actedOn.current === id) actedOn.current = null
      },
    })
  }

  function closeDialog(id: string) {
    setDismissingId(null)
    rowRefs.current.get(id)?.focus()
  }

  const onKeyDown = useQueueKeyboard({
    ids,
    selectedId: selected?.id,
    onMove: (id) => select(id, true),
    onAcknowledge: runAcknowledge,
    onDismiss: (id) => {
      setNotice(null)
      setDismissingId(id)
    },
  })

  const isPending = alerts.isPending || assets.isPending || sites.isPending
  const failed = [alerts, assets, sites].find((q) => q.isError)
  const dismissing = dismissingId ? rows.find((a) => a.id === dismissingId) : undefined

  let content
  if (failed) {
    content = (
      <ErrorState
        title="Alerts could not be loaded"
        error={failed.error}
        onRetry={() => [alerts, assets, sites].filter((q) => q.isError).forEach((q) => q.refetch())}
      />
    )
  } else if (isPending) {
    content = <LoadingRows />
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        filtered={hasActiveFilters(filters)}
        onClear={() => setFilters({ status: DEFAULT_STATUS })}
      />
    )
  } else {
    content = (
      <ul aria-label="Alerts">
        {rows.map((alert) => {
          const asset = assetsById.get(alert.assetId)
          const site = asset && sitesById.get(asset.siteId)
          const point = asset?.points.find((p) => p.id === alert.pointId)
          if (!asset || !site || !point) return null
          return (
            <AlertRow
              key={alert.id}
              alert={alert}
              asset={asset}
              site={site}
              point={point}
              now={now}
              selected={alert.id === selected?.id}
              rowRef={(el) => {
                if (el) rowRefs.current.set(alert.id, el)
                else rowRefs.current.delete(alert.id)
              }}
              onSelect={() => select(alert.id, true)}
              onAcknowledge={() => runAcknowledge(alert.id)}
              onDismiss={() => {
                setNotice(null)
                setDismissingId(alert.id)
              }}
            />
          )
        })}
      </ul>
    )
  }

  return (
    <div className="space-y-4">
      <HealthSummary siteId={filters.siteId} />
      <FilterBar filters={filters} sites={sites.data ?? []} onChange={setFilters} />

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-primary">
        {notice}
      </p>

      <section
        aria-labelledby="queue-heading"
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-lg border border-hairline bg-surface"
      >
        <div className="flex items-baseline justify-between border-b border-hairline px-4 py-3">
          <h2 id="queue-heading" className="font-semibold text-heading">
            Alert queue
          </h2>
          {alerts.isSuccess && (
            <span className="text-sm text-secondary tabular-nums">
              {rows.length} {rows.length === 1 ? 'alert' : 'alerts'}
            </span>
          )}
        </div>
        {content}
      </section>

      <p className="text-sm text-tertiary pointer-coarse:hidden">
        When the queue is focused: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>a</kbd> acknowledge ·{' '}
        <kbd>d</kbd> dismiss
      </p>

      {dismissing && (
        <DismissDialog
          subject={dismissSubject(dismissing, assetsById, sitesById)}
          onCancel={() => closeDialog(dismissing.id)}
          onConfirm={(input) => {
            const { id } = dismissing
            actedOn.current = id
            closeDialog(id)
            dismiss.mutate(
              { id, input },
              {
                onError: (error) =>
                  setNotice(
                    `Could not dismiss ${nameOf(dismissing)}. It has been put back. ${messageOf(error)}`,
                  ),
                onSettled: () => {
                  if (actedOn.current === id) actedOn.current = null
                },
              },
            )
          }}
        />
      )}
    </div>
  )
}

function dismissSubject(alert: Alert, assets: Map<string, Asset>, sites: Map<string, Site>) {
  const asset = assets.get(alert.assetId)
  const site = asset && sites.get(asset.siteId)
  return [asset?.name, site?.name, FAULT_LABELS[alert.faultType]].filter(Boolean).join(' · ')
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : ''
}
