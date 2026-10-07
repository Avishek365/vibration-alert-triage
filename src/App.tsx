import { useState } from 'react'
import { useAlertParam } from './hooks/useAlertParam'
import { toQuery } from './hooks/useUrlFilters'
import { AlertDetail } from './screens/AlertDetail'
import { AlertQueue } from './screens/AlertQueue'

function queueHref() {
  const params = new URLSearchParams(window.location.search)
  params.delete('alert')
  return `${window.location.pathname}${toQuery(params)}`
}

function App() {
  const { alertId, open, close } = useAlertParam()
  // The alert last opened and where from, so Back can return focus to that row.
  const [lastOpened, setLastOpened] = useState<{ id: string; from: 'queue' | 'machines' } | null>(
    null,
  )

  return (
    <div className="min-h-screen bg-app text-primary">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-semibold text-heading">Vibration Alert Triage</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {alertId ? (
          <AlertDetail key={alertId} id={alertId} backHref={queueHref()} onBack={close} />
        ) : (
          <AlertQueue
            focusAlertId={lastOpened?.from === 'queue' ? lastOpened.id : null}
            focusMachineAlertId={lastOpened?.from === 'machines' ? lastOpened.id : null}
            onOpen={(id) => {
              setLastOpened({ id, from: 'queue' })
              open(id)
            }}
            onOpenFromMachines={(id) => {
              setLastOpened({ id, from: 'machines' })
              open(id)
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
