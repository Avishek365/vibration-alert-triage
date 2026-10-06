import { confidenceBand, confidenceLevel, explainConfidence } from './confidence'
import type { Alert, MeasurementPoint } from './types'

describe('confidenceBand', () => {
  it.each([
    [0, 'low'],
    [0.59, 'low'],
    [0.6, 'medium'],
    [0.79, 'medium'],
    [0.8, 'high'],
    [1, 'high'],
  ])('%s is %s', (value, band) => {
    expect(confidenceBand(value)).toBe(band)
  })
})

it('fills one, two or three meter segments', () => {
  expect([confidenceLevel('low'), confidenceLevel('medium'), confidenceLevel('high')]).toEqual([
    1, 2, 3,
  ])
})

describe('explainConfidence', () => {
  const now = new Date('2026-09-30T08:00:00Z')
  const point: MeasurementPoint = {
    id: 'p1',
    name: 'Motor DE bearing',
    sensorStatus: 'online',
    lastSeenAt: now.toISOString(),
    latestReading: 2,
    thresholds: { warning: 4.5, critical: 7.1 },
  }
  const band = (bandLabel: string, observed: number, baseline = 1) => ({
    bandLabel,
    lowHz: 10,
    highHz: 20,
    observed,
    baseline,
  })
  const alert: Alert = {
    id: 'al-1',
    assetId: 'a1',
    pointId: 'p1',
    severity: 'warning',
    faultType: 'bearing_wear',
    confidence: 0.9,
    evidence: [band('Outer race defect band, BPFO', 4.5), band('High-frequency envelope', 3.2)],
    reading: 5,
    thresholds: point.thresholds,
    triggeredAt: now.toISOString(),
    status: 'new',
  }

  it('explains a strong match as a tendency', () => {
    expect(explainConfidence(alert, point, now)).toEqual({
      heading: 'Why the model is confident',
      points: [
        'Strong match: the bands that typically accompany bearing wear are raised well above baseline.',
      ],
    })
  })

  it('lists what the model is unsure about, in plain words', () => {
    const unsure: Alert = {
      ...alert,
      confidence: 0.45,
      evidence: [band('Outer race defect band, BPFO', 2.4)],
      alternativeFault: { faultType: 'looseness', confidence: 0.33 },
    }
    const quiet = { ...point, sensorStatus: 'offline' as const, lastSeenAt: '2026-09-29T02:00:00Z' }
    expect(explainConfidence(unsure, quiet, now)).toEqual({
      heading: 'What the model is unsure about',
      points: [
        'Only one frequency band is raised. Bearing wear often shows in two, so the pattern is incomplete.',
        'The rise above baseline is modest (2.4×). Clear cases of bearing wear typically rise further.',
        'The pattern also fits looseness (0.33). Bearing wear and looseness often look similar in vibration data.',
        'This sensor stopped reporting 30 h ago, so newer changes are not reflected.',
      ],
    })
  })

  it('calls a medium-confidence match with no specific gaps "not conclusive"', () => {
    expect(explainConfidence({ ...alert, confidence: 0.7 }, point, now).points).toEqual([
      'The evidence is consistent with bearing wear but not conclusive. Faults like this are typically confirmed on inspection.',
    ])
  })
})
