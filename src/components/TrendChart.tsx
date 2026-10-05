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
const MARGIN = { top: 28, right: 12, bottom: 28, left: 40 }

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
  const readoutId = useId()

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
                x2={width - MARGIN.right}
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

          <path
            d={path}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Drawn after the line so the labels sit on top, with a surface halo. */}
          {thresholdLines.map((t) => (
            <g key={t.key} data-threshold={t.key}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(t.value)}
                y2={y(t.value)}
                className={t.line}
                strokeWidth={1.5}
                strokeDasharray={t.dash}
              />
              <text
                x={width - MARGIN.right - 4}
                y={y(t.value) - 6}
                textAnchor="end"
                className={`${t.text} stroke-surface text-xs font-medium`}
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {t.label} {formatMmS(t.value)}
              </text>
            </g>
          ))}

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
        </svg>
      </div>

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
