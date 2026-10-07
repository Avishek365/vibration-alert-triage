import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../api/mockApi'
import { formatDayTime } from '../domain/format'
import { createQueryWrapper } from '../test/queryWrapper'
import { HealthSummary } from './HealthSummary'

function renderSummary(siteId?: string) {
  const { wrapper } = createQueryWrapper()
  return {
    user: userEvent.setup(),
    ...render(<HealthSummary siteId={siteId} onOpenAlert={() => {}} />, { wrapper }),
  }
}

const countButton = (label: string) =>
  screen.findByRole('button', { name: new RegExp(`^${label} \\d+ machines$`) })

beforeEach(() => {
  api.reset()
  window.history.replaceState(null, '', '/')
})
afterEach(() => vi.restoreAllMocks())

it('opens the list of machines behind a count, matching the count', async () => {
  const { user } = renderSummary()
  const warning = await countButton('Warning')
  expect(warning).toHaveAttribute('aria-expanded', 'false')
  const count = Number(warning.textContent!.match(/\d+/)![0])

  await user.click(warning)
  expect(warning).toHaveAttribute('aria-expanded', 'true')
  const panel = screen.getByRole('region', { name: 'Warning machines' })
  const items = within(within(panel).getByRole('list')).getAllByRole('listitem')
  expect(items).toHaveLength(count)

  const expected = (await api.listAssets()).filter((a) => a.health === 'warning')
  expect(items.map((li) => li.textContent)).toEqual(
    expected.map((a) => expect.stringContaining(a.asset.name)),
  )
})

it('shows neutral labels for machines kept elevated after a dismissal', async () => {
  const { user } = renderSummary()
  await user.click(await countButton('Warning'))
  const panel = screen.getByRole('region', { name: 'Warning machines' })

  const pump = within(panel).getByText('White water pump').closest('li')!
  expect(within(pump).getByText('In maintenance')).toBeInTheDocument()
  expect(pump).toHaveTextContent('No open alerts')

  const intake = within(panel).getByText('Raw water intake pump 2').closest('li')!
  expect(within(intake).getByText('Dismissed, still elevated')).toBeInTheDocument()

  for (const label of panel.querySelectorAll('[data-note]')) {
    expect(label.className).not.toMatch(/health-|accent/)
  }
})

it('shows "Known condition" and "Sensor fault reported" after those dismissals', async () => {
  // a13 has one open warning alert; its reading stays above warning after dismissal.
  const [alert] = (await api.getAsset('a13')).alerts
  await api.dismissAlert(alert.id, { reason: 'known_condition' })
  const { user, unmount } = renderSummary()
  await user.click(await countButton('Warning'))
  const backwash = within(screen.getByRole('region', { name: 'Warning machines' }))
    .getByText('Backwash pump')
    .closest('li')!
  expect(within(backwash).getByText('Known condition')).toBeInTheDocument()
  unmount()

  api.reset()
  const [again] = (await api.getAsset('a13')).alerts
  await api.dismissAlert(again.id, { reason: 'sensor_fault' })
  const second = renderSummary()
  await second.user.click(await countButton('Unknown'))
  const unknown = screen.getByRole('region', { name: 'Unknown machines' })
  expect(
    within(within(unknown).getByText('Backwash pump').closest('li')!).getByText(
      'Sensor fault reported',
    ),
  ).toBeInTheDocument()
})

it('toggles with the same button, and Esc or Close return focus to it', async () => {
  const { user } = renderSummary()
  const critical = await countButton('Critical')

  await user.click(critical)
  await user.click(critical)
  expect(screen.queryByRole('region', { name: 'Critical machines' })).not.toBeInTheDocument()

  await user.click(critical)
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('region', { name: 'Critical machines' })).not.toBeInTheDocument()
  expect(critical).toHaveFocus()

  await user.keyboard('{Enter}')
  const panel = screen.getByRole('region', { name: 'Critical machines' })
  // Tab past the other count buttons into the list.
  while (!panel.contains(document.activeElement)) await user.tab()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: 'Critical machines' })).not.toBeInTheDocument()
  expect(critical).toHaveFocus()
})

it('follows the site filter', async () => {
  const { user } = renderSummary('s2')
  await user.click(await countButton('Healthy'))
  const panel = screen.getByRole('region', { name: 'Healthy machines' })
  for (const item of within(within(panel).getByRole('list')).getAllByRole('listitem')) {
    expect(item).toHaveTextContent('Kestrel Bay Water Treatment')
  }
})

