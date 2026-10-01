import { render, screen, within } from '@testing-library/react'
import { api } from './api/mockApi'
import App from './App'
import { createQueryWrapper } from './test/queryWrapper'

beforeEach(() => {
  api.reset()
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('renders the title and the alert queue', async () => {
    const { wrapper } = createQueryWrapper()
    render(<App />, { wrapper })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Vibration Alert Triage' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Alert queue' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Alerts' })).toBeInTheDocument()
  })

  it('shows every machine health state with a text label', async () => {
    const { wrapper } = createQueryWrapper()
    render(<App />, { wrapper })
    const summary = screen.getByRole('region', { name: 'Machine health' })
    for (const label of ['Critical', 'Warning', 'Unknown', 'Healthy']) {
      expect(await within(summary).findByText(label)).toBeInTheDocument()
    }
  })
})
