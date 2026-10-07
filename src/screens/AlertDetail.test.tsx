import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../api/mockApi'
import App from '../App'
import { createQueryWrapper } from '../test/queryWrapper'

function renderApp(url = '/') {
  window.history.replaceState(null, '', url)
  const { wrapper } = createQueryWrapper()
  return { user: userEvent.setup(), ...render(<App />, { wrapper }) }
}

function queueRows(): HTMLLIElement[] {
  const list = screen.getByRole('list', { name: 'Alerts' })
  return [...list.querySelectorAll<HTMLLIElement>(':scope > li')]
}

async function detailHeading() {
  return screen.findByRole('heading', { level: 2, name: /AG-|PM-|KB-/ })
}

beforeEach(() => api.reset())

describe('opening and closing', () => {
  it('opens with Enter on the selected row, focuses the heading, and Esc returns focus to the row', async () => {
    const { user } = renderApp('/?severity=critical')
    await screen.findByRole('list', { name: 'Alerts' })
    const [, second] = queueRows()
    const id = second.dataset.alertId!

    act(() => second.focus())
    await user.click(second)
    await user.keyboard('{Enter}')

    const heading = await detailHeading()
    expect(window.location.search).toBe(`?severity=critical&alert=${id}`)
    await waitFor(() => expect(heading).toHaveFocus())

    await user.keyboard('{Escape}')
    await screen.findByRole('list', { name: 'Alerts' })
    expect(window.location.search).toBe('?severity=critical')
    await waitFor(() => expect(document.activeElement).toBe(queueRows()[1]))
  })

  it('opens from the machine name link and returns with the Back link', async () => {
    const { user } = renderApp()
    await screen.findByRole('list', { name: 'Alerts' })
    const first = queueRows()[0]
    const name = within(first).getByRole('link')
    const machine = name.textContent!

    act(() => first.focus())
    await user.click(name)
    expect(await detailHeading()).toHaveTextContent(machine)

    await user.click(screen.getByRole('link', { name: /Back to queue/ }))
    await screen.findByRole('list', { name: 'Alerts' })
    await waitFor(() => expect(document.activeElement).toBe(queueRows()[0]))
  })

  it('shows "Alert not found" for an unknown id', async () => {
    renderApp('/?alert=al-999')
    expect(await screen.findByText('Alert not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to queue/ })).toBeInTheDocument()
  })
})

describe('content', () => {
  it('shows the trend, description, evidence, confidence and history', async () => {
    const { user } = renderApp('/?alert=al-005')
    const { alert } = await api.getAlert('al-005')
    await detailHeading()

    const chart = await screen.findByRole('group', { name: /Vibration velocity/ })
    expect(chart).toHaveAccessibleDescription(/Vibration stayed near .* The last reading/)

    const evidence = screen.getByRole('region', { name: 'Evidence bands' })
    expect(within(evidence).getAllByRole('row')).toHaveLength(alert.evidence.length + 1)

    const confidence = screen.getByRole('region', { name: 'Model confidence' })
    expect(confidence).toHaveTextContent(alert.confidence.toFixed(2))

    // al-005 is acknowledged by a fictional technician.
    const history = screen.getByRole('region', { name: 'Triage history' })
    expect(history).toHaveTextContent('Alert raised')
    expect(history).toHaveTextContent('Monitoring system')
    expect(alert.status).toBe('acknowledged')
    if (alert.status === 'acknowledged') expect(history).toHaveTextContent(alert.acknowledgedBy)

    const toggle = screen.getByRole('button', { name: 'Show data table' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const table = screen.getByRole('region', { name: 'Vibration readings' })
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(10)
    // The scroll area is keyboard-reachable straight after the toggle, so it can be scrolled with arrow keys.
    expect(table).toHaveAttribute('tabindex', '0')
    await user.tab()
    expect(table).toHaveFocus()
  })

  it('acknowledges from the detail screen and records "You" in the history', async () => {
    const { user } = renderApp('/?alert=al-001')
    await detailHeading()
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }))
    const history = screen.getByRole('region', { name: 'Triage history' })
    await waitFor(() => expect(history).toHaveTextContent('Acknowledged'))
    expect(history).toHaveTextContent('You')
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument()
  })

  it('dismisses from the detail screen with a reason', async () => {
    const { user } = renderApp('/?alert=al-001')
    const heading = await detailHeading()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await user.keyboard('4{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(heading).toHaveFocus()
    const history = screen.getByRole('region', { name: 'Triage history' })
    await waitFor(() => expect(history).toHaveTextContent('Dismissed: Sensor fault'))
  })

  it('Esc inside the dismiss dialog closes only the dialog', async () => {
    const { user } = renderApp('/?alert=al-001')
    await detailHeading()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.search).toBe('?alert=al-001')
  })

  it('uses health colours only for the severity badge and the threshold lines', async () => {
    const { container } = renderApp('/?alert=al-005')
    await detailHeading()
    await screen.findByRole('group', { name: /Vibration velocity/ })
    const offenders = [...container.querySelectorAll('[class*="health-"]')].filter(
      (el) =>
        !el.closest('[data-health]') &&
        !el.closest('[data-threshold]') &&
        !el.closest('[data-threshold-label]'),
    )
    expect(offenders).toEqual([])
  })
})

describe('special states', () => {
  async function findAlert(predicate: (d: Awaited<ReturnType<typeof api.getAlert>>) => boolean) {
    for (const alert of await api.listAlerts({ status: ['new', 'acknowledged', 'dismissed'] })) {
      const detail = await api.getAlert(alert.id)
      if (predicate(detail)) return detail
    }
    throw new Error('No matching fixture alert')
  }

  it('shows "model was wrong" as a correction, with the original estimate', async () => {
    const { alert } = await findAlert(
      ({ alert }) => alert.status === 'dismissed' && alert.dismissReason === 'model_wrong',
    )
    renderApp(`/?alert=${alert.id}`)
    await detailHeading()
    const banner = screen.getByRole('region', { name: 'Corrected by technician' })
    expect(banner).toHaveTextContent('Recorded as feedback on this alert.')
    expect(banner.innerHTML).not.toMatch(/health-/)
    const confidence = screen.getByRole('region', { name: 'Model confidence' })
    expect(confidence).toHaveTextContent('Original model estimate')
    expect(confidence).toHaveTextContent("The model's best match was")

    // The fault label was corrected, but the reading is still high: say so.
    const trend = await api.getAlertTrend(alert.id)
    const last = trend.points.at(-1)!.value
    expect(last).toBeGreaterThanOrEqual(alert.thresholds.warning)
    const limit = last >= alert.thresholds.critical ? 'critical' : 'warning'
    await waitFor(() =>
      expect(banner).toHaveTextContent(
        `Vibration is still above the ${limit} limit. Dismissing this alert does not change the reading.`,
      ),
    )
  })

  it('shows when the sensor went quiet, with the last reading, and never as healthy', async () => {
    const { alert, point } = await findAlert(
      ({ alert, point }) => alert.severity === 'critical' && point.sensorStatus === 'offline',
    )
    const { user } = renderApp(`/?alert=${alert.id}`)
    await detailHeading()
    const trend = await api.getAlertTrend(alert.id)
    const last = trend.points.at(-1)!

    const banner = await screen.findByRole('region', {
      name: /^Sensor stopped reporting \d+ h ago$/,
    })
    expect(banner).toHaveTextContent('are missing, not normal')
    await waitFor(() =>
      expect(banner).toHaveTextContent(`The last reading, ${last.value.toFixed(2)} mm/s, was`),
    )

    const chart = await screen.findByRole('group', { name: /Vibration velocity/ })
    expect(chart).toHaveAccessibleDescription(/missing data, not a steady or healthy signal/)
    expect(chart.querySelector('[data-gap]')).not.toBeNull()
    expect(trend.lastReadingAt).toBe(point.lastSeenAt)

    await user.click(screen.getByRole('button', { name: 'Show data table' }))
    expect(screen.getByRole('region', { name: 'Vibration readings' })).toHaveTextContent(
      'the sensor stopped reporting',
    )

    // Confidence explanation mentions the gap too.
    expect(screen.getByRole('region', { name: 'Model confidence' })).toHaveTextContent(
      /This sensor stopped reporting \d+ h ago/,
    )
  })

  it('explains confidence in plain words', async () => {
    const { alert } = await findAlert(
      ({ alert }) => alert.confidence < 0.6 && alert.status === 'new',
    )
    renderApp(`/?alert=${alert.id}`)
    await detailHeading()
    const confidence = screen.getByRole('region', { name: 'Model confidence' })
    expect(
      within(confidence).getByRole('heading', { name: 'What the model is unsure about' }),
    ).toBeInTheDocument()
    expect(confidence).toHaveTextContent(/often look similar in vibration data/)
  })
})

describe('machine list rows link to alerts', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))

  async function openMachineList(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^${label} \\d+ machines$`) }),
    )
    return screen.getByRole('region', { name: `${label} machines` })
  }
  const rowOf = (panel: HTMLElement, name: string) => within(panel).getByText(name).closest('li')!

  it('opens the most recent open alert for a machine that has one', async () => {
    const { user } = renderApp()
    const panel = await openMachineList(user, 'Critical')
    const press = (await api.listAssets()).find(
      (a) => a.asset.name === 'Press section drive motor',
    )!
    const expected = (await api.getAsset(press.asset.id)).alerts
      .filter((a) => a.status !== 'dismissed')
      .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0]

    const link = within(rowOf(panel, 'Press section drive motor')).getByRole('link')
    expect(link).toHaveAccessibleName(/opens its latest open alert$/)
    await user.click(link)

    expect(await detailHeading()).toHaveTextContent('Press section drive motor')
    expect(new URLSearchParams(window.location.search).get('alert')).toBe(expected.id)
  })

  it('opens the dismissed alert, with its correction banner, when there is no open alert', async () => {
    const { user } = renderApp()
    const panel = await openMachineList(user, 'Warning')
    const link = within(rowOf(panel, 'Raw water intake pump 2')).getByRole('link')
    expect(link).toHaveAccessibleName(/opens its latest dismissed alert$/)
    await user.click(link)
    await detailHeading()
    expect(screen.getByRole('region', { name: 'Corrected by technician' })).toBeInTheDocument()
  })

  it('leaves a machine with no alerts as plain text', async () => {
    const { user } = renderApp()
    const panel = await openMachineList(user, 'Healthy')
    const healthy = (await api.listAssets()).filter((a) => a.health === 'healthy')
    const noAlerts = healthy.find((a) => !a.relevantAlertId)!
    expect(noAlerts).toBeDefined()
    const row = rowOf(panel, noAlerts.asset.name)
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
    expect(row.querySelector('[tabindex]')).toBeNull()
  })

  it('is keyboard-operable, and Back returns to the open list with focus on the row', async () => {
    const { user } = renderApp()
    const panel = await openMachineList(user, 'Warning')
    const link = within(rowOf(panel, 'White water pump')).getByRole('link')
    const alertId = link.getAttribute('data-alert-link')!

    // Tab from the Close button into the rows, then open with Enter.
    act(() => within(panel).getByRole('button', { name: 'Close' }).focus())
    while (document.activeElement !== link) await user.tab()
    await user.keyboard('{Enter}')
    expect(await detailHeading()).toHaveTextContent('White water pump')
    expect(window.location.search).toBe(`?machines=warning&alert=${alertId}`)

    await user.keyboard('{Escape}')
    const reopened = await screen.findByRole('region', { name: 'Warning machines' })
    expect(window.location.search).toBe('?machines=warning')
    await waitFor(() =>
      expect(document.activeElement).toBe(reopened.querySelector(`[data-alert-link="${alertId}"]`)),
    )
  })

  it('keeps the open list when the queue filters change', async () => {
    const { user } = renderApp()
    await openMachineList(user, 'Critical')
    const severity = screen.getByRole('group', { name: 'Severity' })
    await user.click(within(severity).getByRole('button', { name: 'Warning' }))
    expect(new URLSearchParams(window.location.search).get('machines')).toBe('critical')
    expect(screen.getByRole('region', { name: 'Critical machines' })).toBeInTheDocument()
  })
})

describe('header readings', () => {
  it('shows the reading the alert was raised at, the latest reading, and the named limit', async () => {
    renderApp('/?alert=al-005')
    await detailHeading()
    const { alert, point } = await api.getAlert('al-005')
    const label = point.sensorStatus === 'online' ? 'Latest' : 'Last reading'
    expect(document.querySelector('[data-readings]')).toHaveTextContent(
      `Raised at ${alert.reading.toFixed(2)} mm/s · ${label} ${point.latestReading.toFixed(2)} mm/s · ${alert.severity} limit ${alert.thresholds[alert.severity].toFixed(2)}`,
    )
  })

  it('agrees with the last point on the chart', async () => {
    renderApp('/?alert=al-001')
    await detailHeading()
    const { point } = await api.getAlert('al-001')
    const trend = await api.getAlertTrend('al-001')
    expect(trend.points.at(-1)!.value).toBe(point.latestReading)
    expect(document.querySelector('[data-readings]')).toHaveTextContent(
      `Latest ${point.latestReading.toFixed(2)} mm/s`,
    )
  })

  it('says "Last reading" when the sensor went quiet', async () => {
    const quiet = []
    for (const a of await api.listAlerts({ status: ['new', 'acknowledged', 'dismissed'] })) {
      const d = await api.getAlert(a.id)
      if (d.point.sensorStatus === 'offline') quiet.push(d)
    }
    const { alert, point } = quiet[0]
    renderApp(`/?alert=${alert.id}`)
    await detailHeading()
    expect(document.querySelector('[data-readings]')).toHaveTextContent(
      `· Last reading ${point.latestReading.toFixed(2)} mm/s ·`,
    )
  })
})
