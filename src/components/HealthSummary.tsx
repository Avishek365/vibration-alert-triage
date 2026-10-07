import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { HEALTH_NOTE_LABELS, formatDayTime, formatMmS } from '../domain/format'
import type { AssetSummary, HealthState, MeasurementPoint } from '../domain/types'
import { useMachinesParam } from '../hooks/useMachinesParam'
import { useNow } from '../hooks/useNow'
import { useAssets, useSites } from '../queries/assets'
import { HealthIndicator } from './HealthIndicator'
import { SensorStatusIndicator } from './SensorStatusIndicator'

const ORDER: HealthState[] = ['critical', 'warning', 'unknown', 'healthy']

const STATE_LABELS: Record<HealthState, string> = {
  critical: 'Critical',
  warning: 'Warning',
  unknown: 'Unknown',
  healthy: 'Healthy',
}

/** The point whose latest reading is highest relative to its warning limit. */
function worstPoint(points: readonly MeasurementPoint[]): MeasurementPoint {
  return points.reduce((worst, p) =>
    p.latestReading / p.thresholds.warning > worst.latestReading / worst.thresholds.warning
      ? p
      : worst,
  )
}

const SENSOR_RANK = { online: 0, stale: 1, offline: 2 } as const

/** The point whose sensor is in the worst state, if any is not online. */
function quietestSensor(points: readonly MeasurementPoint[]): MeasurementPoint | undefined {
  const worst = points.reduce((a, b) =>
    SENSOR_RANK[b.sensorStatus] > SENSOR_RANK[a.sensorStatus] ? b : a,
  )
  return worst.sensorStatus === 'online' ? undefined : worst
}

/**
 * One machine in a health list: its reading against its own critical limit,
 * why it is in this state when the reading alone does not explain it, and the
 * sensor state when the sensor is not online.
 */
