import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatAxisTime, formatDayTime, formatMmS } from '../domain/format'
import { describeReading } from '../domain/trend'
import type { AlertTrend, Thresholds } from '../domain/types'
import { useElementWidth } from '../hooks/useElementWidth'

interface TrendChartProps {
  trend: AlertTrend
  thresholds: Thresholds
  triggeredAt: string
  /** Id of the text description that stands in for the chart. */
  descriptionId: string
}

const HOUR_MS = 60 * 60 * 1000
/** The right margin holds the limit labels, outside the plot, so they never cover data. */
const MARGIN = { top: 28, right: 76, bottom: 28, left: 40 }
/** Halo for the "No data since" label, which only ever sits inside the empty gap. */
const HALO_WIDTH = 6
/** Height of a two-line limit label, used to keep the two labels apart. */
const LABEL_BLOCK = 28
/** Narrowest gap that can hold the "No data since" label inside it. */
const GAP_LABEL_MIN = 150

/** Rounded axis maximum and evenly spaced ticks from 0. */
function niceScale(max: number, targetTicks: number) {
  const raw = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => round(i * step))
  return { top, ticks }
}

const round = (v: number) => Math.round(v * 100) / 100

/** Local clock hours divisible by `stepHours`, inside the window. */
function timeTicks(start: number, end: number, stepHours: number): number[] {
  const ticks: number[] = []
  const first = new Date(start)
  first.setMinutes(0, 0, 0)
  for (let t = first.getTime(); t <= end; t += HOUR_MS) {
    if (t >= start && new Date(t).getHours() % stepHours === 0) ticks.push(t)
  }
  return ticks
}

/**
 * Hourly vibration velocity with labelled warning and critical limits.
 * Single series, so no legend: the section heading names it. Hover or use the
 * arrow keys to read a value; the readout below repeats it for screen readers.
 */
