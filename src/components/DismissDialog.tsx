import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { validateDismissInput } from '../domain/alerts'
import { DISMISS_REASON_LABELS } from '../domain/format'
import { DISMISS_REASONS, type DismissInput, type DismissReason } from '../domain/types'

interface DismissDialogProps {
  /** Shown in the heading, e.g. "Stock pump 1 · Cavitation". */
  subject: string
  onConfirm: (input: DismissInput) => void
  onCancel: () => void
}

const FOCUSABLE = 'input:not([disabled]), button:not([disabled])'

/**
 * Modal dialog listing the fixed dismissal reasons. Keys 1–5 pick a reason,
 * Enter confirms, Esc cancels. Focus stays inside while open; the caller
 * returns focus to the queue when it closes.
 */
export function DismissDialog({ subject, onConfirm, onCancel }: DismissDialogProps) {
  const titleId = useId()
  const noteId = useId()
  const errorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [reason, setReason] = useState<DismissReason | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('input[type="radio"]')?.focus()
  }, [])

  function choose(next: DismissReason) {
    setReason(next)
    setError(null)
    dialogRef.current?.querySelector<HTMLInputElement>(`input[value="${next}"]`)?.focus()
  }

  function submit() {
    if (!reason) {
      setError('Choose a reason.')
      return
    }
    const input: DismissInput = { reason, ...(note.trim() ? { note: note.trim() } : {}) }
    const invalid = validateDismissInput(input)
    if (invalid) {
      setError('Add a note to explain "Other".')
      dialogRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(noteId)}`)?.focus()
      return
    }
    onConfirm(input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      const first = items[0]
      const last = items.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
      return
    }
    // Enter confirms from anywhere except the buttons, which handle it themselves.
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      submit()
      return
    }
    const typing = (e.target as HTMLElement).id === noteId
    const index = Number(e.key) - 1
    if (
      !typing &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      index >= 0 &&
      index < DISMISS_REASONS.length
    ) {
      e.preventDefault()
      choose(DISMISS_REASONS[index])
    }
  }

  const noteRequired = reason === 'other'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-lg bg-surface p-6 shadow-floating"
      >
        <h2 id={titleId} className="text-lg font-semibold text-heading">
          Dismiss alert
        </h2>
        <p className="mt-1 text-sm text-secondary">{subject}</p>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <fieldset>
            <legend className="text-sm font-medium text-primary">Reason</legend>
            <div className="mt-2 space-y-1">
              {DISMISS_REASONS.map((value, i) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-subtle"
                >
                  <input
                    type="radio"
                    name="dismiss-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => choose(value)}
                    className="accent-[var(--ui-accent)]"
                  />
                  <span className="flex-1">{DISMISS_REASON_LABELS[value]}</span>
                  <kbd className="text-xs text-tertiary">{i + 1}</kbd>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor={noteId} className="mt-4 block text-sm font-medium text-primary">
            Note {noteRequired ? '(required)' : '(optional)'}
          </label>
          <input
            id={noteId}
            type="text"
            value={note}
            required={noteRequired}
            aria-invalid={error && noteRequired ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setNote(e.target.value)
              setError(null)
            }}
            className="mt-1 w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-primary"
          />

          {error && (
            <p id={errorId} role="alert" className="mt-2 text-sm text-primary">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-strong bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
            >
              Dismiss
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
