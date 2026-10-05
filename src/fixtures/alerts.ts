import type { Alert, Asset, DismissReason, Evidence, FaultType, Severity } from '../domain/types'
import { between, round } from './random'

const HOUR_MS = 60 * 60 * 1000

type StatusSpec =
  | { status: 'new' }
  | { status: 'acknowledged' }
  | { status: 'dismissed'; reason: DismissReason; note?: string; acknowledged?: boolean }

interface AlertSpec {
  assetId: string
  point: 0 | 1
  fault: FaultType
  severity: Severity
  confidence: number
  hoursAgo: number
  state: StatusSpec
}

const NEW = { status: 'new' } as const
const ACK = { status: 'acknowledged' } as const

// Confidence is deliberately spread: a third of alerts sit between 0.4 and 0.6.
const specs: AlertSpec[] = [
  {
    assetId: 'a01',
    point: 0,
    fault: 'bearing_wear',
    severity: 'critical',
    confidence: 0.93,
    hoursAgo: 1.5,
    state: NEW,
  },
  {
    assetId: 'a01',
    point: 1,
    fault: 'bearing_wear',
    severity: 'warning',
    confidence: 0.81,
    hoursAgo: 30,
    state: ACK,
  },
  {
    assetId: 'a02',
    point: 0,
    fault: 'cavitation',
    severity: 'warning',
    confidence: 0.58,
    hoursAgo: 4,
    state: NEW,
  },
  {
    assetId: 'a02',
    point: 1,
    fault: 'looseness',
    severity: 'warning',
    confidence: 0.6,
    hoursAgo: 80,
    state: { status: 'dismissed', reason: 'known_condition' },
  },
  {
    assetId: 'a03',
    point: 0,
    fault: 'imbalance',
    severity: 'critical',
    confidence: 0.88,
    hoursAgo: 9,
    state: ACK,
  },
  {
    assetId: 'a04',
    point: 0,
    fault: 'imbalance',
    severity: 'warning',
    confidence: 0.76,
    hoursAgo: 18,
    state: NEW,
  },
  {
    assetId: 'a04',
    point: 1,
    fault: 'misalignment',
    severity: 'warning',
    confidence: 0.47,
    hoursAgo: 22,
    state: NEW,
  },
  {
    assetId: 'a05',
    point: 0,
    fault: 'gear_mesh',
    severity: 'critical',
    confidence: 0.91,
    hoursAgo: 3,
    state: NEW,
  },
  {
    assetId: 'a05',
    point: 1,
    fault: 'gear_mesh',
    severity: 'warning',
    confidence: 0.44,
    hoursAgo: 70,
    state: {
      status: 'dismissed',
      reason: 'known_condition',
      acknowledged: true,
      note: 'Tooth wear logged at last overhaul. Replacement already scheduled.',
    },
  },
  {
    assetId: 'a07',
    point: 0,
    fault: 'looseness',
    severity: 'warning',
    confidence: 0.62,
    hoursAgo: 40,
    state: { status: 'dismissed', reason: 'maintenance_in_progress' },
  },
  {
    assetId: 'a08',
    point: 0,
    fault: 'bearing_wear',
    severity: 'warning',
    confidence: 0.85,
    hoursAgo: 12,
    state: NEW,
  },
  {
    assetId: 'a08',
    point: 1,
    fault: 'misalignment',
    severity: 'warning',
    confidence: 0.52,
    hoursAgo: 6,
    state: NEW,
  },
  {
    assetId: 'a09',
    point: 0,
    fault: 'cavitation',
    severity: 'critical',
    confidence: 0.89,
    hoursAgo: 0.5,
    state: NEW,
  },
  {
    assetId: 'a09',
    point: 1,
    fault: 'bearing_wear',
    severity: 'warning',
    confidence: 0.71,
    hoursAgo: 26,
    state: ACK,
  },
  {
    assetId: 'a10',
    point: 0,
    fault: 'imbalance',
    severity: 'warning',
    confidence: 0.41,
    hoursAgo: 15,
    state: { status: 'dismissed', reason: 'model_wrong' },
  },
  {
    assetId: 'a11',
    point: 0,
    fault: 'bearing_wear',
    severity: 'critical',
    confidence: 0.95,
    hoursAgo: 2,
    state: ACK,
  },
  {
    assetId: 'a13',
    point: 0,
    fault: 'cavitation',
    severity: 'warning',
    confidence: 0.83,
    hoursAgo: 36,
    state: NEW,
  },
  {
    assetId: 'a14',
    point: 0,
    fault: 'misalignment',
    severity: 'warning',
    confidence: 0.79,
    hoursAgo: 50,
    state: ACK,
  },
  {
    assetId: 'a14',
    point: 1,
    fault: 'imbalance',
    severity: 'warning',
    confidence: 0.49,
    hoursAgo: 5,
    state: NEW,
  },
  {
    assetId: 'a16',
    point: 0,
    fault: 'imbalance',
    severity: 'critical',
    confidence: 0.86,
    hoursAgo: 11,
    state: NEW,
  },
  {
    assetId: 'a16',
    point: 1,
    fault: 'bearing_wear',
    severity: 'warning',
    confidence: 0.43,
    hoursAgo: 60,
    state: {
      status: 'dismissed',
      reason: 'sensor_fault',
      note: 'Loose sensor mount found on inspection.',
    },
  },
  {
    assetId: 'a17',
    point: 0,
    fault: 'misalignment',
    severity: 'critical',
    confidence: 0.9,
    hoursAgo: 7,
    state: NEW,
  },
  {
    assetId: 'a17',
    point: 1,
    fault: 'looseness',
    severity: 'warning',
    confidence: 0.68,
    hoursAgo: 20,
    state: ACK,
  },
  {
    assetId: 'a19',
    point: 0,
    fault: 'imbalance',
    severity: 'critical',
    confidence: 0.97,
    hoursAgo: 1,
    state: NEW,
  },
  {
    assetId: 'a19',
    point: 1,
    fault: 'imbalance',
    severity: 'warning',
    confidence: 0.59,
    hoursAgo: 45,
    state: {
      status: 'dismissed',
      reason: 'other',
      note: 'Same root cause as the fan bearing alert.',
    },
  },
  {
    assetId: 'a20',
    point: 0,
    fault: 'bearing_wear',
    severity: 'critical',
    confidence: 0.84,
    hoursAgo: 32,
    state: NEW,
  },
  {
    assetId: 'a21',
    point: 0,
    fault: 'gear_mesh',
    severity: 'warning',
    confidence: 0.46,
    hoursAgo: 14,
    state: NEW,
  },
  {
    assetId: 'a22',
    point: 0,
    fault: 'looseness',
    severity: 'warning',
    confidence: 0.66,
    hoursAgo: 10,
    state: NEW,
  },
  {
    assetId: 'a23',
    point: 0,
    fault: 'bearing_wear',
    severity: 'warning',
    confidence: 0.78,
    hoursAgo: 4,
    state: ACK,
  },
  {
    assetId: 'a23',
    point: 1,
    fault: 'misalignment',
    severity: 'warning',
    confidence: 0.51,
    hoursAgo: 19,
    state: NEW,
  },
]

