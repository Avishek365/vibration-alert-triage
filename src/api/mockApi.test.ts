import { compareAlerts } from '../domain/alerts'
import { ApiError, createMockApi } from './mockApi'

const now = new Date('2026-09-30T08:00:00Z')

function setup() {
  return createMockApi({ delayMs: 0, now: () => now })
}

describe('listAlerts', () => {
  it('returns every alert sorted by severity, then newest', async () => {
    const api = setup()
    const alerts = await api.listAlerts()
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts).toEqual([...alerts].sort(compareAlerts))
  })

  it('filters by status, severity, site and confidence', async () => {
    const api = setup()
    const alerts = await api.listAlerts({
      status: ['new'],
      severity: ['critical'],
      siteId: 's1',
      minConfidence: 0.9,
    })
    expect(alerts.length).toBeGreaterThan(0)
    for (const a of alerts) {
      expect(a).toMatchObject({ status: 'new', severity: 'critical' })
      expect(a.confidence).toBeGreaterThanOrEqual(0.9)
      expect(a.assetId <= 'a08').toBe(true) // s1 assets are a01–a08
    }
  })

  it('returns copies that cannot mutate the store', async () => {
    const api = setup()
    const [first] = await api.listAlerts()
    first.confidence = -1
    const [again] = await api.listAlerts()
    expect(again.confidence).not.toBe(-1)
  })
})

describe('assets', () => {
  it('lists assets worst health first with open alert counts', async () => {
    const api = setup()
    const assets = await api.listAssets()
    expect(assets).toHaveLength(24)
    expect(assets[0].health).toBe('critical')
    expect(assets.at(-1)!.health).toBe('healthy')
  })

  it('filters by site', async () => {
    const api = setup()
    const assets = await api.listAssets({ siteId: 's2' })
    expect(assets.every((a) => a.asset.siteId === 's2')).toBe(true)
  })

  it('returns asset detail with site and alerts', async () => {
    const api = setup()
    const detail = await api.getAsset('a01')
    expect(detail.site.id).toBe('s1')
    expect(detail.alerts.every((a) => a.assetId === 'a01')).toBe(true)
    expect(detail.health).toBe('critical')
  })

  it('rejects an unknown asset with 404', async () => {
    await expect(setup().getAsset('nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('getAlert and trend', () => {
  it('returns the alert with its asset, site and point', async () => {
    const api = setup()
    const { alert, asset, site, point } = await api.getAlert('al-001')
    expect(asset.id).toBe(alert.assetId)
    expect(site.id).toBe(asset.siteId)
    expect(point.id).toBe(alert.pointId)
  })

  it('returns a trend window that includes the alert reading', async () => {
    const api = setup()
    const { alert, point } = await api.getAlert('al-001')
    const trend = await api.getAlertTrend('al-001')
    expect(trend.points.find((p) => p.at === alert.triggeredAt)?.value).toBe(alert.reading)
    expect(trend.windowEnd).toBe(now.toISOString())
    expect(trend.sensorStatus).toBe(point.sensorStatus)
  })
})

describe('acknowledgeAlert', () => {
  it('acknowledges a new alert and persists the change', async () => {
    const api = setup()
    const updated = await api.acknowledgeAlert('al-001')
    expect(updated).toMatchObject({ status: 'acknowledged', acknowledgedAt: now.toISOString() })
    expect((await api.getAlert('al-001')).alert.status).toBe('acknowledged')
  })

  it('rejects an already acknowledged alert with 409', async () => {
    const api = setup()
    await api.acknowledgeAlert('al-001')
    await expect(api.acknowledgeAlert('al-001')).rejects.toMatchObject({ status: 409 })
  })
})

describe('dismissAlert', () => {
  it('dismisses with a fixed reason and updates asset health', async () => {
    const api = setup()
    // a13 has a single open warning alert.
    const [alert] = (await api.getAsset('a13')).alerts
    await api.dismissAlert(alert.id, { reason: 'maintenance_in_progress' })
    const asset = await api.getAsset('a13')
    expect(asset.alerts[0]).toMatchObject({
      status: 'dismissed',
      dismissReason: 'maintenance_in_progress',
    })
    expect(asset.health).toBe('healthy')
    expect(asset.openAlertCount).toBe(0)
  })

  it('requires a note when the reason is "other"', async () => {
    const api = setup()
    await expect(api.dismissAlert('al-001', { reason: 'other' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      api.dismissAlert('al-001', { reason: 'other', note: 'Duplicate' }),
    ).resolves.toMatchObject({ dismissNote: 'Duplicate' })
  })

  it('rejects an already dismissed alert with 409', async () => {
    const api = setup()
    await api.dismissAlert('al-001', { reason: 'model_wrong' })
    await expect(api.dismissAlert('al-001', { reason: 'model_wrong' })).rejects.toMatchObject({
      status: 409,
    })
  })
})

describe('failures and reset', () => {
  it('rejects selected operations with a 503 ApiError', async () => {
    const api = setup()
    api.setFailures(['listAlerts'])
    const error = await api.listAlerts().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 503 })
    await expect(api.listSites()).resolves.toHaveLength(3)
  })

  it('reset restores fixtures and clears failures', async () => {
    const api = setup()
    await api.acknowledgeAlert('al-001')
    api.setFailures(['getAlert'])
    api.reset()
    expect((await api.getAlert('al-001')).alert.status).toBe('new')
  })
})
