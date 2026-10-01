import {
  describeEvidence,
  formatAge,
  formatExact,
  formatRelative,
  summariseEvidence,
} from './format'
import type { Evidence } from './types'

const now = new Date('2026-09-30T08:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('formatAge and formatRelative', () => {
  it.each([
    [30_000, 'now', 'just now'],
    [12 * 60_000, '12 min', '12 min ago'],
    [5 * 3_600_000, '5 h', '5 h ago'],
    [47 * 3_600_000, '47 h', '47 h ago'],
    [72 * 3_600_000, '3 d', '3 d ago'],
  ])('%s ms → %s', (ms, age, relative) => {
    expect(formatAge(ago(ms), now)).toBe(age)
    expect(formatRelative(ago(ms), now)).toBe(relative)
  })
})

it('formats an exact time with its zone', () => {
  expect(formatExact('2026-09-30T06:30:00.000Z', 'UTC')).toBe('30 Sep 2026, 06:30 UTC')
})

const evidence: Evidence[] = [
  { bandLabel: '1× running speed', lowHz: 23.6, highHz: 26.1, observed: 2.46, baseline: 0.6 },
  { bandLabel: 'High-frequency envelope', lowHz: 1000, highHz: 4000, observed: 1.2, baseline: 0.5 },
]

it('summarises evidence on one line', () => {
  expect(summariseEvidence(evidence)).toBe(
    '1× running speed 4.1× baseline · High-frequency envelope 2.4×',
  )
})

it('describes every band in full', () => {
  expect(describeEvidence(evidence)).toEqual([
    '1× running speed (23.6 Hz–26.1 Hz): 2.46 mm/s vs baseline 0.60 mm/s, 4.1×',
    'High-frequency envelope (1 kHz–4 kHz): 1.20 mm/s vs baseline 0.50 mm/s, 2.4×',
  ])
})
