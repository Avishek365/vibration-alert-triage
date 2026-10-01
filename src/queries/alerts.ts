import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../api/mockApi'
import { acknowledge, dismiss, matchesAlertFilters } from '../domain/alerts'
import type { Alert, AlertDetail, AlertFilters, DismissInput } from '../domain/types'
import { queryKeys } from './keys'

export function useAlerts(filters: AlertFilters = {}) {
  return useQuery({
    queryKey: queryKeys.alerts.list(filters),
    queryFn: () => api.listAlerts(filters),
  })
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: queryKeys.alerts.detail(id),
    queryFn: () => api.getAlert(id),
  })
}

export function useAlertTrend(id: string) {
  return useQuery({
    queryKey: queryKeys.alerts.trend(id),
    queryFn: () => api.getAlertTrend(id),
    // History before the alert never changes.
    staleTime: Infinity,
  })
}

type Snapshot = [readonly unknown[], unknown][]

/**
 * Applies `update` to the alert everywhere it is cached and returns the
 * previous data for rollback. Lists drop the alert if it no longer matches
 * their filters (for example, a dismissed alert in a "new only" list).
 */
async function patchCachedAlert(
  queryClient: QueryClient,
  id: string,
  update: (alert: Alert) => Alert,
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.alerts.all })

  const snapshot: Snapshot = [
    ...queryClient.getQueriesData({ queryKey: queryKeys.alerts.lists }),
    ...queryClient.getQueriesData({ queryKey: queryKeys.alerts.detail(id) }),
  ]

  for (const [key, data] of queryClient.getQueriesData<Alert[]>({
    queryKey: queryKeys.alerts.lists,
  })) {
    if (!data) continue
    const filters = (key[2] ?? {}) as AlertFilters
    queryClient.setQueryData<Alert[]>(
      key,
      data.flatMap((alert) => {
        if (alert.id !== id) return [alert]
        const next = update(alert)
        // The alert is already in this list, so its site matches; only recheck the rest.
        return matchesAlertFilters(next, filters, () => filters.siteId) ? [next] : []
      }),
    )
  }

  queryClient.setQueryData<AlertDetail>(queryKeys.alerts.detail(id), (detail) =>
    detail ? { ...detail, alert: update(detail.alert) } : detail,
  )

  return snapshot
}

function restore(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
}

/** Alert changes also change asset health, so refresh both. */
function invalidateAfterMutation(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }),
  ])
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.acknowledgeAlert(id),
    onMutate: (id) => patchCachedAlert(queryClient, id, (a) => acknowledge(a, new Date())),
    onError: (_error, _id, snapshot) => restore(queryClient, snapshot),
    onSettled: () => invalidateAfterMutation(queryClient),
  })
}

export function useDismissAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DismissInput }) => api.dismissAlert(id, input),
    onMutate: ({ id, input }) =>
      patchCachedAlert(queryClient, id, (a) => dismiss(a, input, new Date())),
    onError: (_error, _vars, snapshot) => restore(queryClient, snapshot),
    onSettled: () => invalidateAfterMutation(queryClient),
  })
}
