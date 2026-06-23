import type { CostRow } from '../data/costSheet'
import type { ExtractedValue } from '../data/projectData'
import { buildSccsAssignment } from '../data/sccsMappings'
import type { SccsAssignment, SccsCodeEntry, SccsFacet } from '../data/sccs'
import { allSccsCodes, findSccsCode } from '../data/sccs'

export function resolveSccsForCostRow(row: Pick<CostRow, 'wbs' | 'cbs' | 'phase' | 'sccs'>): SccsAssignment {
  if (row.sccs?.source === 'manual') {
    return row.sccs
  }
  return buildSccsAssignment({
    wbs: row.wbs,
    cbs: row.cbs,
    phase: row.phase,
    source: row.sccs?.source ?? 'mapped',
  })
}

export function resolveSccsForExtraction(
  value: Pick<ExtractedValue, 'wbs' | 'cbs' | 'category' | 'sccs'>,
): SccsAssignment {
  if (value.sccs?.source === 'manual') {
    return value.sccs
  }
  if (value.sccs?.pbs && value.sccs?.sab && value.sccs?.cor) {
    return value.sccs
  }
  return buildSccsAssignment({
    wbs: value.wbs,
    cbs: value.cbs,
    category: value.category,
    source: value.sccs?.source ?? 'mapped',
  })
}

export function enrichCostSheetRows(rows: CostRow[]): CostRow[] {
  return rows.map((row) => ({
    ...row,
    sccs: resolveSccsForCostRow(row),
  }))
}

export function enrichExtractedValues(values: ExtractedValue[]): ExtractedValue[] {
  return values.map((value) => ({
    ...value,
    sccs: resolveSccsForExtraction(value),
  }))
}

export interface SccsRollupLine {
  composite: string
  pbs: string
  sab: string
  cor: string
  rowCount: number
  budgetUsd: number
  eacUsd: number
}

export function rollupCostSheetBySccs(rows: CostRow[]): SccsRollupLine[] {
  const map = new Map<string, SccsRollupLine>()
  for (const row of rows) {
    if (row.parentId !== null) continue
    const sccs = resolveSccsForCostRow(row)
    const existing = map.get(sccs.composite) ?? {
      composite: sccs.composite,
      pbs: sccs.pbs,
      sab: sccs.sab,
      cor: sccs.cor,
      rowCount: 0,
      budgetUsd: 0,
      eacUsd: 0,
    }
    existing.rowCount += 1
    existing.budgetUsd += row.currentBudget
    existing.eacUsd += row.eac
    map.set(sccs.composite, existing)
  }
  return [...map.values()].sort((a, b) => b.eacUsd - a.eacUsd)
}

export function facetTree(facet: SccsFacet): SccsCodeEntry[] {
  return allSccsCodes.filter((entry) => entry.facet === facet)
}

export function lookupLabels(
  assignment: Pick<SccsAssignment, 'pbs' | 'sab' | 'cor'>,
): { pbs: string; sab: string; cor: string } {
  return {
    pbs: findSccsCode('pbs', assignment.pbs)?.name ?? assignment.pbs,
    sab: findSccsCode('sab', assignment.sab)?.name ?? assignment.sab,
    cor: findSccsCode('cor', assignment.cor)?.name ?? assignment.cor,
  }
}

export function exportSccsCsv(rows: CostRow[]): string {
  const header = 'wbs,cbs,phase,pbs,sab,cor,composite,pbs_name,sab_name,cor_name,current_budget,eac'
  const lines = rows
    .filter((row) => row.parentId === null)
    .map((row) => {
      const sccs = resolveSccsForCostRow(row)
      const labels = lookupLabels(sccs)
      return [
        row.wbs,
        row.cbs,
        row.phase,
        sccs.pbs,
        sccs.sab,
        sccs.cor,
        sccs.composite,
        labels.pbs,
        labels.sab,
        labels.cor,
        row.currentBudget,
        row.eac,
      ].join(',')
    })
  return [header, ...lines].join('\n')
}