interface Band {
  label: string
  /** Band edges as multiples of running speed, or absolute Hz when `absolute` is set. */
  low: number
  high: number
  absolute?: boolean
}

const GEAR_TEETH = 27
const PUMP_VANES = 6

// Primary band first. Low-confidence alerts only report the primary band.
// Labels name the band only; the range is shown once, from lowHz/highHz.
export const EVIDENCE_BANDS: Record<FaultType, [Band, Band]> = {
  imbalance: [
    { label: '1× running speed', low: 0.95, high: 1.05 },
    { label: '1× running speed, axial', low: 0.95, high: 1.05 },
  ],
  misalignment: [
    { label: '2× running speed', low: 1.95, high: 2.05 },
    { label: '1× running speed, axial', low: 0.95, high: 1.05 },
  ],
  looseness: [
    { label: 'Running speed harmonics', low: 0.95, high: 5.05 },
    { label: '½× subharmonic', low: 0.45, high: 0.55 },
  ],
  bearing_wear: [
    { label: 'Outer race defect band, BPFO', low: 3.4, high: 3.7 },
    { label: 'High-frequency envelope', low: 1000, high: 4000, absolute: true },
  ],
  gear_mesh: [
    { label: 'Gear mesh frequency', low: GEAR_TEETH * 0.98, high: GEAR_TEETH * 1.02 },
    { label: 'Gear mesh sidebands', low: GEAR_TEETH - 2, high: GEAR_TEETH + 2 },
  ],
  cavitation: [
    { label: 'Broadband high frequency', low: 2000, high: 10000, absolute: true },
    { label: 'Vane pass frequency', low: PUMP_VANES * 0.98, high: PUMP_VANES * 1.02 },
  ],
}

