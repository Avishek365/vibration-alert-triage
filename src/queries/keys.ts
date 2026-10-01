import type { AlertFilters, AssetFilters } from '../domain/types'

/** Hierarchical keys, so `alerts.all` invalidates every alert query. */
export const queryKeys = {
  sites: ['sites'] as const,
  assets: {
    all: ['assets'] as const,
    list: (filters: AssetFilters = {}) => ['assets', 'list', filters] as const,
    detail: (id: string) => ['assets', 'detail', id] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    lists: ['alerts', 'list'] as const,
    list: (filters: AlertFilters = {}) => ['alerts', 'list', filters] as const,
    detail: (id: string) => ['alerts', 'detail', id] as const,
    trend: (id: string) => ['alerts', 'trend', id] as const,
  },
}
