import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../api/mockApi'
import { createQueryWrapper } from '../test/queryWrapper'
import { HealthSummary } from './HealthSummary'

function renderSummary(siteId?: string) {
  const { wrapper } = createQueryWrapper()
  return { user: userEvent.setup(), ...render(<HealthSummary siteId={siteId} />, { wrapper }) }
}

const countButton = (label: string) =>
  screen.findByRole('button', { name: new RegExp(`^${label} \\d+ machines$`) })

beforeEach(() => api.reset())

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
