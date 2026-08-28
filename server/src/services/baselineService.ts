import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { CostRow } from '@pc/data/costSheet.js'
import type { BasisOfEstimate, WbsNode } from '@pc/store/types.js'
import { assertSafeId, resolveUnderRoot } from '../utils/safePath.js'
import { isPostgresEnabled, query } from '../db/postgres.js'

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

export async function createBaselineSnapshot(input: {
  projectId: string
  label: string
  status?: BaselineSnapshot['status']
  createdBy: string
  createdById: string
  costSheetRows: CostRow[]
  wbsNodes: WbsNode[]
  basisOfEstimate: BasisOfEstimate
  notes?: string
}): Promise<BaselineSnapshot> {
  const id = `BL-${randomUUID()}`
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

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO baseline_snapshots
        (id, project_id, label, status, snapshot, bac_total, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [
        snapshot.id,
        snapshot.projectId,
        snapshot.label,
        snapshot.status,
        JSON.stringify(snapshot),
        snapshot.bacTotal,
        snapshot.createdBy,
        snapshot.createdAt,
      ],
    )
    return snapshot
  }

  ensureDir(input.projectId)
  fs.writeFileSync(snapshotPath(input.projectId, id), JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}

export async function listBaselineSnapshots(projectId: string): Promise<BaselineSnapshot[]> {
  if (isPostgresEnabled()) {
    const result = await query<{ snapshot: BaselineSnapshot }>(
      `SELECT snapshot FROM baseline_snapshots WHERE project_id = $1 ORDER BY created_at DESC`,
      [assertSafeId(projectId, 'projectId')],
    )
    return result.rows.map((row) => row.snapshot)
  }
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

export async function getBaselineSnapshot(projectId: string, snapshotId: string): Promise<BaselineSnapshot | null> {
  if (isPostgresEnabled()) {
    const result = await query<{ snapshot: BaselineSnapshot }>(
      `SELECT snapshot FROM baseline_snapshots WHERE project_id = $1 AND id = $2`,
      [assertSafeId(projectId, 'projectId'), assertSafeId(snapshotId, 'snapshotId')],
    )
    return result.rows[0]?.snapshot ?? null
  }
  const file = snapshotPath(projectId, snapshotId)
  if (!fs.existsSync(file)) {
    return null
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BaselineSnapshot
}

export async function lockBaselineSnapshot(projectId: string, snapshotId: string): Promise<BaselineSnapshot | null> {
  const snapshot = await getBaselineSnapshot(projectId, snapshotId)
  if (!snapshot || snapshot.status === 'locked') {
    return snapshot
  }
  snapshot.status = 'locked'
  if (isPostgresEnabled()) {
    await query(
      `UPDATE baseline_snapshots
       SET status = 'locked', snapshot = $3::jsonb
       WHERE project_id = $1 AND id = $2`,
      [
        assertSafeId(projectId, 'projectId'),
        assertSafeId(snapshotId, 'snapshotId'),
        JSON.stringify(snapshot),
      ],
    )
    return snapshot
  }
  fs.writeFileSync(snapshotPath(projectId, snapshotId), JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}
