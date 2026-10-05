import { describeReading, describeTrend, thresholdPosition, trendWindow } from './trend'
import type { Alert, AlertTrend } from './types'

const HOUR = 3_600_000
const now = new Date('2026-09-30T08:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const thresholds = { warning: 4.5, critical: 7.1 }

describe('trendWindow', () => {
  it('shows the 48 hours up to now for recent alerts', () => {
    const { start, end } = trendWindow(iso(now.getTime() - 10 * HOUR), now)
    expect(end).toEqual(now)
    expect(end.getTime() - start.getTime()).toBe(48 * HOUR)
  })

  it('keeps older alerts in view: 36 h before to 12 h after', () => {
    const trigger = now.getTime() - 70 * HOUR
    const { start, end } = trendWindow(iso(trigger), now)
    expect(start.getTime()).toBe(trigger - 36 * HOUR)
    expect(end.getTime()).toBe(trigger + 12 * HOUR)
  })
})

describe('readings against limits', () => {
  it.each([
    [4.49, 'below_warning', '4.49 mm/s, below the warning limit'],
    [4.5, 'above_warning', '4.50 mm/s, above the warning limit, below critical'],
    [7.1, 'above_critical', '7.10 mm/s, above the critical limit'],
  ])('%s', (value, position, text) => {
    expect(thresholdPosition(value, thresholds)).toBe(position)
    expect(describeReading(value, thresholds)).toBe(text)
  })
})

describe('describeTrend', () => {
  const trigger = now.getTime() - 4 * HOUR
  const alert = {
    id: 'al-x',
    thresholds,
    triggeredAt: iso(trigger),
    severity: 'critical',
  } as Alert
  const values = [2, 2.1, 1.9, 2, 3, 4.6, 6, 8.4, 8.2]
  const trend: AlertTrend = {
    points: values.map((value, i) => ({ at: iso(trigger + (i - 7) * HOUR), value })),
    windowStart: iso(now.getTime() - 48 * HOUR),
    windowEnd: now.toISOString(),
    lastReadingAt: iso(trigger + HOUR),
    sensorStatus: 'online',
  }

  it('describes the level, first crossing, peak, alert time and last reading', () => {
    expect(describeTrend(trend, alert, 'UTC')).toBe(
      'Vibration stayed near 2.05 mm/s, then first went above the warning limit of 4.50 mm/s at 30 Sep, 02:00. ' +
        'It peaked at 8.40 mm/s at 30 Sep, 04:00, above the critical limit of 7.10 mm/s. ' +
        'The alert was raised at 30 Sep, 04:00. ' +
        'The last reading, 8.20 mm/s at 30 Sep, 05:00, was above the critical limit.',
    )
  })

  it('says when the window starts above the warning limit', () => {
    const high = { ...trend, points: trend.points.map((p) => ({ ...p, value: 5 })) }
    expect(describeTrend(high, alert, 'UTC')).toMatch(
      /^At the start of the window, vibration was already above the warning limit/,
    )
  })

  it('handles an empty trend', () => {
    expect(describeTrend({ ...trend, points: [] }, alert)).toBe('No readings in this period.')
  })
})
