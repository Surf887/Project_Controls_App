import type { ProjectAction, ProjectState } from '@pc/store/types.js'

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

export interface ProjectStore {
  getActiveProject(): ProjectRecord
  getProjectById(projectId: string): ProjectRecord
  listProjects(): ProjectSummary[]
  saveProject(record: ProjectRecord): void
  setActiveProjectId(projectId: string): void
  getActiveProjectId(): string
  init(): void
}

export class VersionConflictError extends Error {
  constructor(
    message: string,
    public currentVersion: number,
  ) {
    super(message)
    this.name = 'VersionConflictError'
  }
}

export function applyActionToRecord(
  record: ProjectRecord,
  action: ProjectAction,
  apply: (state: ProjectState, action: ProjectAction) => ProjectState,
  expectedVersion?: number,
): ProjectRecord {
  if (expectedVersion != null && record.version !== expectedVersion) {
    throw new VersionConflictError(
      `Project was updated elsewhere (v${record.version}, you had v${expectedVersion})`,
      record.version,
    )
  }

  const nextState = apply(record.state, action)
  return {
    state: nextState,
    updatedAt: new Date().toISOString(),
    version: record.version + 1,
  }
}
