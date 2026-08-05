import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CostRow } from '@pc/data/costSheet.js'
import type { BasisOfEstimate, WbsNode } from '@pc/store/types.js'
import { assertSafeId, resolveUnderRoot } from '../utils/safePath.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function baselineRoot(): string {
  return process.env.BASELINE_DIR ?? path.resolve(__dirname, '../../data/baselines')
}

export interface BaselineSnapshot {
  id: string
  projectId: string
  label: string
  status: 'working' | 'proposed' | 'sanctioned' | 'locked'
  createdAt: string
  createdBy: string
  createdById: string
  costSheetRows: CostRow[]
  wbsNodes: WbsNode[]
  basisOfEstimate: BasisOfEstimate
  bacTotal: number
  notes?: string
}

function projectDir(projectId: string): string {
  return resolveUnderRoot(baselineRoot(), assertSafeId(projectId, 'projectId'))
}

function snapshotPath(projectId: string, snapshotId: string): string {
  return resolveUnderRoot(projectDir(projectId), `${assertSafeId(snapshotId, 'snapshotId')}.json`)
}

function ensureDir(projectId: string) {
  fs.mkdirSync(projectDir(projectId), { recursive: true })
}

export function createBaselineSnapshot(input: {
  projectId: string
  label: string
  status?: BaselineSnapshot['status']
  createdBy: string
  createdById: string
  costSheetRows: CostRow[]
  wbsNodes: WbsNode[]
  basisOfEstimate: BasisOfEstimate
  notes?: string
}): BaselineSnapshot {
  ensureDir(input.projectId)
  const id = `BL-${Date.now()}`
  const bacTotal = input.costSheetRows
    .filter((row) => row.parentId === null)
    .reduce((sum, row) => sum + row.originalBudget + row.approvedChanges, 0)

  const snapshot: BaselineSnapshot = {
    id,
    projectId: input.projectId,
    label: input.label,
    status: input.status ?? 'sanctioned',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    createdById: input.createdById,
    costSheetRows: structuredClone(input.costSheetRows),
    wbsNodes: structuredClone(input.wbsNodes),
    basisOfEstimate: structuredClone(input.basisOfEstimate),
    bacTotal,
    notes: input.notes,
  }

  fs.writeFileSync(snapshotPath(input.projectId, id), JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}

export function listBaselineSnapshots(projectId: string): BaselineSnapshot[] {
  const dir = projectDir(projectId)
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as BaselineSnapshot)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getBaselineSnapshot(projectId: string, snapshotId: string): BaselineSnapshot | null {
  const file = snapshotPath(projectId, snapshotId)
  if (!fs.existsSync(file)) {
    return null
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BaselineSnapshot
}

export function lockBaselineSnapshot(projectId: string, snapshotId: string): BaselineSnapshot | null {
  const snapshot = getBaselineSnapshot(projectId, snapshotId)
  if (!snapshot || snapshot.status === 'locked') {
    return snapshot
  }
  snapshot.status = 'locked'
  fs.writeFileSync(snapshotPath(projectId, snapshotId), JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}
