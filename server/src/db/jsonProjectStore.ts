import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PortfolioProjectSnapshot } from '@pc/data/governance.js'
import type { ProjectAction, ProjectState } from '@pc/store/types.js'
import { createSeedState } from '@pc/store/seedState.js'
import type { AuthUser } from '../auth/rbac.js'
import { VersionConflictError } from './store.js'
import type { ProjectRecord, ProjectStoreAdapter, ProjectSummary } from './projectStoreTypes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')
const dbPath = process.env.DATABASE_PATH ?? path.join(dataDir, 'projects.json')

interface DatabaseFile {
  activeProjectId: string
  projects: Record<string, ProjectRecord>
}

export class JsonProjectStore implements ProjectStoreAdapter {
  private cache: DatabaseFile | null = null

  init() {
    this.readDb()
  }

  close() {
    this.cache = null
  }

  private ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  private seedDatabase(): DatabaseFile {
    const now = new Date().toISOString()
    const primary = createSeedState()
    const projects: Record<string, ProjectRecord> = {
      [primary.meta.id]: { state: primary, updatedAt: now, version: 1 },
    }

    primary.portfolioProjects
      .filter((project: PortfolioProjectSnapshot) => !project.isActive)
      .forEach((project: PortfolioProjectSnapshot) => {
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
        projects[project.id] = { state: benchmark, updatedAt: now, version: 1 }
      })

    return { activeProjectId: primary.meta.id, projects }
  }

  private readDb(): DatabaseFile {
    if (this.cache) return this.cache
    this.ensureDataDir()

    if (!fs.existsSync(dbPath)) {
      this.cache = this.seedDatabase()
      this.writeDb(this.cache)
      return this.cache
    }

    this.cache = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as DatabaseFile
    Object.values(this.cache.projects).forEach((entry) => {
      if (entry.version == null) entry.version = 1
    })
    return this.cache
  }

  private writeDb(db: DatabaseFile) {
    this.ensureDataDir()
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8')
    this.cache = db
  }

  getActiveProjectId(): string {
    return this.readDb().activeProjectId
  }

  listProjects(): ProjectSummary[] {
    const db = this.readDb()
    return Object.entries(db.projects)
      .map(([id, entry]) => ({
        id,
        name: entry.state.meta.name,
        baselineLabel: entry.state.meta.baselineLabel,
        updatedAt: entry.updatedAt,
        isActive: id === db.activeProjectId,
      }))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
      .map(({ isActive: _isActive, ...summary }) => summary)
  }

  getActiveProjectRecord(): ProjectRecord {
    const db = this.readDb()
    const entry = db.projects[db.activeProjectId]
    if (!entry) throw new Error('No active project configured')
    return entry
  }

  getProjectRecord(projectId: string): ProjectRecord {
    const entry = this.readDb().projects[projectId]
    if (!entry) throw new Error(`Project not found: ${projectId}`)
    return entry
  }

  setActiveProject(projectId: string): ProjectRecord {
    const db = this.readDb()
    if (!db.projects[projectId]) throw new Error(`Project not found: ${projectId}`)
    db.activeProjectId = projectId
    this.writeDb(db)
    return this.getProjectRecord(projectId)
  }

  saveProjectRecord(projectId: string, record: ProjectRecord) {
    const db = this.readDb()
    if (!db.projects[projectId]) throw new Error(`Project not found: ${projectId}`)
    db.projects[projectId] = record
    this.writeDb(db)
  }

  resetProject(projectId: string): ProjectRecord {
    const existing = this.getProjectRecord(projectId)
    const fresh = createSeedState()
    fresh.meta = { ...existing.state.meta }
    fresh.portfolioProjects = existing.state.portfolioProjects
    const record: ProjectRecord = {
      state: fresh,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    }
    this.saveProjectRecord(projectId, record)
    return record
  }

  applyAction(
    projectId: string,
    action: ProjectAction,
    actor: AuthUser | undefined,
    expectedVersion: number | undefined,
    applyReducer: (state: ProjectState, action: ProjectAction) => ProjectState,
    validate: (state: ProjectState, action: ProjectAction, actor?: AuthUser) => void,
    onAudit: (projectId: string, actor: AuthUser, action: ProjectAction, version: number) => void,
  ) {
    const entry = this.getProjectRecord(projectId)
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
    this.saveProjectRecord(projectId, record)

    if (actor && action.type !== 'HYDRATE') {
      onAudit(projectId, actor, action, record.version)
    }

    return { state: next, version: record.version }
  }
}
