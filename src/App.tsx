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
  // The alert last opened, so the queue can return focus to its row.
  const [lastOpened, setLastOpened] = useState<string | null>(null)

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
            focusAlertId={lastOpened}
            onOpen={(id) => {
              setLastOpened(id)
              open(id)
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
