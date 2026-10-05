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
      (el) => !el.closest('[data-health]') && !el.closest('[data-threshold]'),
    )
    expect(offenders).toEqual([])
  })
})
