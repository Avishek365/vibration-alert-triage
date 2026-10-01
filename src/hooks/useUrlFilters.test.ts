import { act, renderHook } from '@testing-library/react'
import type { AlertFilters } from '../domain/types'
import {
  DEFAULT_STATUS,
  hasActiveFilters,
  parseFilters,
  serialiseFilters,
  useUrlFilters,
} from './useUrlFilters'

describe('parseFilters', () => {
  it('defaults to open alerts', () => {
    expect(parseFilters('')).toEqual({ status: DEFAULT_STATUS })
  })

  it('reads every filter', () => {
    expect(parseFilters('?site=s2&severity=critical&status=new&confidence=low,medium')).toEqual({
      siteId: 's2',
      severity: ['critical'],
      status: ['new'],
      confidence: ['low', 'medium'],
    })
  })

  it('ignores unknown keys and values, and duplicates', () => {
    expect(parseFilters('?severity=bogus,warning,warning&confidence=extreme&foo=bar')).toEqual({
      status: DEFAULT_STATUS,
      severity: ['warning'],
    })
  })
})

describe('serialiseFilters', () => {
  it('leaves defaults out of the URL', () => {
    expect(serialiseFilters({ status: DEFAULT_STATUS })).toBe('')
    expect(hasActiveFilters({ status: ['acknowledged', 'new'] })).toBe(false)
  })

  it('round-trips', () => {
    const filters: AlertFilters = {
      siteId: 's1',
      severity: ['critical', 'warning'],
      status: ['dismissed'],
      confidence: ['high'],
    }
    const query = serialiseFilters(filters)
    expect(query).toBe('?site=s1&severity=critical,warning&status=dismissed&confidence=high')
    expect(parseFilters(query)).toEqual(filters)
  })
})

describe('useUrlFilters', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))

  it('writes filters to the URL and follows Back', async () => {
    const { result } = renderHook(() => useUrlFilters())
    expect(result.current[0]).toEqual({ status: DEFAULT_STATUS })

    act(() => result.current[1]({ status: DEFAULT_STATUS, severity: ['critical'] }))
    expect(window.location.search).toBe('?severity=critical')
    expect(result.current[0].severity).toEqual(['critical'])

    await act(async () => {
      const popped = new Promise((resolve) =>
        window.addEventListener('popstate', resolve, { once: true }),
      )
      window.history.back()
      await popped
    })
    expect(window.location.search).toBe('')
    expect(result.current[0].severity).toBeUndefined()
  })
})
