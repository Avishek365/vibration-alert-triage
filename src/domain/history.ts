import { DISMISS_REASON_LABELS } from './format'
import type { Alert } from './types'

export interface HistoryEntry {
  kind: 'triggered' | 'acknowledged' | 'dismissed'
  at: string
  /** Who did it. Alerts are raised by the monitoring system. */
  by: string
  title: string
  detail?: string
}

export const SYSTEM_ACTOR = 'Monitoring system'

/** Triage events for an alert, oldest first. */
export function triageHistory(alert: Alert): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    { kind: 'triggered', at: alert.triggeredAt, by: SYSTEM_ACTOR, title: 'Alert raised' },
  ]
  if (alert.status !== 'new' && alert.acknowledgedAt && alert.acknowledgedBy) {
    entries.push({
      kind: 'acknowledged',
      at: alert.acknowledgedAt,
      by: alert.acknowledgedBy,
      title: 'Acknowledged',
    })
  }
  if (alert.status === 'dismissed') {
    entries.push({
      kind: 'dismissed',
      at: alert.dismissedAt,
      by: alert.dismissedBy,
      title: `Dismissed: ${DISMISS_REASON_LABELS[alert.dismissReason]}`,
      ...(alert.dismissNote ? { detail: alert.dismissNote } : {}),
    })
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at))
}
