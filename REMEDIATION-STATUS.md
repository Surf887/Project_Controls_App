# Remediation Status

Tracks how the findings in `PRODUCTION-READINESS-AUDIT.md` were addressed. Status updated August 2026.

## Current verdict

The supported scope is **deployment-ready for a same-origin, PostgreSQL-backed production release** after the deployment-specific gates below are completed. Simulated modules are excluded by default. Horizontal scale, regulated/compliance sign-off, live enterprise adapters, and unrestricted enterprise rollout still require the operational and integration follow-ups listed below.

This pass also closes gaps found after the original audit: production images include SQL migration assets, governance records are PostgreSQL-backed, browser sessions use HttpOnly cookies, unsupported simulated modules fail closed, and production clients do not expose offline demo data when the API is unavailable.

## P0 — Critical blockers (all fixed)

| # | Finding | Status | How |
|---|---|---|---|
| C1 | Docker image never compiled the server | ✅ Fixed | Multi-stage `Dockerfile` builds client + server, non-root, healthcheck; API serves client in prod |
| C2 | IDOR — compute/enterprise/platform routes skipped membership | ✅ Fixed | `attachProjectRole` + `requireRole` applied to all `:projectId` routers; `activate` gated |
| C3 | Unauthenticated, unsigned webhook | ✅ Fixed | HMAC-SHA256 signature verification (`webhookAuth.ts`); raw-body capture |
| C4 | Non-atomic concurrency → lost updates | ✅ Fixed | Postgres transactional `FOR UPDATE` + version-conditional UPDATE; JSON atomic temp+fsync+rename |
| C5 | Client role from editable localStorage | ✅ Fixed | `useProjectRole` derives role from the verified session/user |

## P1 — High (fixed)

- ✅ Canonical HMAC audit events are stored in PostgreSQL and commit atomically with project-state mutations; the file chain remains a local-development fallback.
- ✅ Fail-fast in production when `DATABASE_URL` is unset; JSON writes are atomic.
- ✅ Zod validation on all mutating routes; `If-Match` validated as a positive integer.
- ✅ Top-level React error boundary; 409 conflicts surfaced (no silent edit loss); token expiry handling.
- ✅ Structured JSON logging + request logging with `x-request-id`; real DB health (`/api/health`, `/live`, `/ready`).
- ✅ Graceful shutdown (drain + pool close + timeout, SIGTERM/SIGINT).
- ✅ Route-level code splitting (main chunk ~600 kB → ~308 kB).
- ✅ Connector OAuth tokens encrypted at rest (AES-256-GCM, `CREDENTIALS_KEY`).
- ✅ CI: production dependency audit is blocking; Docker, e2e, and Postgres migration/concurrency jobs are enabled.
- ✅ Secrets: compose uses env vars; Postgres not host-exposed; `server/data/*` and `.env` gitignored.
- ✅ Path-traversal guard on `projectId`; production admin-password length check.
- ✅ Fixed a fresh-checkout seeding bug (migration pre-created an empty store, blocking seed) that would have hung server tests/CI on a clean clone.
- ✅ SQL migrations are copied into the runtime image, run transactionally, and serialized across replicas with a Postgres advisory lock.
- ✅ Production baseline snapshots and immutable audit events use PostgreSQL; no application data volume is required.
- ✅ Production client disables offline/local seed fallback unless `VITE_ALLOW_OFFLINE=true` is explicitly set.
- ✅ Browser credentials use Secure, HttpOnly, SameSite=Strict cookies; JWTs are no longer persisted in browser storage.
- ✅ Production SSO uses server-side OIDC Authorization Code + PKCE with signed state, nonce validation, discovery/token exchange, and secure callback sessions.
- ✅ Sessions are server-recorded and revocable; OIDC groups map to global/project roles and SCIM manages user provisioning, role changes, deactivation, and session revocation.
- ✅ Protected Prometheus request metrics are available when `METRICS_TOKEN` is configured.
- ✅ Manual WBS/CBS and ISO 19008 mapping supports reviewed per-row overrides, reuse across matching source rows, and automatic rollback to rule-based assignments.
- ✅ Enterprise schedule foundation: governed P6 CSV mapping/import, canonical activities and relationships, reusable mappings, control-account PV/EV, SPI/CPI, schedule S-curve, close gates, and reports.
- ✅ Native Primavera XER imports parse project/WBS/calendar/activity/relationship tables, preserve reviewed mappings across P6 refresh formats, and reject invalid batches atomically.
- ✅ Privacy-first document intelligence: malware scanning, encrypted PostgreSQL storage, local PDF/text/Tesseract/private-service OCR, optional Azure/AWS providers, page evidence, and governed forecast-driver approval.
- ✅ Unified forecast-driver ledger links changes, risks, opportunities, issues, claims, and documents while suppressing linked double counting.
- ✅ Deterministic and Monte Carlo models consume the same governed driver set; the probabilistic model no longer re-adds pending/risk exposure already present in its base.
- ✅ Dynamic Mapping Studio versions arbitrary company/Snowflake/CSV/OCR/API schemas, safe transformations and value lookups, previews canonical output, and detects schema drift.
- ✅ Snowflake cost adapter uses read-only OAuth/key-pair connectivity, dynamic profiles, incremental watermarks, deduplication, WBS reconciliation, approval separation, and governed posting to actuals/commitments/accruals.
- ✅ Configurable Planview Portfolios/ProjectPlace REST staging maps arbitrary governance schemas and posts approved milestones/actions/issues/decisions with deduplication and WBS controls.
- ✅ PostgreSQL asynchronous ingestion jobs provide idempotency, retries/backoff, expiring leases, and multi-replica `SKIP LOCKED` worker claims; production OCR uses the queue.
- ✅ Multi-replica controls use shared Redis API/login limits and PostgreSQL advisory leader election for scheduled exports; startup rejects replicas without Redis.
- ✅ Empty production databases create one explicit blank project; demo projects, benchmark metrics, extracted reports, and FX rates are development-only.
- ✅ The audit workspace verifies the server HMAC chain and labels the reducer history separately.
- ✅ WBS imports create structure/baseline only and reject invalid currency, parent, duplicate, and negative-budget data without fabricating financials.

