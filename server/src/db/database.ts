import type { ProjectAction, ProjectState } from '@pc/store/types.js'
import { applyProjectAction } from '@pc/store/projectReducer.js'
import type { AuthUser } from '../auth/rbac.js'
import { appendImmutableAudit } from '../services/auditService.js'
import {
  assertChangeWorkflowTransition,
  assertForecastWorkflowTransition,
  WorkflowValidationError,
} from '../services/workflowEngine.js'
import { JsonProjectStore } from './jsonProjectStore.js'
import { isPostgresStore, PostgresProjectStore } from './postgresProjectStore.js'
import { isPostgresEnabled, runSqlMigrations } from './postgres.js'
import type { ProjectRecord, ProjectSummary } from './projectStoreTypes.js'
import { VersionConflictError } from './store.js'

export type { ProjectSummary, WorkflowValidationError }
export { VersionConflictError } from './store.js'

let store: JsonProjectStore | PostgresProjectStore = new JsonProjectStore()
let postgresMode = false

function auditHook(projectId: string, actor: AuthUser, action: ProjectAction, version: number) {
  appendImmutableAudit(projectId, {
    actor: actor.name,
    actorId: actor.id,
    team: actor.role,
    entityType: 'project',
    entityId: projectId,
    action: action.type,
    summary: `Dispatched ${action.type}`,
    payload: { actionType: action.type, version },
  })
}

function validateWorkflowGate(current: ProjectState, action: ProjectAction, actor?: AuthUser): void {
  if (!actor) return

  if (action.type === 'SUBMIT_FORECAST') {
    const pkg = current.forecastApprovals.find((item) => item.id === action.payload.packageId)
    if (pkg) assertForecastWorkflowTransition(pkg.status, 'under_review', actor.role)
  }
  if (action.type === 'APPROVE_FORECAST') {
    const pkg = current.forecastApprovals.find((item) => item.id === action.payload.packageId)
    if (pkg) assertForecastWorkflowTransition(pkg.status, 'approved', actor.role)
  }
  if (action.type === 'REJECT_FORECAST') {
    const pkg = current.forecastApprovals.find((item) => item.id === action.payload.packageId)
    if (pkg) assertForecastWorkflowTransition(pkg.status, 'rejected', actor.role)
  }
  if (action.type === 'SUBMIT_CHANGE') {
    const change = current.changes.find((item) => item.id === action.payload.changeId)
    if (change) assertChangeWorkflowTransition(change.status, 'submitted', actor.role)
  }
  if (action.type === 'DECIDE_CHANGE') {
    const change = current.changes.find((item) => item.id === action.payload.changeId)
    if (change) assertChangeWorkflowTransition(change.status, action.payload.decision, actor.role)
  }
}

export async function initDatabase() {
  if (isPostgresEnabled()) {
    await runSqlMigrations()
    store = new PostgresProjectStore()
    await store.init()
    postgresMode = true
    console.log('[database] using Postgres')
  } else {
    store = new JsonProjectStore()
    store.init()
    postgresMode = false
    console.log('[database] using JSON file store')
  }
}

export function isUsingPostgres(): boolean {
  return postgresMode
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (isPostgresStore(store)) {
    const rows = await store.listProjectsAsync()
    return rows.map(({ isActive: _a, ...rest }) => rest)
  }
  return store.listProjects()
}

export async function getActiveProjectRecord(): Promise<ProjectRecord> {
  if (isPostgresStore(store)) return store.getActiveProjectRecordAsync()
  return store.getActiveProjectRecord()
}

export async function getProjectRecord(projectId: string): Promise<ProjectRecord> {
  if (isPostgresStore(store)) return store.getProjectRecordAsync(projectId)
  return store.getProjectRecord(projectId)
}

export async function getActiveProject(): Promise<ProjectState> {
  return (await getActiveProjectRecord()).state
}

export async function getProjectById(projectId: string): Promise<ProjectState> {
  return (await getProjectRecord(projectId)).state
}

export async function getProjectVersion(projectId: string): Promise<number> {
  return (await getProjectRecord(projectId)).version
}

export async function setActiveProject(projectId: string): Promise<ProjectRecord> {
  if (isPostgresStore(store)) return store.setActiveProjectAsync(projectId)
  return store.setActiveProject(projectId)
}

export async function applyAction(
  projectId: string,
  action: ProjectAction,
  actor?: AuthUser,
  expectedVersion?: number,
): Promise<{ state: ProjectState; version: number }> {
  if (isPostgresStore(store)) {
    return store.applyActionAsync(
      projectId,
      action,
      actor,
      expectedVersion,
      applyProjectAction,
      validateWorkflowGate,
      auditHook,
    )
  }
  return store.applyAction(
    projectId,
    action,
    actor,
    expectedVersion,
    applyProjectAction,
    validateWorkflowGate,
    auditHook,
  )
}

export async function resetProject(projectId: string): Promise<ProjectRecord> {
  if (isPostgresStore(store)) return store.resetProjectAsync(projectId)
  return store.resetProject(projectId)
}

export function closeDatabase() {
  store.close()
}
