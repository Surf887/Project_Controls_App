import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyProjectAction } from '@pc/store/projectReducer.js'
import { validateProjectAction } from '@pc/engine/actionValidation.js'
import type { AuthUser } from '../auth/rbac.js'
import { closePool, query, runSqlMigrations } from './postgres.js'
import { PostgresProjectStore } from './postgresProjectStore.js'
import { VersionConflictError } from './store.js'

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
        () => undefined,
      )

    const updated = await apply()
    expect(updated.version).toBe(current.version + 1)
    await expect(apply()).rejects.toBeInstanceOf(VersionConflictError)
  })
})
