import {
  acknowledge,
  compareAlerts,
  dismiss,
  matchesAlertFilters,
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

it('sorts by severity, then newest first', () => {
  const older: Alert = { ...base, id: 'old', triggeredAt: '2026-09-29T00:00:00.000Z' }
  const critical: Alert = {
    ...base,
    id: 'crit',
    severity: 'critical',
    triggeredAt: '2026-09-28T00:00:00.000Z',
  }
  const sorted = [older, base, critical].sort(compareAlerts).map((a) => a.id)
  expect(sorted).toEqual(['crit', 'al-1', 'old'])
})
