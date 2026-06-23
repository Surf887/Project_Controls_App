import type { Role } from './roles.js'
import { query, isPostgresEnabled } from '../db/postgres.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rolesPath = path.resolve(__dirname, '../../data/project_roles.json')

export interface ProjectRoleAssignment {
  userId: string
  projectId: string
  role: Role
}

function readJsonRoles(): ProjectRoleAssignment[] {
  if (!fs.existsSync(rolesPath)) return []
  return JSON.parse(fs.readFileSync(rolesPath, 'utf8')) as ProjectRoleAssignment[]
}

function writeJsonRoles(rows: ProjectRoleAssignment[]) {
  fs.mkdirSync(path.dirname(rolesPath), { recursive: true })
  fs.writeFileSync(rolesPath, JSON.stringify(rows, null, 2), 'utf8')
}

export async function getProjectRole(userId: string, projectId: string): Promise<Role | null> {
  if (isPostgresEnabled()) {
    const result = await query<{ role: Role }>(
      'SELECT role FROM user_project_roles WHERE user_id = $1 AND project_id = $2',
      [userId, projectId],
    )
    return result.rows[0]?.role ?? null
  }
  return readJsonRoles().find((row) => row.userId === userId && row.projectId === projectId)?.role ?? null
}

export async function setProjectRole(userId: string, projectId: string, role: Role): Promise<void> {
  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO user_project_roles (user_id, project_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, project_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, projectId, role],
    )
    return
  }
  const rows = readJsonRoles().filter((row) => !(row.userId === userId && row.projectId === projectId))
  rows.push({ userId, projectId, role })
  writeJsonRoles(rows)
}

export async function listProjectRoles(projectId: string): Promise<ProjectRoleAssignment[]> {
  if (isPostgresEnabled()) {
    const result = await query<{ user_id: string; project_id: string; role: Role }>(
      'SELECT user_id, project_id, role FROM user_project_roles WHERE project_id = $1',
      [projectId],
    )
    return result.rows.map((row: { user_id: string; project_id: string; role: Role }) => ({
      userId: row.user_id,
      projectId: row.project_id,
      role: row.role,
    }))
  }
  return readJsonRoles().filter((row) => row.projectId === projectId)
}

export async function listProjectIdsForUser(userId: string): Promise<string[]> {
  if (isPostgresEnabled()) {
    const result = await query<{ project_id: string }>(
      'SELECT project_id FROM user_project_roles WHERE user_id = $1',
      [userId],
    )
    return result.rows.map((row) => row.project_id)
  }
  return readJsonRoles().filter((row) => row.userId === userId).map((row) => row.projectId)
}

/**
 * A project-scoped role assignment is authoritative for that project: it can
 * grant MORE access (a viewer who is approver on one project) or LESS (scoping
 * a broad role down per project). When no project role is set, the global role
 * applies. Global admins are handled upstream and bypass this entirely.
 */
export function effectiveRole(globalRole: Role, projectRole: Role | null): Role {
  return projectRole ?? globalRole
}