function MachineItem({
  summary: { asset, health, note, driver, openAlertCount, relevantAlertId },
  siteName,
  now,
  onOpenAlert,
  linkRef,
}: {
  summary: AssetSummary
  siteName: string
  now: Date
  onOpenAlert: (alertId: string) => void
  linkRef: (alertId: string, el: HTMLAnchorElement | null) => void
}) {
  const point = asset.points.find((p) => p.id === driver?.pointId) ?? worstPoint(asset.points)
  const quiet = point.sensorStatus !== 'online'
  const sensor = quietestSensor(asset.points)
  // Critical or Warning from an open alert while the reading is under that limit.
  const reason =
    driver?.cause === 'alert' && (health === 'critical' || health === 'warning')
      ? `Open ${health} alert; latest reading below limit`
      : null

  const content = (
    <>
      <span className="font-medium text-heading">
        {asset.name} <span className="font-normal text-tertiary">{asset.tag}</span>
      </span>
      <span className="text-secondary">{siteName}</span>
      <span data-reading className="text-secondary tabular-nums">
        {quiet ? 'Last reading' : 'Latest'}{' '}
        <span className="text-primary">{formatMmS(point.latestReading)}</span>
        {quiet && <> at {formatDayTime(point.lastSeenAt)}</>} · critical limit{' '}
        {point.thresholds.critical.toFixed(2)} · {point.name}
      </span>
      {reason && <span className="text-primary">{reason}</span>}
      {/* Name the sensor when it is not the one the reading comes from, so a stale
          sensor is never read as describing the reading beside it. */}
      {sensor && <SensorStatusIndicator point={sensor} now={now} named={sensor.id !== point.id} />}
      <span className="text-secondary">
        {openAlertCount === 0
          ? 'No open alerts'
          : `${openAlertCount} open ${openAlertCount === 1 ? 'alert' : 'alerts'}`}
      </span>
      {note && <HealthNoteLabel note={note} />}
    </>
  )
  const row = 'flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm'

  return (
    <li className="border-b border-hairline last:border-b-0">
      {relevantAlertId ? (
        // The whole row is one link, so it is a single Tab stop and opens with Enter.
        <a
          ref={(el) => linkRef(relevantAlertId, el)}
          href={`?alert=${encodeURIComponent(relevantAlertId)}`}
          data-alert-link={relevantAlertId}
          onClick={(e) => {
            e.preventDefault()
            onOpenAlert(relevantAlertId)
          }}
          className={`${row} hover:bg-subtle focus-visible:outline-offset-[-2px]`}
        >
          {content}
          <span aria-hidden="true" className="ml-auto text-tertiary">
            ›
          </span>
          <span className="sr-only">
            , opens {openAlertCount > 0 ? 'its latest open alert' : 'its latest dismissed alert'}
          </span>
        </a>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  )
}

/** Small neutral label explaining a health state that involves a dismissed alert. */
export function HealthNoteLabel({ note }: { note: NonNullable<AssetSummary['note']> }) {
  return (
    <span
      data-note={note}
      className="inline-block rounded-sm border border-strong px-1.5 text-xs whitespace-nowrap text-secondary"
    >
      {HEALTH_NOTE_LABELS[note]}
    </span>
  )
}

/**
 * Machine health counts for the current site filter. Each count is a button
 * that opens the list of machines in that state.
 */
interface HealthSummaryProps {
  siteId?: string
  /** Opens an alert's detail screen. */
  onOpenAlert: (alertId: string) => void
  /** Row to focus once its list is showing, e.g. after Back from that alert. */
  focusAlertId?: string | null
}

export function HealthSummary({ siteId, onOpenAlert, focusAlertId }: HealthSummaryProps) {
  const assets = useAssets(siteId ? { siteId } : {})
  const sites = useSites()
  const [open, setOpen] = useMachinesParam()
  const links = useRef(new Map<string, HTMLAnchorElement>())
  const restored = useRef(false)

  // Back from an alert opened here: the list is open again (it is in the URL),
  // so put focus back on that row, once.
  useEffect(() => {
    if (restored.current || !focusAlertId || !open || !assets.isSuccess) return
    const link = links.current.get(focusAlertId)
    if (!link) return
    restored.current = true
    link.focus()
  }, [focusAlertId, open, assets.isSuccess, assets.data])
  const panelId = useId()
  const buttons = useRef(new Map<HealthState, HTMLButtonElement>())
  const now = useNow()

  const siteName = (id: string) => sites.data?.find((s) => s.id === id)?.name ?? ''
  const inState = (state: HealthState) => (assets.data ?? []).filter((a) => a.health === state)

  function close() {
    const state = open
    setOpen(null)
    if (state) buttons.current.get(state)?.focus()
  }

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Stop here so the page-level Esc (back to queue) does not also fire.
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <section aria-label="Machine health">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
          <ul className="flex flex-wrap items-center gap-2">
            {ORDER.map((state) => (
              <li key={state}>
                <button
                  ref={(el) => {
                    if (el) buttons.current.set(state, el)
                    else buttons.current.delete(state)
                  }}
                  type="button"
                  aria-expanded={open === state}
                  aria-controls={panelId}
                  onClick={() => setOpen(open === state ? null : state)}
                  className={`rounded-md border p-1 hover:bg-subtle ${
                    open === state ? 'border-accent bg-accent-subtle' : 'border-transparent'
                  }`}
                >
                  <HealthIndicator state={state} count={inState(state).length} />{' '}
                  <span className="sr-only">machines</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div id={panelId} hidden={!open}>
        {open && assets.isSuccess && (
          <div
            role="region"
            aria-label={`${STATE_LABELS[open]} machines`}
            onKeyDown={onPanelKeyDown}
            className="mt-3 rounded-lg border border-hairline bg-surface"
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
              <h3 className="text-sm font-semibold text-heading">
                {STATE_LABELS[open]} machines{' '}
                <span className="font-normal text-secondary tabular-nums">
                  ({inState(open).length})
                </span>
              </h3>
              <button
                type="button"
                onClick={close}
                className="text-sm font-medium text-accent underline underline-offset-2"
              >
                Close
              </button>
            </div>
            {inState(open).length === 0 ? (
              <p className="px-4 py-3 text-sm text-secondary">No machines in this state.</p>
            ) : (
              <ul aria-label={`${STATE_LABELS[open]} machines`}>
                {inState(open).map((summary) => (
                  <MachineItem
                    key={summary.asset.id}
                    summary={summary}
                    siteName={siteName(summary.asset.siteId)}
                    now={now}
                    onOpenAlert={onOpenAlert}
                    linkRef={(id, el) => {
                      if (el) links.current.set(id, el)
                      else links.current.delete(id)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