## P2 — Medium/Low (addressed)

- ✅ Persisted client state schema-versioned + `QuotaExceededError` guard.
- ✅ Export/print path HTML-escaped (injection fix).
- ✅ Lower default JSON body limit (1 mb); `.env.example` completed (`AUDIT_HMAC_SECRET`, `CREDENTIALS_KEY`, `WEBHOOK_SECRET`, `JWT_ISSUER`, `DISABLE_RATE_LIMIT`, `SERVE_CLIENT`, `LOG_LEVEL`, `OIDC_CLIENT_SECRET`).
- ✅ Docs added: `DEPLOYMENT.md` (runbook), `SECURITY.md`, `CONTRIBUTING.md`, `scripts/backup.sh` (backup/DR).
- ✅ OIDC verification hardened to an explicit token-exchange endpoint.

## Deferred — recommended follow-ups

These are either operational (not code we can complete here) or larger initiatives:

- **ESLint/Prettier + coverage gates in CI.** Config and a baseline cleanup require adding devDependencies (a lockfile change) and fixing the existing lint backlog — do this as a dedicated pass, then flip the CI jobs to blocking.
- **Tracing and error tracking** (OpenTelemetry/Sentry). Structured logs, request correlation, health probes, and protected Prometheus metrics are in place.
- **DB normalization / event sourcing.** State is stored as a versioned JSONB blob today; splitting cost sheet/registers into relational tables is a Phase-2/3 effort.
- **Expanded test coverage** for the remaining routes/services and UI components; add a coverage tool + threshold.
- **Operational / compliance:** TLS termination + reverse proxy config for your environment, automated backup scheduling, third-party penetration test, SOC 2 control mapping, and (if needed) Kubernetes/horizontal-scale topology. `LICENSE` choice is left to the repository owner.
- **Feature truthfulness:** simulated connectors and illustrative intelligence are disabled by default and cannot report simulated SAP success in production. Keep feature flags off outside explicit demonstrations.
- **Enterprise source adapters:** P6 XER/live API, normalized high-volume schedule storage, SAP actuals/commitments, and Planview governance data remain the next integration increments.

## Verification

After this pass: client typecheck + production build pass; 97 client/domain tests pass; server bundle + typecheck pass; 106 server tests pass locally; and all 16 Playwright workflows pass. CI executes six PostgreSQL migration/concurrency/governance/document/queue/session tests and builds the production Docker image. The production dependency gate has no unacknowledged high/critical findings.
