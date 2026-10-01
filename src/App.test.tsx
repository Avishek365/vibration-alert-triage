import { render, screen, within } from '@testing-library/react'
import App from './App'

describe('App placeholder', () => {
  it('renders the title', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Vibration Alert Triage' }),
    ).toBeInTheDocument()
  })

  it('labels every health state with text, not colour alone', () => {
    render(<App />)
    const list = screen.getByRole('list', { name: 'Health states' })
    for (const label of ['Critical', 'Warning', 'Healthy', 'Unknown']) {
      expect(within(list).getByText(label)).toBeInTheDocument()
    }
  })
})
