// Pure alert helpers shared by the mock API and the optimistic updates in the query hooks.

import { confidenceBand } from './confidence'
import { severityRank } from './health'
import type { Alert, AlertFilters, DismissInput, DismissedAlert } from './types'

/** How actions by the person using the app are attributed. */
export const CURRENT_USER = 'You'

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

export function acknowledge(alert: Alert, at: Date, by: string = CURRENT_USER): Alert {
  if (!canAcknowledge(alert)) return alert
  return { ...alert, status: 'acknowledged', acknowledgedAt: at.toISOString(), acknowledgedBy: by }
}

export function dismiss(
  alert: Alert,
  input: DismissInput,
  at: Date,
  by: string = CURRENT_USER,
): Alert {
  if (!canDismiss(alert)) return alert
  const note = input.note?.trim()
  const dismissed: DismissedAlert = {
    ...alert,
    status: 'dismissed',
    dismissedAt: at.toISOString(),
    dismissedBy: by,
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
  if (filters.confidence?.length && !filters.confidence.includes(confidenceBand(alert.confidence)))
    return false
  if (filters.siteId && siteIdOf(alert.assetId) !== filters.siteId) return false
  return true
}

/**
 * Queue order: most severe first, then highest confidence, then newest.
 * See the README for the trade-off this makes.
 */
export function compareAlerts(a: Alert, b: Alert): number {
  const bySeverity = severityRank(b.severity) - severityRank(a.severity)
  if (bySeverity !== 0) return bySeverity
  const byConfidence = b.confidence - a.confidence
  if (byConfidence !== 0) return byConfidence
  return b.triggeredAt.localeCompare(a.triggeredAt)
}

const newest = (list: readonly Alert[]) =>
  [...list].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]

/**
 * The alert a machine should link to: its most recent open alert, otherwise its
 * most recent dismissed one (which opens with any correction banner).
 * Undefined when the machine has no alerts.
 */
export function relevantAlert(alerts: readonly Alert[]): Alert | undefined {
  return newest(alerts.filter((a) => a.status !== 'dismissed')) ?? newest(alerts)
}
