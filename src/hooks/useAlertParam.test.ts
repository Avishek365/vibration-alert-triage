import { act, renderHook } from '@testing-library/react'
import { parseAlertParam, useAlertParam } from './useAlertParam'

function waitForPopState() {
  return new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
}

describe('parseAlertParam', () => {
  it('reads a valid id and ignores anything else', () => {
    expect(parseAlertParam('?alert=al-007&severity=critical')).toBe('al-007')
    expect(parseAlertParam('?severity=critical')).toBeNull()
    expect(parseAlertParam('?alert=%3Cscript%3E')).toBeNull()
  })
})

describe('useAlertParam', () => {
  it('opens next to the filters, and closing goes back to the queue entry', async () => {
    window.history.replaceState(null, '', '/?severity=critical')
    const { result } = renderHook(() => useAlertParam())
    expect(result.current.alertId).toBeNull()

    act(() => result.current.open('al-007'))
    expect(window.location.search).toBe('?severity=critical&alert=al-007')
    expect(result.current.alertId).toBe('al-007')

    await act(async () => {
      const popped = waitForPopState()
      result.current.close()
      await popped
    })
    expect(window.location.search).toBe('?severity=critical')
    expect(result.current.alertId).toBeNull()
  })

  it('closing a shared link removes the alert but keeps the filters', () => {
    window.history.replaceState(null, '', '/?site=s2&alert=al-003')
    const { result } = renderHook(() => useAlertParam())
    expect(result.current.alertId).toBe('al-003')
    act(() => result.current.close())
    expect(window.location.search).toBe('?site=s2')
    expect(result.current.alertId).toBeNull()
  })
})
