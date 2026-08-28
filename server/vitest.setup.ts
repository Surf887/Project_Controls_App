import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Isolate every server test run from the real dev data store
 * (server/data/projects.json) and audit log.
 *
 * Without this, tests that dispatch SET_VALUES / APPLY_APPROVED_EXTRACTIONS
 * persist into the shared dev store and contaminate later runs — e.g. the
 * fixed-id `v-lock-guard-test` value accumulates and gets marked applied:true
 * by the APPLY test, which then makes the LOCK_REPORTING_PERIOD guard test
 * see zero pending-apply extractions and fail non-deterministically.
 *
 * Runs before each test file's module graph is imported, so the store reads
 * these paths when it evaluates its module-level path constants.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-server-test-'))
process.env.DATABASE_PATH = path.join(dir, 'projects.json')
process.env.AUDIT_DIR = path.join(dir, 'audit')
process.env.DOCUMENT_STORAGE_DIR = path.join(dir, 'documents')
process.env.DOCUMENT_ENCRYPTION_KEY = 'test-document-encryption-key'
