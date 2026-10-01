// Step 1 placeholder: a token check page. Replaced by the app shell in step 3.

const healthSamples = [
  {
    state: 'critical',
    shape: '●',
    label: 'Critical',
    pill: 'bg-health-critical-tint text-health-critical-text',
  },
  {
    state: 'warning',
    shape: '▲',
    label: 'Warning',
    pill: 'bg-health-warning-tint text-health-warning-text',
  },
  {
    state: 'healthy',
    shape: '○',
    label: 'Healthy',
    pill: 'bg-health-healthy-tint text-health-healthy-text',
  },
  {
    state: 'unknown',
    shape: '◌',
    label: 'Unknown',
    pill: 'bg-health-unknown-tint text-health-unknown-text',
  },
] as const

function App() {
  return (
    <main className="min-h-screen bg-app p-8 text-primary">
      <div className="mx-auto max-w-3xl rounded-lg border border-hairline bg-surface p-8">
        <h1 className="text-2xl font-semibold text-heading">Vibration Alert Triage</h1>
        <p className="mt-2 text-secondary">
          Starter scaffold. Neutral greys by default, indigo for actions, and red, amber and green
          reserved for machine health.
        </p>

        <h2 className="mt-8 text-sm font-medium text-tertiary uppercase">Machine health</h2>
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="Health states">
          {healthSamples.map((s) => (
            <li
              key={s.state}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium ${s.pill}`}
            >
              <span aria-hidden="true">{s.shape}</span>
              {s.label}
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-sm font-medium text-tertiary uppercase">Reading</h2>
        <p className="mt-3 text-primary tabular-nums">
          7.12 mm/s <span className="text-secondary">/ threshold 4.50 mm/s</span>
        </p>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="rounded-md border border-strong bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-subtle"
          >
            Dismiss
          </button>
        </div>
      </div>
    </main>
  )
}

export default App
