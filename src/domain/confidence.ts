import { exceedance, FAULT_LABELS, formatAge } from './format'
import type { Alert, MeasurementPoint } from './types'

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

/** Below this, the main band's rise over baseline counts as modest. */
const MODEST_RISE = 3

export interface ConfidenceExplanation {
  heading: string
  points: string[]
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Plain-language reasons behind the model's confidence. Domain statements are
 * phrased as tendencies ("often", "typically"), not rules: they describe what
 * faults usually look like, and the technician makes the call.
 */
export function explainConfidence(
  alert: Alert,
  point: MeasurementPoint,
  now: Date,
): ConfidenceExplanation {
  const fault = FAULT_LABELS[alert.faultType].toLowerCase()
  const points: string[] = []

  if (alert.evidence.length < 2) {
    points.push(
      `Only one frequency band is raised. ${capitalise(fault)} often shows in two, so the pattern is incomplete.`,
    )
  }

  const [main] = alert.evidence
  if (main && main.observed / main.baseline < MODEST_RISE) {
    points.push(
      `The rise above baseline is modest (${exceedance(main)}). Clear cases of ${fault} typically rise further.`,
    )
  }

  if (alert.alternativeFault) {
    const other = FAULT_LABELS[alert.alternativeFault.faultType].toLowerCase()
    points.push(
      `The pattern also fits ${other} (${alert.alternativeFault.confidence.toFixed(2)}). ${capitalise(fault)} and ${other} often look similar in vibration data.`,
    )
  }

  if (point.sensorStatus !== 'online') {
    points.push(
      `This sensor stopped reporting ${formatAge(point.lastSeenAt, now)} ago, so newer changes are not reflected.`,
    )
  }

  if (points.length > 0) return { heading: 'What the model is unsure about', points }

  return confidenceBand(alert.confidence) === 'high'
    ? {
        heading: 'Why the model is confident',
        points: [
          `Strong match: the bands that typically accompany ${fault} are raised well above baseline.`,
        ],
      }
    : {
        heading: 'What the model is unsure about',
        points: [
          `The evidence is consistent with ${fault} but not conclusive. Faults like this are typically confirmed on inspection.`,
        ],
      }
}
