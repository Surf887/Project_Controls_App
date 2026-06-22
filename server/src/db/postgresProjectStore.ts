import type { Pool } from 'pg'
import type { PortfolioProjectSnapshot } from '@pc/data/governance.js'
import type { ProjectAction, ProjectState } from '@pc/store/types.js'
import { createSeedState } from '@pc/store/seedState.js'
import type { AuthUser } from '../auth/rbac.js'
import { getPool } from './postgres.js'
import { VersionConflictError } from './store.js'
import type { ApplyActionResult, ProjectRecord, ProjectStoreAdapter, ProjectSummary } from './projectStoreTypes.js'

export class PostgresProjectStore implements ProjectStoreAdapter {
  private pool!: Pool

  async init() {
    this.pool = getPool()
    const count = await this.pool.query('SELECT COUNT(*)::int AS c FROM projects')
    if ((count.rows[0]?.c as number) === 0) {
      await this.seed()
    }
    const active = await this.pool.query(`SELECT value FROM app_settings WHERE key = 'active_project_id'`)
    if (active.rowCount === 0) {
      const first = await this.pool.query('SELECT id FROM projects LIMIT 1')
      const id = first.rows[0]?.id as string
      if (id) {
        await this.pool.query(
          `INSERT INTO app_settings (key, value) VALUES ('active_project_id', $1::jsonb) ON CONFLICT DO NOTHING`,
          [JSON.stringify(id)],
        )
        await this.pool.query('UPDATE projects SET active = (id = $1)', [id])
      }
    }
  }

  close() {
    // pool closed globally
  }

