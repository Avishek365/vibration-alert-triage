import { exceedance, formatHz, formatMmS } from '../domain/format'
import type { Evidence } from '../domain/types'

/** Frequency bands that exceeded their learned baseline. Scrolls sideways on narrow screens. */
export function EvidenceTable({ evidence }: { evidence: readonly Evidence[] }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Evidence bands"
      className="overflow-x-auto rounded-md border border-hairline"
    >
      <table className="w-full min-w-[32rem] text-left text-sm tabular-nums">
        <thead className="bg-subtle text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Band
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Range
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Observed
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Baseline
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Above baseline
            </th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((e) => (
            <tr key={e.bandLabel} className="border-t border-hairline">
              <th scope="row" className="px-3 py-2 font-medium text-primary">
                {e.bandLabel}
              </th>
              <td className="px-3 py-2 text-secondary">
                {formatHz(e.lowHz)}–{formatHz(e.highHz)}
              </td>
              <td className="px-3 py-2 text-right text-primary">{formatMmS(e.observed)}</td>
              <td className="px-3 py-2 text-right text-secondary">{formatMmS(e.baseline)}</td>
              <td className="px-3 py-2 text-right text-primary">{exceedance(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
