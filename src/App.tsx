import { AlertQueue } from './screens/AlertQueue'

function App() {
  return (
    <div className="min-h-screen bg-app text-primary">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-semibold text-heading">Vibration Alert Triage</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AlertQueue />
      </main>
    </div>
  )
}

export default App