  private async seed() {
    const now = new Date().toISOString()
    const primary = createSeedState()

    await this.pool.query(
      `INSERT INTO portfolios (id, name, policy) VALUES ('default', 'Default portfolio', '{}') ON CONFLICT DO NOTHING`,
    )

    const insertProject = async (state: ProjectState, active: boolean) => {
      await this.pool.query(
        `INSERT INTO projects (id, portfolio_id, name, baseline_label, active) VALUES ($1, 'default', $2, $3, $4)`,
        [state.meta.id, state.meta.name, state.meta.baselineLabel, active],
      )
      await this.pool.query(
        `INSERT INTO project_state (project_id, state, version, updated_at) VALUES ($1, $2::jsonb, 1, $3)`,
        [state.meta.id, JSON.stringify(state), now],
      )
    }

    await insertProject(primary, true)

    for (const project of primary.portfolioProjects.filter((p: PortfolioProjectSnapshot) => !p.isActive)) {
      const benchmark = createSeedState()
      benchmark.meta = {
        id: project.id,
        name: project.name,
        baselineLabel: `${project.name} · benchmark`,
      }
      benchmark.portfolioProjects = primary.portfolioProjects.map((entry: PortfolioProjectSnapshot) => ({
        ...entry,
        isActive: entry.id === project.id,
      }))
      await insertProject(benchmark, false)
    }

    await this.pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('active_project_id', $1::jsonb)`,
      [JSON.stringify(primary.meta.id)],
    )
  }

  private async activeProjectId(): Promise<string> {
    const row = await this.pool.query(`SELECT value FROM app_settings WHERE key = 'active_project_id'`)
    const id = row.rows[0]?.value
    if (typeof id === 'string') return id.replace(/"/g, '')
    return (id as string) ?? ''
  }

  listProjects(): ProjectSummary[] {
    throw new Error('Use listProjectsAsync')
  }

  async listProjectsAsync(): Promise<Array<ProjectSummary & { isActive: boolean }>> {
    const activeId = await this.activeProjectId()
    const result = await this.pool.query(
      `SELECT p.id, p.name, p.baseline_label, ps.updated_at, p.active
       FROM projects p JOIN project_state ps ON ps.project_id = p.id
       ORDER BY p.active DESC, p.name`,
    )
    return result.rows.map((row: {
      id: string
      name: string
      baseline_label: string
      updated_at: Date
    }) => ({
      id: row.id as string,
      name: row.name as string,
      baselineLabel: row.baseline_label as string,
      updatedAt: (row.updated_at as Date).toISOString(),
      isActive: row.id === activeId,
    }))
  }

  getActiveProjectId(): string {
    throw new Error('Use getActiveProjectIdAsync')
  }

  async getActiveProjectIdAsync(): Promise<string> {
    return this.activeProjectId()
  }

  async getProjectRecordAsync(projectId: string): Promise<ProjectRecord> {
    const result = await this.pool.query(
      `SELECT state, version, updated_at FROM project_state WHERE project_id = $1`,
      [projectId],
    )
    if (result.rowCount === 0) throw new Error(`Project not found: ${projectId}`)
    const row = result.rows[0]!
    return {
      state: row.state as ProjectState,
      version: row.version as number,
      updatedAt: (row.updated_at as Date).toISOString(),
    }
  }

  getActiveProjectRecord(): ProjectRecord {
    throw new Error('Use async methods')
  }

  getProjectRecord(_projectId: string): ProjectRecord {
    throw new Error('Use async methods')
  }

  async getActiveProjectRecordAsync(): Promise<ProjectRecord> {
    return this.getProjectRecordAsync(await this.activeProjectId())
  }

  setActiveProject(_projectId: string): ProjectRecord {
    throw new Error('Use setActiveProjectAsync')
  }

  async setActiveProjectAsync(projectId: string): Promise<ProjectRecord> {
    await this.getProjectRecordAsync(projectId)
    await this.pool.query('UPDATE projects SET active = (id = $1)', [projectId])
    await this.pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('active_project_id', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(projectId)],
    )
    return this.getProjectRecordAsync(projectId)
  }

  saveProjectRecord(_projectId: string, _record: ProjectRecord): void {
    throw new Error('Use internal save')
  }

  private async saveRecord(projectId: string, record: ProjectRecord) {
    await this.pool.query(
      `UPDATE project_state SET state = $1::jsonb, version = $2, updated_at = $3 WHERE project_id = $4`,
      [JSON.stringify(record.state), record.version, record.updatedAt, projectId],
    )
    await this.pool.query(`UPDATE projects SET name = $1, baseline_label = $2, updated_at = $3 WHERE id = $4`, [
      record.state.meta.name,
      record.state.meta.baselineLabel,
      record.updatedAt,
      projectId,
    ])
  }

  resetProject(_projectId: string): ProjectRecord {
    throw new Error('Use resetProjectAsync')
  }

  async resetProjectAsync(projectId: string): Promise<ProjectRecord> {
    const existing = await this.getProjectRecordAsync(projectId)
    const fresh = createSeedState()
    fresh.meta = { ...existing.state.meta }
    fresh.portfolioProjects = existing.state.portfolioProjects
    const record: ProjectRecord = {
      state: fresh,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    }
    await this.saveRecord(projectId, record)
    return record
  }

  applyAction(
    _projectId: string,
    _action: ProjectAction,
    _actor: AuthUser | undefined,
    _expectedVersion: number | undefined,
    _applyReducer: (state: ProjectState, action: ProjectAction) => ProjectState,
    _validate: (state: ProjectState, action: ProjectAction, actor?: AuthUser) => void,
    _onAudit: (projectId: string, actor: AuthUser, action: ProjectAction, version: number) => void,
  ): ApplyActionResult {
    throw new Error('Use applyActionAsync')
  }

  async applyActionAsync(
    projectId: string,
    action: ProjectAction,
    actor: AuthUser | undefined,
    expectedVersion: number | undefined,
    applyReducer: (state: ProjectState, action: ProjectAction) => ProjectState,
    validate: (state: ProjectState, action: ProjectAction, actor?: AuthUser) => void,
    onAudit: (projectId: string, actor: AuthUser, action: ProjectAction, version: number) => void,
  ) {
    const entry = await this.getProjectRecordAsync(projectId)
    if (expectedVersion != null && entry.version !== expectedVersion) {
      throw new VersionConflictError(
        `Project was updated elsewhere (v${entry.version}, you had v${expectedVersion})`,
        entry.version,
      )
    }

    validate(entry.state, action, actor)
    const next = applyReducer(entry.state, action)
    const record: ProjectRecord = {
      state: next,
      updatedAt: new Date().toISOString(),
      version: entry.version + 1,
    }
    await this.saveRecord(projectId, record)

    if (actor && action.type !== 'HYDRATE') {
      onAudit(projectId, actor, action, record.version)
    }

    return { state: next, version: record.version }
  }
}

export function isPostgresStore(store: ProjectStoreAdapter): store is PostgresProjectStore {
  return store instanceof PostgresProjectStore
}
