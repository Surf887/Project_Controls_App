import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyProjectAction } from '@pc/store/projectReducer.js'
import { validateProjectAction } from '@pc/engine/actionValidation.js'
import type { AuthUser } from '../auth/rbac.js'
import { closePool, query, runSqlMigrations } from './postgres.js'
import { PostgresProjectStore } from './postgresProjectStore.js'
import { VersionConflictError } from './store.js'
import {
  appendPostgresAudit,
  listImmutableAuditAsync,
  verifyAuditChainAsync,
} from '../services/auditService.js'
import {
  createBaselineSnapshot,
  getBaselineSnapshot,
  listBaselineSnapshots,
  lockBaselineSnapshot,
} from '../services/baselineService.js'

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip

describePostgres('Postgres project store integration', () => {
  let store: PostgresProjectStore
  const actor: AuthUser = { id: 'postgres-test', name: 'Postgres test', role: 'admin' }

  beforeAll(async () => {
    await runSqlMigrations()
    store = new PostgresProjectStore()
    await store.init()
  })

  afterAll(async () => {
    await closePool()
  })

  it('applies every SQL migration and seeds readable projects', async () => {
    const migrations = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM schema_migrations')
    expect(migrations.rows[0]?.count).toBeGreaterThanOrEqual(4)

    const projects = await store.listProjectsAsync()
    const active = await store.getActiveProjectRecordAsync()
    expect(projects.length).toBeGreaterThan(0)
    expect(active.state.meta.id).toBeTruthy()
    expect(active.version).toBeGreaterThan(0)
  })

  it('atomically rejects a stale state version', async () => {
    const current = await store.getActiveProjectRecordAsync()
    const projectId = current.state.meta.id
    const action = {
      type: 'SET_META' as const,
      payload: { baselineLabel: `Postgres integration ${Date.now()}` },
    }
    const apply = () =>
      store.applyActionAsync(
        projectId,
        action,
        actor,
        current.version,
        applyProjectAction,
        (state, nextAction) => validateProjectAction(state, nextAction),
        (client, auditedProjectId, auditedActor, auditedAction, version) =>
          appendPostgresAudit(client, auditedProjectId, {
            actor: auditedActor.name,
            actorId: auditedActor.id,
            team: auditedActor.role,
            entityType: 'project',
            entityId: auditedProjectId,
            action: auditedAction.type,
            summary: `Dispatched ${auditedAction.type}`,
            payload: { actionType: auditedAction.type, version },
          }).then(() => undefined),
      )

    const updated = await apply()
    expect(updated.version).toBe(current.version + 1)
    const audit = await listImmutableAuditAsync(projectId)
    expect(audit[0]?.action).toBe('SET_META')
    expect((await verifyAuditChainAsync(projectId)).ok).toBe(true)
    await expect(apply()).rejects.toBeInstanceOf(VersionConflictError)
  })

  it('persists and locks baseline snapshots in Postgres', async () => {
    const current = await store.getActiveProjectRecordAsync()
    const snapshot = await createBaselineSnapshot({
      projectId: current.state.meta.id,
      label: 'Integration baseline',
      createdBy: actor.name,
      createdById: actor.id,
      costSheetRows: current.state.costSheetRows,
      wbsNodes: current.state.wbsNodes,
      basisOfEstimate: current.state.basisOfEstimate,
    })

    expect((await listBaselineSnapshots(current.state.meta.id)).some((item) => item.id === snapshot.id)).toBe(true)
    expect((await getBaselineSnapshot(current.state.meta.id, snapshot.id))?.status).toBe('sanctioned')
    expect((await lockBaselineSnapshot(current.state.meta.id, snapshot.id))?.status).toBe('locked')
  })
})
