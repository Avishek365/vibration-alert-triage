// Pure alert helpers shared by the mock API and the optimistic updates in the query hooks.

import { severityRank } from './health'
import type { Alert, AlertFilters, DismissInput, DismissedAlert } from './types'

export function canAcknowledge(alert: Alert): boolean {
  return alert.status === 'new'
}

export function canDismiss(alert: Alert): boolean {
  return alert.status !== 'dismissed'
}

/** Returns an error message, or null when the input is valid. */
export function validateDismissInput(input: DismissInput): string | null {
  if (input.reason === 'other' && !input.note?.trim()) {
    return 'A note is required when the reason is "other".'
  }
  return null
}

export function acknowledge(alert: Alert, at: Date): Alert {
  if (!canAcknowledge(alert)) return alert
  return { ...alert, status: 'acknowledged', acknowledgedAt: at.toISOString() }
}

export function dismiss(alert: Alert, input: DismissInput, at: Date): Alert {
  if (!canDismiss(alert)) return alert
  const note = input.note?.trim()
  const dismissed: DismissedAlert = {
    ...alert,
    status: 'dismissed',
    dismissedAt: at.toISOString(),
    dismissReason: input.reason,
    ...(note ? { dismissNote: note } : {}),
  }
  return dismissed
}

/** Site filtering needs the asset lookup, so it is passed in. */
export function matchesAlertFilters(
  alert: Alert,
  filters: AlertFilters,
  siteIdOf: (assetId: string) => string | undefined,
): boolean {
  if (filters.status?.length && !filters.status.includes(alert.status)) return false
  if (filters.severity?.length && !filters.severity.includes(alert.severity)) return false
  if (filters.minConfidence !== undefined && alert.confidence < filters.minConfidence) return false
  if (filters.siteId && siteIdOf(alert.assetId) !== filters.siteId) return false
  return true
}

/** Most severe first, then newest first. */
export function compareAlerts(a: Alert, b: Alert): number {
  const bySeverity = severityRank(b.severity) - severityRank(a.severity)
  if (bySeverity !== 0) return bySeverity
  return b.triggeredAt.localeCompare(a.triggeredAt)
}
