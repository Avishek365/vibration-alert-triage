import { useQuery } from '@tanstack/react-query'
import { api } from '../api/mockApi'
import type { AssetFilters } from '../domain/types'
import { queryKeys } from './keys'

export function useSites() {
  return useQuery({ queryKey: queryKeys.sites, queryFn: () => api.listSites() })
}

export function useAssets(filters: AssetFilters = {}) {
  return useQuery({
    queryKey: queryKeys.assets.list(filters),
    queryFn: () => api.listAssets(filters),
  })
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: queryKeys.assets.detail(id),
    queryFn: () => api.getAsset(id),
  })
}