describe('machine list rows', () => {
  async function openList(label: string) {
    const { user } = renderSummary()
    await user.click(await countButton(label))
    return screen.getByRole('region', { name: `${label} machines` })
  }
  const rowFor = (panel: HTMLElement, name: string) => within(panel).getByText(name).closest('li')!

  it("show each machine's reading against its own critical limit", async () => {
    const panel = await openList('Critical')
    for (const s of (await api.listAssets()).filter((a) => a.health === 'critical')) {
      const p = s.asset.points.find((pt) => pt.id === s.driver!.pointId)!
      expect(rowFor(panel, s.asset.name).querySelector('[data-reading]')).toHaveTextContent(
        `${p.latestReading.toFixed(2)} mm/s`,
      )
      expect(rowFor(panel, s.asset.name).querySelector('[data-reading]')).toHaveTextContent(
        `· critical limit ${p.thresholds.critical.toFixed(2)} · ${p.name}`,
      )
    }
  })

  it('show "Latest" and no sensor indicator when the sensor is online', async () => {
    const panel = await openList('Critical')
    const row = rowFor(panel, 'Press section drive motor')
    expect(row.querySelector('[data-reading]')).toHaveTextContent(
      /^Latest \d+\.\d{2} mm\/s · critical limit \d+\.\d{2} · /,
    )
    expect(row.querySelector('[data-sensor]')).toBeNull()
  })

  it('show "Offline" and "Last reading … at …" for an offline sensor', async () => {
    const panel = await openList('Critical')
    const motor = (await api.listAssets()).find((a) => a.asset.name === 'Raw mill motor')!
    const p = motor.asset.points.find((pt) => pt.id === motor.driver!.pointId)!
    const row = rowFor(panel, 'Raw mill motor')
    expect(row.querySelector('[data-sensor="offline"]')).toHaveTextContent('Offline')
    expect(row.querySelector('[data-reading]')).toHaveTextContent(
      `Last reading ${p.latestReading.toFixed(2)} mm/s at ${formatDayTime(p.lastSeenAt)} · critical limit 7.10`,
    )
  })

  it('show "Stale" with its age and "Last reading … at …" for a stale sensor', async () => {
    const panel = await openList('Critical')
    const pump = (await api.listAssets()).find((a) => a.asset.name === 'Stock pump 2')!
    const p = pump.asset.points.find((pt) => pt.id === pump.driver!.pointId)!
    const row = rowFor(panel, 'Stock pump 2')
    expect(row.querySelector('[data-sensor="stale"]')).toHaveTextContent(/^Sensor Stale \dh$/)
    expect(row.querySelector('[data-reading]')).toHaveTextContent(
      `Last reading ${p.latestReading.toFixed(2)} mm/s at ${formatDayTime(p.lastSeenAt)} · critical limit 7.10`,
    )
  })

  it('name the stale sensor when it is not the point the reading comes from', async () => {
    const panel = await openList('Critical')
    const blower = (await api.listAssets()).find((a) => a.asset.name === 'Aeration blower 1')!
    const reading = blower.asset.points.find((pt) => pt.id === blower.driver!.pointId)!
    const stale = blower.asset.points.find((pt) => pt.sensorStatus === 'stale')!
    // The case only means something if the two are different points.
    expect(stale.id).not.toBe(reading.id)
    expect(reading.sensorStatus).toBe('online')

    const row = rowFor(panel, 'Aeration blower 1')
    expect(row.querySelector('[data-reading]')).toHaveTextContent(
      `Latest ${reading.latestReading.toFixed(2)} mm/s · critical limit 11.20 · ${reading.name}`,
    )
    expect(row.querySelector('[data-sensor="stale"]')).toHaveTextContent(
      new RegExp(`^${stale.name} sensor stale \\d+h$`),
    )
  })

  it("do not repeat the point name when the stale sensor is the reading's own", async () => {
    const panel = await openList('Critical')
    const row = rowFor(panel, 'Stock pump 2')
    expect(row.querySelector('[data-sensor="stale"]')).toHaveTextContent(/^Sensor Stale \d+h$/)
    expect(row.querySelector('[data-reading]')).toHaveTextContent(/^Last reading .* at /)
  })

  it('show a reason when Critical comes from an open alert while the reading is below the limit', async () => {
    const [real] = (await api.listAssets()).filter((a) => a.health === 'critical')
    const point = {
      ...real.asset.points[0],
      latestReading: 10.19,
      thresholds: { warning: 7.1, critical: 11.2 },
    }
    const crafted = {
      ...real,
      asset: { ...real.asset, points: [point, ...real.asset.points.slice(1)] },
      driver: { pointId: point.id, cause: 'alert' as const },
    }
    vi.spyOn(api, 'listAssets').mockResolvedValue([crafted])
    const panel = await openList('Critical')
    const row = rowFor(panel, real.asset.name)
    expect(row.querySelector('[data-reading]')).toHaveTextContent(
      /^Latest 10\.19 mm\/s · critical limit 11\.20 · /,
    )
    expect(row).toHaveTextContent('Open critical alert; latest reading below limit')
  })

  it('show no reason when the reading itself sets the level', async () => {
    const panel = await openList('Critical')
    expect(panel).not.toHaveTextContent('latest reading below limit')
  })
})
