import { acknowledge, dismiss } from './alerts'
import { SYSTEM_ACTOR, triageHistory } from './history'
import type { Alert } from './types'

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

it('starts with the alert being raised by the monitoring system', () => {
  expect(triageHistory(base)).toEqual([
    { kind: 'triggered', at: base.triggeredAt, by: SYSTEM_ACTOR, title: 'Alert raised' },
  ])
})

it('records who acknowledged and dismissed, with reason and note, oldest first', () => {
  const acked = acknowledge(base, new Date('2026-09-30T07:00:00Z'), 'Tess Marrowby')
  const dismissed = dismiss(
    acked,
    { reason: 'other', note: 'Duplicate' },
    new Date('2026-09-30T08:00:00Z'),
  )
  expect(triageHistory(dismissed)).toEqual([
    expect.objectContaining({ kind: 'triggered' }),
    expect.objectContaining({ kind: 'acknowledged', by: 'Tess Marrowby', title: 'Acknowledged' }),
    expect.objectContaining({
      kind: 'dismissed',
      by: 'You',
      title: 'Dismissed: Other',
      detail: 'Duplicate',
    }),
  ])
})
