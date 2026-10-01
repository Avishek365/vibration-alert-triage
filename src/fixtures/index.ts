import type { Alert, Asset, Site } from '../domain/types'
import { buildAlerts } from './alerts'
import { buildAssets } from './assets'
import { createRandom } from './random'
import { sites } from './sites'

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
  return {
    sites: structuredClone(sites),
    assets,
    alerts: buildAlerts(now, assets, random),
  }
}
