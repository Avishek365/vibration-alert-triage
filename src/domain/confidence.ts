// Model confidence bands. Shown in neutral grey only: red, amber and green
// mean machine health, and confidence is a property of the model, not the machine.

export const CONFIDENCE_BANDS = ['low', 'medium', 'high'] as const

export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number]

/** Lower bound (inclusive) of each band above low. */
export const MEDIUM_FROM = 0.6
export const HIGH_FROM = 0.8

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= HIGH_FROM) return 'high'
  if (confidence >= MEDIUM_FROM) return 'medium'
  return 'low'
}

export const CONFIDENCE_LABELS: Record<ConfidenceBand, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

/** Number of filled meter segments, out of 3. */
export function confidenceLevel(band: ConfidenceBand): 1 | 2 | 3 {
  return band === 'high' ? 3 : band === 'medium' ? 2 : 1
}
