import type { ProjectAction, ProjectState } from '@pc/store/types.js'
import type { AuthUser } from '../auth/rbac.js'

export interface ProjectSummary {
  id: string
  name: string
  baselineLabel: string
  updatedAt: string
}

export interface ProjectRecord {
  state: ProjectState
  updatedAt: string
  version: number
}

export interface ApplyActionResult {
  state: ProjectState
  version: number
}

export interface ProjectStoreAdapter {
  init(): Promise<void> | void
  close(): void
  listProjects(): ProjectSummary[]
  getActiveProjectId(): string
  getActiveProjectRecord(): ProjectRecord
  getProjectRecord(projectId: string): ProjectRecord
  setActiveProject(projectId: string): ProjectRecord
  saveProjectRecord(projectId: string, record: ProjectRecord): void
  resetProject(projectId: string): ProjectRecord
  applyAction(
    projectId: string,
    action: ProjectAction,
    actor: AuthUser | undefined,
    expectedVersion: number | undefined,
    applyReducer: (state: ProjectState, action: ProjectAction) => ProjectState,
    validate: (state: ProjectState, action: ProjectAction, actor?: AuthUser) => void,
    onAudit: (projectId: string, actor: AuthUser, action: ProjectAction, version: number) => void,
  ): ApplyActionResult
}
