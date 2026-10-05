import { useCallback, useSyncExternalStore } from 'react'
import { getSearch, navigate, subscribe, toQuery } from './useUrlFilters'

const KEY = 'alert'
const ALERT_ID = /^[\w-]{1,64}$/

/** History entries pushed by `open` carry this, so `close` can simply go back. */
interface OpenedState {
  openedFromQueue: true
}

export function parseAlertParam(search: string): string | null {
  const id = new URLSearchParams(search).get(KEY)
  return id && ALERT_ID.test(id) ? id : null
}

/**
 * The alert shown on the detail screen, stored as `?alert=` next to the queue
 * filters. Opening adds a history entry; closing goes back to it when possible,
 * so the queue returns with its filters intact.
 */
export function useAlertParam() {
  const search = useSyncExternalStore(subscribe, getSearch)
  const alertId = parseAlertParam(search)

  const open = useCallback((id: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set(KEY, id)
    const state: OpenedState = { openedFromQueue: true }
    navigate(toQuery(params), state)
  }, [])

  const close = useCallback(() => {
    if ((window.history.state as Partial<OpenedState> | null)?.openedFromQueue) {
      window.history.back()
      return
    }
    // Arrived by a shared link: there is no queue entry to go back to.
    const params = new URLSearchParams(window.location.search)
    params.delete(KEY)
    navigate(toQuery(params))
  }, [])

  return { alertId, open, close }
}
