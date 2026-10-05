import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { CONFIDENCE_BANDS } from '../domain/confidence'
import type { AlertFilters, AlertStatus, Severity } from '../domain/types'

const STATUSES: readonly AlertStatus[] = ['new', 'acknowledged', 'dismissed']
const SEVERITIES: readonly Severity[] = ['critical', 'warning']

/** The queue shows open alerts unless the URL says otherwise. */
export const DEFAULT_STATUS: AlertStatus[] = ['new', 'acknowledged']

function readList<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]) {
  const values = (params.get(key) ?? '')
    .split(',')
    .filter((v): v is T => (allowed as readonly string[]).includes(v))
  // Keep allowed order and drop duplicates, so equal filters serialise the same.
  return allowed.filter((v) => values.includes(v))
}

/** Unknown keys and values are ignored rather than breaking the page. */
export function parseFilters(search: string): AlertFilters {
  const params = new URLSearchParams(search)
  const status = readList(params, 'status', STATUSES)
  const severity = readList(params, 'severity', SEVERITIES)
  const confidence = readList(params, 'confidence', CONFIDENCE_BANDS)
  const siteId = params.get('site')?.trim()
  return {
    status: status.length ? status : DEFAULT_STATUS,
    ...(severity.length ? { severity } : {}),
    ...(confidence.length ? { confidence } : {}),
    ...(siteId ? { siteId } : {}),
  }
}

function sameList(a: readonly string[] = [], b: readonly string[] = []) {
  return a.length === b.length && a.every((v) => b.includes(v))
}

/** Returns a query string (with "?" or empty). Defaults are left out. */
export function serialiseFilters(filters: AlertFilters): string {
  const params = new URLSearchParams()
  if (filters.siteId) params.set('site', filters.siteId)
  if (filters.severity?.length) params.set('severity', filters.severity.join(','))
  if (filters.status?.length && !sameList(filters.status, DEFAULT_STATUS)) {
    params.set('status', filters.status.join(','))
  }
  if (filters.confidence?.length) params.set('confidence', filters.confidence.join(','))
  return toQuery(params)
}

/** "?a=1&b=x,y" (commas kept readable), or "" when empty. */
export function toQuery(params: URLSearchParams): string {
  const query = params.toString().replaceAll('%2C', ',')
  return query ? `?${query}` : ''
}

export function hasActiveFilters(filters: AlertFilters): boolean {
  return serialiseFilters(filters) !== ''
}

export function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export const getSearch = () => window.location.search

/** Push a new query string and notify every URL-backed hook. */
export function navigate(query: string, state: unknown = null) {
  window.history.pushState(state, '', `${window.location.pathname}${query}${window.location.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
}

/** Filters stored in the URL. Each change adds a history entry, so Back undoes it. */
export function useUrlFilters() {
  const search = useSyncExternalStore(subscribe, getSearch)
  const filters = useMemo(() => parseFilters(search), [search])

  const setFilters = useCallback((next: AlertFilters) => {
    const query = serialiseFilters(next)
    if (query === window.location.search) return
    navigate(query)
  }, [])

  return [filters, setFilters] as const
}