function evidenceFor(spec: AlertSpec, asset: Asset, random: () => number): Evidence[] {
  const shaftHz = asset.runningSpeedRpm / 60
  const bands =
    spec.confidence >= 0.6 ? EVIDENCE_BANDS[spec.fault] : EVIDENCE_BANDS[spec.fault].slice(0, 1)
  return bands.map((band, index) => {
    const baseline = round(between(random, 0.3, 1.2))
    // Stronger evidence for higher confidence; secondary bands exceed less.
    const ratio = (1.4 + spec.confidence * 3) * (index === 0 ? 1 : 0.6) + between(random, 0, 0.4)
    return {
      bandLabel: band.label,
      lowHz: round(band.absolute ? band.low : band.low * shaftHz, 1),
      highHz: round(band.absolute ? band.high : band.high * shaftHz, 1),
      observed: round(baseline * Math.max(ratio, 1.2)),
      baseline,
    }
  })
}

function readingFor(spec: AlertSpec, asset: Asset, random: () => number): number {
  const { warning, critical } = asset.points[spec.point].thresholds
  return spec.severity === 'critical'
    ? round(between(random, critical, critical * 1.4))
    : round(between(random, warning, critical - 0.05))
}

export function buildAlerts(now: Date, assets: readonly Asset[], random: () => number): Alert[] {
  const assetsById = new Map(assets.map((a) => [a.id, a]))

  return specs.map((spec, index): Alert => {
    const asset = assetsById.get(spec.assetId)
    if (!asset) throw new Error(`Fixture alert references unknown asset ${spec.assetId}`)

    const triggered = now.getTime() - spec.hoursAgo * HOUR_MS
    const afterTrigger = (fraction: number) =>
      new Date(triggered + spec.hoursAgo * HOUR_MS * fraction).toISOString()

    const base = {
      id: `al-${String(index + 1).padStart(3, '0')}`,
      assetId: asset.id,
      pointId: asset.points[spec.point].id,
      severity: spec.severity,
      faultType: spec.fault,
      confidence: spec.confidence,
      evidence: evidenceFor(spec, asset, random),
      reading: readingFor(spec, asset, random),
      thresholds: { ...asset.points[spec.point].thresholds },
      triggeredAt: new Date(triggered).toISOString(),
    }

    switch (spec.state.status) {
      case 'new':
        return { ...base, status: 'new' }
      case 'acknowledged':
        return { ...base, status: 'acknowledged', acknowledgedAt: afterTrigger(0.2) }
      case 'dismissed':
        return {
          ...base,
          status: 'dismissed',
          ...(spec.state.acknowledged ? { acknowledgedAt: afterTrigger(0.1) } : {}),
          dismissedAt: afterTrigger(0.3),
          dismissReason: spec.state.reason,
          ...(spec.state.note ? { dismissNote: spec.state.note } : {}),
        }
    }
  })
}
