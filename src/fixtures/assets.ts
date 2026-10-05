import { sensorStatusFor } from '../domain/health'
import type { Asset, AssetType, Thresholds } from '../domain/types'
import { between, round } from './random'

const HOUR_MS = 60 * 60 * 1000

const THRESHOLDS: Record<AssetType, Thresholds> = {
  motor: { warning: 4.5, critical: 7.1 },
  pump: { warning: 4.5, critical: 7.1 },
  fan: { warning: 4.5, critical: 7.1 },
  gearbox: { warning: 7.1, critical: 11.2 },
  compressor: { warning: 7.1, critical: 11.2 },
}

const POINT_NAMES: Record<AssetType, [string, string]> = {
  motor: ['Motor DE bearing', 'Motor NDE bearing'],
  pump: ['Pump DE bearing', 'Pump NDE bearing'],
  fan: ['Fan bearing', 'Motor DE bearing'],
  gearbox: ['Input shaft bearing', 'Output shaft bearing'],
  compressor: ['Motor DE bearing', 'Compressor DE bearing'],
}

interface AssetSpec {
  id: string
  siteId: string
  tag: string
  name: string
  type: AssetType
  rpm: number
  /** Hours since last reading, per point index. Omitted points report within the last hour. */
  lastSeenHoursAgo?: Partial<Record<0 | 1, number>>
}

const specs: AssetSpec[] = [
  // Northfield Paper Mill
  {
    id: 'a01',
    siteId: 's1',
    tag: 'PM-M-101',
    name: 'Press section drive motor',
    type: 'motor',
    rpm: 1490,
  },
  { id: 'a02', siteId: 's1', tag: 'PM-P-102', name: 'Stock pump 1', type: 'pump', rpm: 1780 },
  {
    id: 'a03',
    siteId: 's1',
    tag: 'PM-P-103',
    name: 'Stock pump 2',
    type: 'pump',
    rpm: 1780,
    lastSeenHoursAgo: { 0: 3 },
  },
  { id: 'a04', siteId: 's1', tag: 'PM-F-104', name: 'Dryer exhaust fan', type: 'fan', rpm: 990 },
  {
    id: 'a05',
    siteId: 's1',
    tag: 'PM-G-105',
    name: 'Calender gearbox',
    type: 'gearbox',
    rpm: 1490,
  },
  {
    id: 'a06',
    siteId: 's1',
    tag: 'PM-M-106',
    name: 'Reel drive motor',
    type: 'motor',
    rpm: 1185,
    lastSeenHoursAgo: { 1: 50 },
  },
  { id: 'a07', siteId: 's1', tag: 'PM-P-107', name: 'White water pump', type: 'pump', rpm: 1475 },
  {
    id: 'a08',
    siteId: 's1',
    tag: 'PM-C-108',
    name: 'Vacuum compressor',
    type: 'compressor',
    rpm: 2970,
  },
  // Kestrel Bay Water Treatment
  {
    id: 'a09',
    siteId: 's2',
    tag: 'KB-P-201',
    name: 'Raw water intake pump 1',
    type: 'pump',
    rpm: 1485,
  },
  {
    id: 'a10',
    siteId: 's2',
    tag: 'KB-P-202',
    name: 'Raw water intake pump 2',
    type: 'pump',
    rpm: 1485,
  },
  {
    id: 'a11',
    siteId: 's2',
    tag: 'KB-C-203',
    name: 'Aeration blower 1',
    type: 'compressor',
    rpm: 2950,
    lastSeenHoursAgo: { 1: 6 },
  },
  {
    id: 'a12',
    siteId: 's2',
    tag: 'KB-C-204',
    name: 'Aeration blower 2',
    type: 'compressor',
    rpm: 2950,
  },
  { id: 'a13', siteId: 's2', tag: 'KB-P-205', name: 'Backwash pump', type: 'pump', rpm: 1480 },
  {
    id: 'a14',
    siteId: 's2',
    tag: 'KB-M-206',
    name: 'Clarifier drive motor',
    type: 'motor',
    rpm: 1450,
  },
  {
    id: 'a15',
    siteId: 's2',
    tag: 'KB-P-207',
    name: 'Sludge transfer pump',
    type: 'pump',
    rpm: 980,
    lastSeenHoursAgo: { 0: 72, 1: 72 },
  },
  { id: 'a16', siteId: 's2', tag: 'KB-F-208', name: 'Odour control fan', type: 'fan', rpm: 1470 },
  // Tallow Ridge Cement Works
  {
    id: 'a17',
    siteId: 's3',
    tag: 'AG-M-301',
    name: 'Kiln main drive motor',
    type: 'motor',
    rpm: 990,
  },
  {
    id: 'a18',
    siteId: 's3',
    tag: 'AG-G-302',
    name: 'Kiln main gearbox',
    type: 'gearbox',
    rpm: 990,
  },
  { id: 'a19', siteId: 's3', tag: 'AG-F-303', name: 'Kiln ID fan', type: 'fan', rpm: 980 },
  {
    id: 'a20',
    siteId: 's3',
    tag: 'AG-M-304',
    name: 'Raw mill motor',
    type: 'motor',
    rpm: 1490,
    lastSeenHoursAgo: { 0: 30 },
  },
  {
    id: 'a21',
    siteId: 's3',
    tag: 'AG-G-305',
    name: 'Raw mill gearbox',
    type: 'gearbox',
    rpm: 1490,
  },
  {
    id: 'a22',
    siteId: 's3',
    tag: 'AG-F-306',
    name: 'Clinker cooler fan 3',
    type: 'fan',
    rpm: 1480,
    lastSeenHoursAgo: { 0: 8 },
  },
  {
    id: 'a23',
    siteId: 's3',
    tag: 'AG-C-307',
    name: 'Plant air compressor',
    type: 'compressor',
    rpm: 2960,
  },
  {
    id: 'a24',
    siteId: 's3',
    tag: 'AG-M-308',
    name: 'Separator drive motor',
    type: 'motor',
    rpm: 1480,
  },
]

export function buildAssets(now: Date, random: () => number): Asset[] {
  return specs.map((spec) => ({
    id: spec.id,
    siteId: spec.siteId,
    tag: spec.tag,
    name: spec.name,
    type: spec.type,
    runningSpeedRpm: spec.rpm,
    points: POINT_NAMES[spec.type].map((name, index) => {
      const hoursAgo = spec.lastSeenHoursAgo?.[index as 0 | 1] ?? round(between(random, 0.05, 0.6))
      const lastSeen = new Date(now.getTime() - hoursAgo * HOUR_MS)
      return {
        id: `${spec.id}-p${index + 1}`,
        name,
        sensorStatus: sensorStatusFor(lastSeen.toISOString(), now),
        lastSeenAt: lastSeen.toISOString(),
        thresholds: { ...THRESHOLDS[spec.type] },
      }
    }),
  }))
}
