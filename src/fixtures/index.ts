import type { Alert, Asset, Site } from '../domain/types'
import { buildAlerts } from './alerts'
import { buildAssets } from './assets'
import { createRandom } from './random'
import { sites } from './sites'
import { buildTrend } from './trends'

export { buildTrend } from './trends'

export interface Fixtures {
  sites: Site[]
  assets: Asset[]
  alerts: Alert[]
}

const SEED = 20260930

/**
 * Builds the fictional dataset with timestamps relative to `now`.
 * Values are identical for any given `now`, so tests can pin it.
 */
export function buildFixtures(now: Date): Fixtures {
  const random = createRandom(SEED)
  const assets = buildAssets(now, random)
  const alerts = buildAlerts(now, assets, random)

  // A point with alerts reports the last value of its most recent alert's trend,
  // so the chart and the machine's latest reading always agree.
  for (const asset of assets) {
    for (const point of asset.points) {
      const latest = alerts
        .filter((a) => a.pointId === point.id)
        .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]
      const last = latest && buildTrend(latest, point, now).points.at(-1)
      if (last) point.latestReading = last.value
    }
  }

  return { sites: structuredClone(sites), assets, alerts }
}