export function TrendChart({ trend, thresholds, triggeredAt, descriptionId }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef, 640)
  const narrow = width < 480
  const height = narrow ? 220 : 260
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 1)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const plotRight = MARGIN.left + plotW
  const readoutId = useId()
  const hatchId = `hatch-${useId().replace(/:/g, '')}`

  const { points } = trend
  const start = Date.parse(trend.windowStart)
  const end = Date.parse(trend.windowEnd)
  const [active, setActive] = useState<number | null>(null)

  const { top, ticks } = useMemo(
    () =>
      niceScale(
        Math.max(thresholds.critical * 1.15, ...points.map((p) => p.value * 1.1)),
        narrow ? 4 : 5,
      ),
    [points, thresholds.critical, narrow],
  )
  const x = (ms: number) => MARGIN.left + ((ms - start) / (end - start)) * plotW
  const y = (v: number) => MARGIN.top + plotH - (v / top) * plotH

  const path = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${x(Date.parse(p.at)).toFixed(1)},${y(p.value).toFixed(1)}`,
    )
    .join(' ')
  const trigger = Date.parse(triggeredAt)
  const triggerVisible = trigger >= start && trigger <= end
  const last = points.at(-1)
  const current = active === null ? null : points[active]
  // A quiet sensor leaves the rest of the window empty: shade it and say so.
  const gapStart = trend.sensorStatus === 'online' ? null : Date.parse(trend.lastReadingAt)
  const gapX = gapStart === null ? 0 : x(Math.max(gapStart, start))
  const gapWidth = plotRight - gapX
  const gapLabelInside = gapWidth >= GAP_LABEL_MIN

  function nearestIndex(clientX: number, rect: DOMRect) {
    const ms = start + ((clientX - rect.left - MARGIN.left) / plotW) * (end - start)
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(Date.parse(points[i].at) - ms) < Math.abs(Date.parse(points[best].at) - ms)) {
        best = i
      }
    }
    return best
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (points.length) setActive(nearestIndex(e.clientX, e.currentTarget.getBoundingClientRect()))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!points.length) return
    const lastIndex = points.length - 1
    const from = active ?? lastIndex
    const next: Record<string, number> = {
      ArrowLeft: Math.max(from - 1, 0),
      ArrowRight: Math.min(from + 1, lastIndex),
      Home: 0,
      End: lastIndex,
    }
    if (e.key in next) {
      e.preventDefault()
      setActive(next[e.key])
    }
  }

  const thresholdLines = [
    {
      key: 'critical',
      value: thresholds.critical,
      label: 'Critical',
      dash: '2 3',
      line: 'stroke-health-critical-strong',
      text: 'fill-health-critical-text',
    },
    {
      key: 'warning',
      value: thresholds.warning,
      label: 'Warning',
      dash: '8 4',
      line: 'stroke-health-warning-strong',
      text: 'fill-health-warning-text',
    },
  ]

  // Each label's first line sits just above its limit line. If the limits are
  // close, push the labels apart so they never overlap, staying inside the chart.
  const labelY = (() => {
    let critical = y(thresholds.critical) - 2
    let warning = y(thresholds.warning) - 2
    const overlap = LABEL_BLOCK - (warning - critical)
    if (overlap > 0) {
      critical -= overlap / 2
      warning += overlap / 2
    }
    critical = Math.max(critical, 12)
    warning = Math.min(Math.max(warning, critical + LABEL_BLOCK), height - 18)
    return { critical, warning } as Record<string, number>
  })()

  return (
    <div>
      <div
        ref={containerRef}
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label="Vibration velocity in mm/s. Use the arrow keys, Home and End to read values."
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? (points.length ? points.length - 1 : null))}
        className="w-full overflow-hidden rounded-md focus-visible:outline-offset-4"
      >
        <svg
          width={width}
          height={height}
          aria-hidden="true"
          className="block touch-pan-y select-none"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
        >
          <text
            x={MARGIN.left - 8}
            y={MARGIN.top - 12}
            textAnchor="end"
            className="fill-tertiary text-xs"
          >
            mm/s
          </text>

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={plotRight}
                y1={y(t)}
                y2={y(t)}
                className="stroke-hairline"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-tertiary text-xs tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}

          {timeTicks(start, end, narrow ? 12 : 6).map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 8}
              textAnchor="middle"
              className="fill-tertiary text-xs tabular-nums"
            >
              {formatAxisTime(new Date(t).toISOString())}
            </text>
          ))}

          {triggerVisible && (
            <g data-marker="alert">
              <line
                x1={x(trigger)}
                x2={x(trigger)}
                y1={MARGIN.top - 4}
                y2={MARGIN.top + plotH}
                className="stroke-secondary"
                strokeWidth={1}
              />
              <text
                x={x(trigger) + (x(trigger) > width * 0.6 ? -6 : 6)}
                y={MARGIN.top - 10}
                textAnchor={x(trigger) > width * 0.6 ? 'end' : 'start'}
                className="fill-secondary text-xs"
              >
                Alert raised {formatDayTime(triggeredAt)}
              </text>
            </g>
          )}

          {gapStart !== null && gapWidth > 0 && (
            <g data-gap>
              <defs>
                <pattern
                  id={hatchId}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" className="stroke-strong" strokeWidth="2" />
                </pattern>
              </defs>
              <rect
                x={gapX}
                y={MARGIN.top}
                width={gapWidth}
                height={plotH}
                fill={`url(#${hatchId})`}
                className="opacity-70"
              />
              {/* Inside the gap there is no data line, so the halo only covers hatching.
                  A narrower gap gets a caption under the chart instead. */}
              {gapLabelInside && (
                <text
                  x={gapX + gapWidth / 2}
                  y={MARGIN.top + 16}
                  textAnchor="middle"
                  className="fill-primary stroke-surface text-xs font-medium"
                  strokeWidth={HALO_WIDTH}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  No data since {formatDayTime(trend.lastReadingAt)}
                </text>
              )}
            </g>
          )}

          {/* Limit lines sit under the data line and run a few px into the margin,
              to their labels. */}
          {thresholdLines.map((t) => (
            <line
              key={t.key}
              data-threshold={t.key}
              x1={MARGIN.left}
              x2={plotRight + 4}
              y1={y(t.value)}
              y2={y(t.value)}
              className={t.line}
              strokeWidth={1.5}
              strokeDasharray={t.dash}
            />
          ))}

          <path
            d={path}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {last && (
            <circle
              cx={x(Date.parse(last.at))}
              cy={y(last.value)}
              r={4}
              className="fill-primary stroke-surface"
              strokeWidth={2}
            />
          )}

          {current && (
            <g data-crosshair>
              <line
                x1={x(Date.parse(current.at))}
                x2={x(Date.parse(current.at))}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                className="stroke-strong"
                strokeWidth={1}
              />
              <circle
                cx={x(Date.parse(current.at))}
                cy={y(current.value)}
                r={5}
                className="fill-primary stroke-surface"
                strokeWidth={2}
              />
            </g>
          )}

          {/* Limit labels live in the right margin, outside the plot: nothing they
              draw can overlap the data line, so they need no halo. */}
          {thresholdLines.map((t) => (
            <text
              key={t.key}
              data-threshold-label={t.key}
              x={plotRight + 8}
              y={labelY[t.key]}
              textAnchor="start"
              className={`${t.text} text-xs`}
            >
              <tspan x={plotRight + 8} className="font-medium">
                {t.label}
              </tspan>{' '}
              <tspan x={plotRight + 8} dy="1.2em" className="tabular-nums">
                {formatMmS(t.value)}
              </tspan>
            </text>
          ))}
        </svg>
      </div>

      {gapStart !== null && gapWidth > 0 && !gapLabelInside && (
        <p data-gap-caption className="mt-2 flex items-center gap-2 text-xs text-secondary">
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3">
            <rect width="12" height="12" fill={`url(#${hatchId})`} />
          </svg>
          No data since {formatDayTime(trend.lastReadingAt)}
        </p>
      )}

      <p
        id={readoutId}
        aria-live="polite"
        className="mt-2 min-h-5 text-sm text-primary tabular-nums"
      >
        {current ? (
          <>
            <span className="font-medium">{formatDayTime(current.at)}</span>:{' '}
            {describeReading(current.value, thresholds)}
          </>
        ) : (
          <span className="text-tertiary">
            Hover over the chart, or focus it and use the arrow keys, to read values.
          </span>
        )}
      </p>
    </div>
  )
}
