import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../api/mockApi'
import { severityRank } from '../domain/health'
import { formatExact, summariseEvidence } from '../domain/format'
import type { Alert } from '../domain/types'
import { createQueryWrapper } from '../test/queryWrapper'
import { AlertQueue } from './AlertQueue'

function renderQueue(url = '/') {
  window.history.replaceState(null, '', url)
  const { wrapper } = createQueryWrapper()
  return { user: userEvent.setup(), ...render(<AlertQueue onOpen={() => {}} />, { wrapper }) }
}

/** Top-level queue rows (evidence bullet points are nested list items too). */
function rows(): HTMLLIElement[] {
  const list = screen.getByRole('list', { name: 'Alerts' })
  return [...list.querySelectorAll<HTMLLIElement>(':scope > li')]
}

const rowIds = () => rows().map((r) => r.dataset.alertId!)
const selectedRow = () => rows().find((r) => r.getAttribute('aria-current') === 'true')

async function loaded() {
  await screen.findByRole('list', { name: 'Alerts' })
}

async function alertById(id: string): Promise<Alert> {
  return (await api.getAlert(id)).alert
}

beforeEach(() => api.reset())
afterEach(() => vi.restoreAllMocks())

describe('states', () => {
  it('shows a loading state, then open alerts', async () => {
    renderQueue()
    expect(screen.getByRole('status', { name: 'Loading alerts' })).toBeInTheDocument()
    await loaded()
    const open = await api.listAlerts({ status: ['new', 'acknowledged'] })
    expect(rows()).toHaveLength(open.length)
    expect(screen.getByText(`${open.length} alerts`)).toBeInTheDocument()
  })

  it('sorts by severity, then confidence, then newest', async () => {
    renderQueue()
    await loaded()
    const alerts = await Promise.all(rowIds().map(alertById))
    for (let i = 1; i < alerts.length; i++) {
      const [a, b] = [alerts[i - 1], alerts[i]]
      const key = (x: Alert) => [severityRank(x.severity), x.confidence, Date.parse(x.triggeredAt)]
      const [ka, kb] = [key(a), key(b)]
      const firstDiff = ka.findIndex((v, k) => v !== kb[k])
      if (firstDiff !== -1) expect(ka[firstDiff]).toBeGreaterThan(kb[firstDiff])
    }
  })

  it('shows a filtered empty state that can clear filters', async () => {
    const { user } = renderQueue('/?severity=critical&confidence=low')
    expect(await screen.findByText('No alerts match these filters')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    await loaded()
    expect(window.location.search).toBe('')
  })

  it('shows "all caught up" when there are no open alerts and no filters', async () => {
    vi.spyOn(api, 'listAlerts').mockResolvedValue([])
    renderQueue()
    expect(await screen.findByText('No open alerts')).toBeInTheDocument()
    expect(screen.getByText('All caught up.')).toBeInTheDocument()
  })

  it('shows a neutral error with Retry', async () => {
    api.setFailures(['listAlerts'])
    const { user } = renderQueue()
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Alerts could not be loaded')
    expect(error.outerHTML).not.toMatch(/health-/)

    api.setFailures([])
    await user.click(within(error).getByRole('button', { name: 'Retry' }))
    await loaded()
  })
})

describe('filters in the URL', () => {
  it('writes filter changes to the URL', async () => {
    const { user } = renderQueue()
    await loaded()
    const severity = screen.getByRole('group', { name: 'Severity' })
    await user.click(within(severity).getByRole('button', { name: 'Critical' }))

    expect(window.location.search).toBe('?severity=critical')
    await waitFor(async () => {
      const alerts = await Promise.all(rowIds().map(alertById))
      expect(alerts.length).toBeGreaterThan(0)
      expect(alerts.every((a) => a.severity === 'critical')).toBe(true)
    })
  })

  it('reads initial filters from the URL', async () => {
    renderQueue('/?site=s3&status=new')
    await loaded()
    expect(screen.getByRole('combobox', { name: 'Site' })).toHaveValue('s3')
    const expected = await api.listAlerts({ siteId: 's3', status: ['new'] })
    expect(rowIds()).toEqual(expected.map((a) => a.id))
  })
})

describe('keyboard triage', () => {
  it('moves with j/k only while the queue has focus', async () => {
    const { user } = renderQueue()
    await loaded()
    const [first, second] = rowIds()
    expect(selectedRow()?.dataset.alertId).toBe(first)

    // Focus outside the queue: shortcuts do nothing.
    screen.getByRole('group', { name: 'Severity' }).querySelector('button')!.focus()
    await user.keyboard('ja')
    expect(selectedRow()?.dataset.alertId).toBe(first)
    expect((await alertById(first)).status).toBe('new')

    act(() => rows()[0].focus())
    await user.keyboard('j')
    expect(selectedRow()?.dataset.alertId).toBe(second)
    expect(document.activeElement).toBe(selectedRow())
    await user.keyboard('k')
    expect(selectedRow()?.dataset.alertId).toBe(first)
  })

  it('a acknowledges the selected alert', async () => {
    const { user } = renderQueue()
    await loaded()
    const [first] = rowIds()
    act(() => rows()[0].focus())
    await user.keyboard('a')
    await waitFor(() => expect(within(rows()[0]).getByText('Acknowledged')).toBeInTheDocument())
    expect((await alertById(first)).status).toBe('acknowledged')
  })

  it('d opens the dismiss dialog; a number picks a reason and Enter dismisses', async () => {
    const { user } = renderQueue()
    await loaded()
    const [first, second] = rowIds()
    act(() => rows()[0].focus())

    await user.keyboard('d')
    const dialog = screen.getByRole('dialog', { name: 'Dismiss alert' })
    await user.keyboard('2')
    expect(within(dialog).getByRole('radio', { name: /Known condition/ })).toBeChecked()
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(rowIds()).not.toContain(first))
    // Focus moves to the alert that took its place, so triage can continue.
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]))
    expect(rows()[0].dataset.alertId).toBe(second)
    expect(await alertById(first)).toMatchObject({
      status: 'dismissed',
      dismissReason: 'known_condition',
    })
  })

  it('requires a note for "Other", and typing in it does not trigger shortcuts', async () => {
    const { user } = renderQueue()
    await loaded()
    const [first] = rowIds()
    act(() => rows()[0].focus())

    await user.keyboard('d')
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Dismiss' })
    expect(within(dialog).getByRole('textbox', { name: 'Note (optional)' })).toBeInTheDocument()
    expect(confirm).toBeEnabled()

    await user.keyboard('5')
    const note = within(dialog).getByRole('textbox', { name: 'Note (required)' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAccessibleDescription('Add a note to dismiss with "Other".')

    // Enter is blocked too, with a message.
    await user.keyboard('{Enter}')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Add a note')

    await user.type(note, '   ')
    expect(confirm).toBeDisabled()
    await user.clear(note)
    await user.type(note, 'jak 2 dup')
    expect(note).toHaveValue('jak 2 dup')
    expect(confirm).toBeEnabled()
    expect(within(dialog).getByRole('radio', { name: /Other/ })).toBeChecked()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await alertById(first)).toMatchObject({
      dismissReason: 'other',
      dismissNote: 'jak 2 dup',
    })
  })

  it('Esc closes the dialog and returns focus to the row', async () => {
    const { user } = renderQueue()
    await loaded()
    act(() => rows()[0].focus())
    await user.keyboard('d')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(rows()[0])
  })
})

