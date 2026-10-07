import { useCallback, useSyncExternalStore } from 'react'
import type { HealthState } from '../domain/types'
import { getSearch, navigate, subscribe, toQuery } from './useUrlFilters'

const KEY = 'machines'
const STATES: readonly HealthState[] = ['critical', 'warning', 'unknown', 'healthy']

export function parseMachinesParam(search: string): HealthState | null {
  const value = new URLSearchParams(search).get(KEY)
  return STATES.find((s) => s === value) ?? null
}

/**
 * Which machine list is open, kept in the URL (`?machines=warning`) so it is
 * still open after Back from the detail screen. Opening and closing replace
 * the current entry rather than adding history, so Back is not spent on them.
 */
export function useMachinesParam() {
  const search = useSyncExternalStore(subscribe, getSearch)
  const open = parseMachinesParam(search)

  const setOpen = useCallback((state: HealthState | null) => {
    const params = new URLSearchParams(window.location.search)
    if (state) params.set(KEY, state)
    else params.delete(KEY)
    const query = toQuery(params)
    if (query !== window.location.search) {
      navigate(query, window.history.state, { replace: true })
    }
  }, [])

  return [open, setOpen] as const
}
