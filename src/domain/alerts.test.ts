import {
  acknowledge,
  compareAlerts,
  dismiss,
  matchesAlertFilters,
  relevantAlert,
  validateDismissInput,
} from './alerts'
import type { Alert } from './types'

const at = new Date('2026-09-30T08:00:00Z')

const base: Alert = {
  id: 'al-1',
  assetId: 'a1',
  pointId: 'a1-p1',
  severity: 'warning',
  faultType: 'imbalance',
  confidence: 0.5,
  evidence: [],
  reading: 5,
  thresholds: { warning: 4.5, critical: 7.1 },
  triggeredAt: '2026-09-30T06:00:00.000Z',
  status: 'new',
}

describe('validateDismissInput', () => {
  it('requires a note for "other"', () => {
    expect(validateDismissInput({ reason: 'other' })).not.toBeNull()
    expect(validateDismissInput({ reason: 'other', note: '   ' })).not.toBeNull()
    expect(validateDismissInput({ reason: 'other', note: 'Duplicate' })).toBeNull()
  })

  it('does not require a note for fixed reasons', () => {
    expect(validateDismissInput({ reason: 'model_wrong' })).toBeNull()
  })
})

describe('acknowledge', () => {
  it('moves a new alert to acknowledged', () => {
    expect(acknowledge(base, at)).toMatchObject({
      status: 'acknowledged',
      acknowledgedAt: at.toISOString(),
    })
  })

  it('leaves a dismissed alert unchanged', () => {
    const dismissed = dismiss(base, { reason: 'sensor_fault' }, at)
    expect(acknowledge(dismissed, at)).toBe(dismissed)
  })
})

describe('dismiss', () => {
  it('records the reason and trimmed note, keeping any acknowledgement', () => {
    const acked = acknowledge(base, at)
    expect(dismiss(acked, { reason: 'other', note: '  Duplicate  ' }, at)).toMatchObject({
      status: 'dismissed',
      dismissReason: 'other',
      dismissNote: 'Duplicate',
      acknowledgedAt: at.toISOString(),
    })
  })

  it('omits an empty note', () => {
    expect(dismiss(base, { reason: 'model_wrong', note: ' ' }, at)).not.toHaveProperty(
      'dismissNote',
    )
  })
})

describe('matchesAlertFilters', () => {
  const siteOf = () => 's1'

  it('matches everything with no filters', () => {
    expect(matchesAlertFilters(base, {}, siteOf)).toBe(true)
  })

  it('applies status, severity, confidence and site', () => {
    expect(matchesAlertFilters(base, { status: ['acknowledged'] }, siteOf)).toBe(false)
    expect(matchesAlertFilters(base, { severity: ['critical'] }, siteOf)).toBe(false)
    expect(matchesAlertFilters(base, { minConfidence: 0.6 }, siteOf)).toBe(false)
    expect(matchesAlertFilters(base, { siteId: 's2' }, siteOf)).toBe(false)
    expect(
      matchesAlertFilters(
        base,
        { status: ['new'], severity: ['warning'], minConfidence: 0.5, siteId: 's1' },
        siteOf,
      ),
    ).toBe(true)
  })
})

describe('compareAlerts', () => {
  it('sorts by severity, then confidence, then newest', () => {
    const at = (d: string) => `2026-09-${d}T00:00:00.000Z`
    const alerts: Alert[] = [
      { ...base, id: 'warn-low-new', confidence: 0.45, triggeredAt: at('30') },
      { ...base, id: 'warn-high-old', confidence: 0.9, triggeredAt: at('20') },
      { ...base, id: 'crit-low', severity: 'critical', confidence: 0.41, triggeredAt: at('10') },
      { ...base, id: 'warn-high-new', confidence: 0.9, triggeredAt: at('25') },
    ]
    expect(alerts.sort(compareAlerts).map((a) => a.id)).toEqual([
      'crit-low', // severity wins even at low confidence
      'warn-high-new', // same confidence: newer first
      'warn-high-old',
      'warn-low-new', // newest, but least confident
    ])
  })
})

describe('confidence band filter', () => {
  const siteOf = () => 's1'

  it('matches alerts whose confidence falls in a selected band', () => {
    const medium: Alert = { ...base, confidence: 0.6 }
    expect(matchesAlertFilters(medium, { confidence: ['medium'] }, siteOf)).toBe(true)
    expect(matchesAlertFilters(medium, { confidence: ['low', 'high'] }, siteOf)).toBe(false)
    expect(matchesAlertFilters(medium, { confidence: [] }, siteOf)).toBe(true)
  })
})

describe('relevantAlert', () => {
  const at = (h: number) =>
    new Date(Date.parse('2026-09-30T08:00:00Z') - h * 3_600_000).toISOString()
  const make = (
    id: string,
    hoursAgo: number,
    status: 'new' | 'acknowledged' | 'dismissed',
  ): Alert => {
    const a: Alert = { ...base, id, triggeredAt: at(hoursAgo), status: 'new' }
    if (status === 'acknowledged')
      return { ...a, status, acknowledgedAt: at(0), acknowledgedBy: 'You' }
    if (status === 'dismissed')
      return { ...a, status, dismissedAt: at(0), dismissedBy: 'You', dismissReason: 'model_wrong' }
    return a
  }

  it('prefers the most recent open alert, even over a newer dismissed one', () => {
    const alerts = [
      make('old-open', 10, 'new'),
      make('new-open', 5, 'acknowledged'),
      make('newest-dismissed', 1, 'dismissed'),
    ]
    expect(relevantAlert(alerts)?.id).toBe('new-open')
  })

  it('falls back to the most recent dismissed alert', () => {
    expect(relevantAlert([make('older', 10, 'dismissed'), make('newer', 2, 'dismissed')])?.id).toBe(
      'newer',
    )
  })

  it('is undefined with no alerts', () => {
    expect(relevantAlert([])).toBeUndefined()
  })
})
