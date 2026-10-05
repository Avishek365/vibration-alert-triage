import { render, screen, within } from '@testing-library/react'
import { acknowledge, dismiss } from '../domain/alerts'
import type { Alert } from '../domain/types'
import { buildFixtures } from '../fixtures'
import { AlertRow } from './AlertRow'

const now = new Date('2026-09-30T08:00:00Z')
const { sites, assets, alerts } = buildFixtures(now)

function renderRow(alert: Alert) {
  const asset = assets.find((a) => a.id === alert.assetId)!
  const site = sites.find((s) => s.id === asset.siteId)!
  const point = asset.points.find((p) => p.id === alert.pointId)!
  const { container } = render(
    <ul>
      <AlertRow
        alert={alert}
        asset={asset}
        site={site}
        point={point}
        now={now}
        selected
        onSelect={() => {}}
        onAcknowledge={() => {}}
        onDismiss={() => {}}
        onOpen={() => {}}
      />
    </ul>,
  )
  return container.querySelector('li')!
}

/** Labels of the action slots, in order, whether real buttons or placeholders. */
function actionSlots(row: HTMLElement) {
  const actions = row.querySelector('button, [data-placeholder]')!.parentElement!
  return [...actions.children].map((el) => ({
    label: el.textContent?.replace(/\s+[ad]$/, ''),
    isButton: el.tagName === 'BUTTON',
    hidden: el.getAttribute('aria-hidden') === 'true',
  }))
}

describe('AlertRow action slots', () => {
  const fresh = alerts.find((a) => a.status === 'new')!

  it('shows both actions for a new alert', () => {
    const row = renderRow(fresh)
    expect(actionSlots(row)).toEqual([
      { label: 'Acknowledge', isButton: true, hidden: false },
      { label: 'Dismiss', isButton: true, hidden: false },
    ])
  })

  it('reserves the Acknowledge space on an acknowledged alert, without a control', () => {
    const row = renderRow(acknowledge(fresh, now))
    expect(actionSlots(row)).toEqual([
      { label: 'Acknowledge', isButton: false, hidden: true },
      { label: 'Dismiss', isButton: true, hidden: false },
    ])
    expect(within(row).queryByRole('button', { name: /Acknowledge/ })).not.toBeInTheDocument()
    expect(row.querySelector('[data-placeholder="Acknowledge"]')).toHaveClass('invisible')
  })

  it('reserves both spaces on a dismissed alert', () => {
    const row = renderRow(dismiss(fresh, { reason: 'model_wrong' }, now))
    expect(actionSlots(row)).toEqual([
      { label: 'Acknowledge', isButton: false, hidden: true },
      { label: 'Dismiss', isButton: false, hidden: true },
    ])
    expect(within(row).queryAllByRole('button')).toHaveLength(0)
  })

  it('gives placeholders the same classes as buttons, so they take the same space', () => {
    const real = renderRow(fresh).querySelector('button')!
    const placeholder = renderRow(acknowledge(fresh, now)).querySelector('[data-placeholder]')!
    expect(placeholder.className.replace(' invisible', '')).toBe(real.className)
  })
})

describe('AlertRow sensor description', () => {
  it('includes the sensor status in the screen-reader description even when online', () => {
    const online = alerts.find((alert) => {
      const asset = assets.find((a) => a.id === alert.assetId)!
      return asset.points.find((p) => p.id === alert.pointId)!.sensorStatus === 'online'
    })!
    const row = renderRow(online)
    expect(row).toHaveAccessibleDescription(expect.stringContaining('Sensor online · Last reading'))
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
  })
})
