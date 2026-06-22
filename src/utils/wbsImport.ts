import { PERIODS, buildRow, type CostRow } from '../data/costSheet'
import { parseCsv } from './workflow'
import type { CostType, ProjectPhase, WbsNode } from '../store/types'

const VALID_COST_TYPES: CostType[] = ['CAPEX', 'OPEX', 'Owner Cost', 'Contingency', 'Management Reserve']
const VALID_PHASES: ProjectPhase[] = ['Engineering', 'Procurement', 'Construction', 'Commissioning']

function readCell(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]/g, '')
    const value = row[key]
    if (value?.trim()) {
      return value.trim()
    }
  }
  return ''
}

function parseCostType(raw: string): CostType {
  const normalized = raw.trim().toLowerCase()
  if (normalized.includes('opex') || normalized === 'op ex') return 'OPEX'
  if (normalized.includes('owner')) return 'Owner Cost'
  if (normalized.includes('contingency')) return 'Contingency'
  if (normalized.includes('management') || normalized.includes('reserve')) return 'Management Reserve'
  return 'CAPEX'
}

function parsePhase(raw: string): ProjectPhase {
  const normalized = raw.trim().toLowerCase()
  if (normalized.startsWith('eng')) return 'Engineering'
  if (normalized.startsWith('proc')) return 'Procurement'
  if (normalized.startsWith('comm')) return 'Commissioning'
  return 'Construction'
}

function parseBudget(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? 0 : parsed
}

function levelFromWbs(wbs: string): number {
  return wbs.split('.').length - 1
}

export interface WbsImportResult {
  error: string | null
  nodes: WbsNode[]
  costRows: CostRow[]
}

export function buildWbsImport(text: string): WbsImportResult {
  const rows = parseCsv(text).filter((row) => Object.values(row).some((value) => value.trim().length > 0))

  if (rows.length === 0) {
    return { error: 'WBS CSV needs a header row and at least one data row.', nodes: [], costRows: [] }
  }

  const nodes: WbsNode[] = rows.map((row, index) => {
    const wbs = readCell(row, ['wbs', 'code', 'id']) || `WBS-${index + 1}`
    const parentWbs = readCell(row, ['parentwbs', 'parent', 'parentcode']) || null
    const description = readCell(row, ['description', 'name', 'title']) || wbs
    const costType = parseCostType(readCell(row, ['costtype', 'costclass', 'class']))
    const phase = parsePhase(readCell(row, ['phase']))
    const discipline = readCell(row, ['discipline', 'disc']) || 'General'
    const originalBudget = parseBudget(readCell(row, ['originalbudget', 'budget', 'bac']))
    const currencyRaw = readCell(row, ['currency']) || 'USD'

    if (!VALID_COST_TYPES.includes(costType)) {
      return {
        id: wbs,
        wbs,
        parentWbs: parentWbs || null,
        description,
        costType: 'CAPEX',
        phase,
        discipline,
        originalBudget,
        currency: 'USD',
      }
    }

    if (!VALID_PHASES.includes(phase)) {
      return {
        id: wbs,
        wbs,
        parentWbs: parentWbs || null,
        description,
        costType,
        phase: 'Construction',
        discipline,
        originalBudget,
        currency: 'USD',
      }
    }

    return {
      id: wbs,
      wbs,
      parentWbs: parentWbs || null,
      description,
      costType,
      phase,
      discipline,
      originalBudget,
      currency: currencyRaw.toUpperCase() === 'USD' ? 'USD' : 'USD',
    }
  })

  const costRows: CostRow[] = nodes.map((node) =>
    buildRow({
      id: node.id,
      parentId: node.parentWbs,
      level: levelFromWbs(node.wbs),
      wbs: node.wbs,
      cbs: `C-${node.wbs.replace(/\./g, '')}`,
      description: node.description,
      discipline: node.discipline,
      costType: node.costType,
      phase: node.phase,
      currency: 'USD',
      originalBudget: node.originalBudget,
      approvedChanges: 0,
      commitments: Math.round(node.originalBudget * 0.65),
      eac: Math.round(node.originalBudget * 1.02),
      periods: PERIODS.map((period, index) => ({
        period,
        actual: index < 5 ? Math.round(node.originalBudget * 0.04) : 0,
        forecast: index >= 5 ? Math.round(node.originalBudget * 0.06) : 0,
        locked: index < 5,
      })),
      notes: `Imported ${node.costType} · ${node.phase}`,
      lastModifiedBy: 'WBS import',
      lastModifiedAt: new Date().toLocaleString(),
      isExpanded: levelFromWbs(node.wbs) <= 1,
    }),
  )

  return { error: null, nodes, costRows }
}

export function sampleWbsCsvContent() {
  return [
    'wbs,parentWbs,description,costType,phase,discipline,originalBudget,currency',
    'A.01,,Process Area A — Mechanical,CAPEX,Engineering,Mechanical,84000000,USD',
    'A.01.01,A.01,Equipment supply — static,CAPEX,Engineering,Mechanical,38000000,USD',
    'A.01.02,A.01,Equipment supply — rotating,CAPEX,Procurement,Mechanical,28000000,USD',
    'A.02,,Process Area A — Piping,CAPEX,Construction,Piping,61000000,USD',
    'P.04,,Procurement — Rotating equipment,CAPEX,Procurement,Procurement,96000000,USD',
    'U.02,,Utilities & Offsites,CAPEX,Construction,Civil,48000000,USD',
    'CN.00,,Project contingency,Contingency,Construction,Controls,22000000,USD',
  ].join('\n')
}
