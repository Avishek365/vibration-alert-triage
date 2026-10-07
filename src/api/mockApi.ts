// In-memory mock of the triage backend. Async, with simulated latency, so the
// UI exercises real loading and error states. Swap for a fetch client later.

import {
  acknowledge,
  canAcknowledge,
  canDismiss,
  compareAlerts,
  dismiss,
  matchesAlertFilters,
  validateDismissInput,
} from '../domain/alerts'
import { assetStatus, healthDriver, healthRank, isOpen } from '../domain/health'
import type {
  Alert,
  AlertDetail,
  AlertFilters,
  AlertTrend,
  AssetDetail,
  AssetFilters,
  AssetSummary,
  DismissInput,
  Site,
} from '../domain/types'
import { buildFixtures, buildTrend, type Fixtures } from '../fixtures'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface MockApiOptions {
  /** Simulated latency per call. */
  delayMs?: number
  /** Clock used for fixture timestamps and mutation times. */
  now?: () => Date
}

const OPERATIONS = [
  'listSites',
  'listAssets',
  'getAsset',
  'listAlerts',
  'getAlert',
  'getAlertTrend',
  'acknowledgeAlert',
  'dismissAlert',
] as const

export type Operation = (typeof OPERATIONS)[number]

const DEFAULT_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 300

export function createMockApi(options: MockApiOptions = {}) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const now = options.now ?? (() => new Date())

  let db: Fixtures = buildFixtures(now())
  let failing = new Set<Operation>()

  async function respond<T>(operation: Operation, produce: () => T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (failing.has(operation)) {
      throw new ApiError(503, `Simulated failure in ${operation}`)
    }
    // Clone so callers can never mutate the store.
    return structuredClone(produce())
  }

  const siteIdOf = (assetId: string) => db.assets.find((a) => a.id === assetId)?.siteId

  function findAlert(id: string): Alert {
    const alert = db.alerts.find((a) => a.id === id)
    if (!alert) throw new ApiError(404, `Alert ${id} not found`)
    return alert
  }

  function replaceAlert(next: Alert): Alert {
    db = { ...db, alerts: db.alerts.map((a) => (a.id === next.id ? next : a)) }
    return next
  }

  function summarise(assetId: string): AssetSummary {
    const asset = db.assets.find((a) => a.id === assetId)
    if (!asset) throw new ApiError(404, `Asset ${assetId} not found`)
    const alerts = db.alerts.filter((a) => a.assetId === asset.id)
    const driver = healthDriver(asset, alerts)
    return {
      asset,
      ...assetStatus(asset, alerts),
      ...(driver ? { driver } : {}),
      openAlertCount: alerts.filter(isOpen).length,
    }
  }

  return {
    listSites: (): Promise<Site[]> => respond('listSites', () => db.sites),

    /** Worst health first, then by tag. */
    listAssets: (filters: AssetFilters = {}): Promise<AssetSummary[]> =>
      respond('listAssets', () =>
        db.assets
          .filter((a) => !filters.siteId || a.siteId === filters.siteId)
          .map((a) => summarise(a.id))
          .sort(
            (x, y) =>
              healthRank(y.health) - healthRank(x.health) || x.asset.tag.localeCompare(y.asset.tag),
          ),
      ),

    getAsset: (id: string): Promise<AssetDetail> =>
      respond('getAsset', () => {
        const summary = summarise(id)
        const site = db.sites.find((s) => s.id === summary.asset.siteId)!
        const alerts = db.alerts.filter((a) => a.assetId === id).sort(compareAlerts)
        return { ...summary, site, alerts }
      }),

    /** Most severe first, then newest. */
    listAlerts: (filters: AlertFilters = {}): Promise<Alert[]> =>
      respond('listAlerts', () =>
        db.alerts.filter((a) => matchesAlertFilters(a, filters, siteIdOf)).sort(compareAlerts),
      ),

    getAlert: (id: string): Promise<AlertDetail> =>
      respond('getAlert', () => {
        const alert = findAlert(id)
        const asset = db.assets.find((a) => a.id === alert.assetId)!
        const site = db.sites.find((s) => s.id === asset.siteId)!
        const point = asset.points.find((p) => p.id === alert.pointId)!
        return { alert, asset, site, point }
      }),

    getAlertTrend: (id: string): Promise<AlertTrend> =>
      respond('getAlertTrend', () => {
        const alert = findAlert(id)
        const point = db.assets
          .find((a) => a.id === alert.assetId)!
          .points.find((p) => p.id === alert.pointId)!
        return buildTrend(alert, point, now())
      }),

    acknowledgeAlert: (id: string): Promise<Alert> =>
      respond('acknowledgeAlert', () => {
        const alert = findAlert(id)
        if (!canAcknowledge(alert)) {
          throw new ApiError(409, `Alert ${id} is ${alert.status} and cannot be acknowledged`)
        }
        return replaceAlert(acknowledge(alert, now()))
      }),

    dismissAlert: (id: string, input: DismissInput): Promise<Alert> =>
      respond('dismissAlert', () => {
        const invalid = validateDismissInput(input)
        if (invalid) throw new ApiError(400, invalid)
        const alert = findAlert(id)
        if (!canDismiss(alert)) {
          throw new ApiError(409, `Alert ${id} is already dismissed`)
        }
        return replaceAlert(dismiss(alert, input, now()))
      }),

    /** Make the given operations reject with a 503. Pass [] to clear. */
    setFailures(operations: readonly Operation[]) {
      failing = new Set(operations)
    },

    /** Restore the original fixtures and clear simulated failures. */
    reset() {
      db = buildFixtures(now())
      failing = new Set()
    },
  }
}

export type MockApi = ReturnType<typeof createMockApi>

/** Shared instance used by the query hooks. */
export const api = createMockApi()

// Dev only: lets the accessibility audit open the app in its error state.
// Stripped from production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const fail = (window as { __A11Y_FAIL__?: Operation }).__A11Y_FAIL__
  if (fail) api.setFailures([fail])
}
