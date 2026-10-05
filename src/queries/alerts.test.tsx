import { act, renderHook, waitFor } from '@testing-library/react'
import { ApiError, api } from '../api/mockApi'
import type { Alert } from '../domain/types'
import { createQueryWrapper } from '../test/queryWrapper'
import { useAsset, useAssets, useSites } from './assets'
import { useAcknowledgeAlert, useAlert, useAlerts, useAlertTrend, useDismissAlert } from './alerts'

beforeEach(() => api.reset())

describe('read hooks', () => {
  it('useAlerts goes from loading to data', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAlerts({ status: ['new'] }), { wrapper })
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.every((a) => a.status === 'new')).toBe(true)
  })

  it('useAlerts surfaces API errors', async () => {
    api.setFailures(['listAlerts'])
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAlerts(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 503 })
  })

  it('useAlert, useAlertTrend, useSites, useAssets and useAsset load', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => ({
        alert: useAlert('al-001'),
        trend: useAlertTrend('al-001'),
        sites: useSites(),
        assets: useAssets({ siteId: 's1' }),
        asset: useAsset('a01'),
      }),
      { wrapper },
    )
    await waitFor(() => expect(Object.values(result.current).every((q) => q.isSuccess)).toBe(true))
    expect(result.current.alert.data!.alert.id).toBe('al-001')
    expect(result.current.trend.data!.points.length).toBeGreaterThan(0)
    expect(result.current.sites.data).toHaveLength(3)
    expect(result.current.assets.data!.every((a) => a.asset.siteId === 's1')).toBe(true)
    expect(result.current.asset.data!.asset.id).toBe('a01')
  })
})

/** A promise the test resolves or rejects by hand, to observe in-flight state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => vi.restoreAllMocks())

describe('useAcknowledgeAlert', () => {
  it('updates the cache before the server responds, then refetches', async () => {
    const request = deferred<Alert>()
    const realAcknowledge = api.acknowledgeAlert
    vi.spyOn(api, 'acknowledgeAlert').mockImplementation(() => request.promise)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => ({ detail: useAlert('al-001'), ack: useAcknowledgeAlert() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true))

    act(() => result.current.ack.mutate('al-001'))
    await waitFor(() => expect(result.current.detail.data!.alert.status).toBe('acknowledged'))
    expect(result.current.ack.isPending).toBe(true)

    await act(async () => request.resolve(await realAcknowledge('al-001')))
    await waitFor(() => expect(result.current.ack.isSuccess).toBe(true))
    expect(result.current.detail.data!.alert.status).toBe('acknowledged')
  })

  it('rolls back when the request fails', async () => {
    const request = deferred<Alert>()
    vi.spyOn(api, 'acknowledgeAlert').mockImplementation(() => request.promise)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => ({ detail: useAlert('al-001'), ack: useAcknowledgeAlert() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true))

    act(() => result.current.ack.mutate('al-001'))
    await waitFor(() => expect(result.current.detail.data!.alert.status).toBe('acknowledged'))

    act(() => request.reject(new ApiError(503, 'Simulated failure')))
    await waitFor(() => expect(result.current.ack.isError).toBe(true))
    await waitFor(() => expect(result.current.detail.data!.alert.status).toBe('new'))
  })
})

describe('useDismissAlert', () => {
  it('removes the alert from a "new only" list before the server responds', async () => {
    const request = deferred<Alert>()
    vi.spyOn(api, 'dismissAlert').mockImplementation(() => request.promise)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => ({
        newOnly: useAlerts({ status: ['new'] }),
        all: useAlerts(),
        dismiss: useDismissAlert(),
      }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.newOnly.isSuccess && result.current.all.isSuccess).toBe(true),
    )
    const before = result.current.newOnly.data!.length

    act(() => result.current.dismiss.mutate({ id: 'al-001', input: { reason: 'model_wrong' } }))

    await waitFor(() => expect(result.current.newOnly.data!.length).toBe(before - 1))
    expect(result.current.newOnly.data!.some((a) => a.id === 'al-001')).toBe(false)
    // The unfiltered list keeps the alert, now marked dismissed.
    expect(result.current.all.data!.find((a) => a.id === 'al-001')).toMatchObject({
      status: 'dismissed',
      dismissReason: 'model_wrong',
    })
    expect(result.current.dismiss.isPending).toBe(true)
  })

  it('surfaces validation errors and restores the list', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => ({ list: useAlerts({ status: ['new'] }), dismiss: useDismissAlert() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => result.current.dismiss.mutate({ id: 'al-001', input: { reason: 'other' } }))
    await waitFor(() => expect(result.current.dismiss.error).toMatchObject({ status: 400 }))
    await waitFor(() => expect(result.current.list.data!.some((a) => a.id === 'al-001')).toBe(true))
  })
})
