import type { KeyboardEvent } from 'react'

interface QueueKeyboardOptions {
  ids: readonly string[]
  selectedId: string | undefined
  onMove: (id: string) => void
  onAcknowledge: (id: string) => void
  onDismiss: (id: string) => void
  onOpen: (id: string) => void
}

const TYPING_TARGETS = 'input, select, textarea, [contenteditable="true"]'

/**
 * Single-key shortcuts for the queue. Returns an onKeyDown handler that the
 * caller attaches to the queue region, so the keys only work while focus is
 * inside it (WCAG 2.1.4 Character Key Shortcuts).
 */
export function useQueueKeyboard({
  ids,
  selectedId,
  onMove,
  onAcknowledge,
  onDismiss,
  onOpen,
}: QueueKeyboardOptions) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if ((e.target as HTMLElement).closest(TYPING_TARGETS)) return
    if (ids.length === 0) return

    const index = selectedId ? ids.indexOf(selectedId) : -1
    switch (e.key) {
      case 'j':
        e.preventDefault()
        onMove(ids[Math.min(index + 1, ids.length - 1)])
        break
      case 'k':
        e.preventDefault()
        onMove(ids[Math.max(index - 1, 0)])
        break
      case 'a':
        if (!selectedId) return
        e.preventDefault()
        onAcknowledge(selectedId)
        break
      case 'd':
        if (!selectedId) return
        e.preventDefault()
        onDismiss(selectedId)
        break
      case 'Enter':
        // Only on the row itself: links and buttons inside it handle Enter natively.
        if (!selectedId || !(e.target as HTMLElement).dataset.alertId) return
        e.preventDefault()
        onOpen(selectedId)
        break
    }
  }
}
