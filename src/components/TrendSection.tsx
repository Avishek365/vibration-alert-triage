import { useId, useState } from 'react'
import { formatDayTime, formatMmS } from '../domain/format'
import { describeTrend, thresholdPosition } from '../domain/trend'
import type { Alert, AlertTrend } from '../domain/types'
import { TrendChart } from './TrendChart'

const POSITION_LABELS = {
  above_critical: 'Above critical',
  above_warning: 'Above warning',
  below_warning: 'Below warning',
} as const

/** Chart, its written description, and an optional table of every reading. */
export function TrendSection({ trend, alert }: { trend: AlertTrend; alert: Alert }) {
  const headingId = useId()
  const descriptionId = useId()
  const tableId = useId()
  const [showTable, setShowTable] = useState(false)

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="font-semibold text-heading">
        Vibration velocity, 48 hours
      </h3>

      <TrendChart
        trend={trend}
        thresholds={alert.thresholds}
        triggeredAt={alert.triggeredAt}
        descriptionId={descriptionId}
      />

      <p id={descriptionId} className="text-sm text-secondary">
        {describeTrend(trend, alert)}
      </p>

      <button
        type="button"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((v) => !v)}
        className="text-sm font-medium text-accent underline underline-offset-2"
      >
        {showTable ? 'Hide data table' : 'Show data table'}
      </button>

      <div id={tableId} hidden={!showTable}>
        {showTable && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Vibration readings"
            className="max-h-80 overflow-auto rounded-md border border-hairline"
          >
            <table className="w-full text-left text-sm tabular-nums">
              <caption className="sr-only">
                Hourly vibration velocity readings, {trend.points.length} rows
              </caption>
              <thead className="sticky top-0 bg-subtle text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Time
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Velocity
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Against limits
                  </th>
                </tr>
              </thead>
              <tbody>
                {trend.points.map((p) => (
                  <tr key={p.at} className="border-t border-hairline">
                    <td className="px-3 py-1.5">{formatDayTime(p.at)}</td>
                    <td className="px-3 py-1.5 text-right">{formatMmS(p.value)}</td>
                    <td className="px-3 py-1.5 text-secondary">
                      {POSITION_LABELS[thresholdPosition(p.value, alert.thresholds)]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
