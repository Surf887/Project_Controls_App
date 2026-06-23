/**
 * ISO 19008 Standard Cost Coding System (SCCS) — reference facet tables.
 * Representative hierarchy aligned with Annex A (PBS), B (SAB), C (COR).
 */

import { corCodes } from './sccs/corCodes'
import { pbsCodes } from './sccs/pbsCodes'
import { sabCodes } from './sccs/sabCodes'

export type SccsFacet = 'pbs' | 'sab' | 'cor'

export interface SccsCodeEntry {
  facet: SccsFacet
  code: string
  level: 1 | 2 | 3
  parentCode: string | null
  name: string
  description: string
}

/** Resolved ISO 19008 composite on a cost line or extracted value. */
export interface SccsAssignment {
  pbs: string
  sab: string
  cor: string
  /** Dot-separated facet codes, e.g. AAC.KD.BP */
  composite: string
  source: 'mapped' | 'manual' | 'import'
}

export const SCCS_STANDARD = 'ISO 19008:2016' as const

export { pbsCodes, sabCodes, corCodes }

export const allSccsCodes: SccsCodeEntry[] = [...pbsCodes, ...sabCodes, ...corCodes]

export function findSccsCode(facet: SccsFacet, code: string): SccsCodeEntry | undefined {
  const table = facet === 'pbs' ? pbsCodes : facet === 'sab' ? sabCodes : corCodes
  return table.find((entry) => entry.code === code)
}

export function formatCompositeCode(pbs: string, sab: string, cor: string): string {
  return `${pbs}.${sab}.${cor}`
}

export function countSccsCodes(): Record<SccsFacet, number> {
  return { pbs: pbsCodes.length, sab: sabCodes.length, cor: corCodes.length }
}