describe('full details on focus and selection', () => {
  it('shows full evidence and exact time on the selected row and in its description', async () => {
    const { user } = renderQueue()
    await loaded()
    const [first, second] = rows()
    const alert = await alertById(first.dataset.alertId!)
    const exact = formatExact(alert.triggeredAt)

    const details = document.getElementById(`${alert.id}-details`)!
    expect(details).toBeVisible()
    expect(details).toHaveTextContent(exact)
    expect(within(details).getAllByRole('listitem')).toHaveLength(alert.evidence.length)
    expect(first).toHaveAccessibleDescription(expect.stringContaining(exact))
    expect(first).toHaveAccessibleDescription(expect.stringContaining(alert.evidence[0].bandLabel))

    // The one-line summary is hidden while expanded, so evidence is not repeated.
    expect(within(first).queryByText(summariseEvidence(alert.evidence))).not.toBeInTheDocument()

    // Unselected rows show the summary and keep details hidden until selected.
    const secondAlert = await alertById(second.dataset.alertId!)
    const secondSummary = summariseEvidence(secondAlert.evidence)
    const secondDetails = document.getElementById(`${secondAlert.id}-details`)!
    expect(within(second).getByText(secondSummary)).toBeVisible()
    expect(secondDetails).not.toBeVisible()

    await user.click(second)
    expect(secondDetails).toBeVisible()
    expect(within(second).queryByText(secondSummary)).not.toBeInTheDocument()
    expect(details).not.toBeVisible()
    expect(within(first).getByText(summariseEvidence(alert.evidence))).toBeVisible()
  })
})
