# Enterprise architecture

Maps product capabilities to what this repo actually ships versus what is still roadmap. The trust milestone established control-account aggregation and monthly close; later passes added a real API, JWT/OIDC sessions, Postgres, and workflow gates.

## Capability matrix

| Capability | Shipped in this repo | Still open |
|---|---|---|
| **Configurable workflows** | `src/data/workflowConfig.ts` + server gates for forecast/change (`workflowEngine.ts`); admin UI + delegation **storage** API | SLA timers, BPMN, multi-tenant templates. Delegations are persisted but never consulted by `workflowEngine`. Monthly-close and baseline-sanction statuses are published but not asserted server-side. |
| **Multi-project / portfolio** | Project list, activate, membership-filtered reads; `/api/platform/portfolio/governance` roll-up of the **active** project; 3-project compare UI | Cross-project consolidation, federated / JV structures. Governance currently rolls up the active project, not a full portfolio set. |
| **Role-based permissions** | JWT sessions, `actionPolicy.ts`, per-project roles, `ENFORCE_PROJECT_MEMBERSHIP` (default on in production) | SoD / ABAC. Demo `x-pc-role` remains a **non-prod** convenience. |
| **Database** | JSON file (dev) or Postgres JSONB blob when `DATABASE_URL` is set; SQL migrations at boot. JSON `runMigrations()` still runs on Postgres boots | Split cost sheet / registers into relational tables; event store. JSON-store writer mutex. Writable `/app/data` volume in Compose. |
| **Audit** | Append-only JSONL + SHA-256 hash chain under `server/data/audit` (`tsx`) or repo-root `data/audit` (bundle) | HMAC-keyed chain, serialized multi-writer lock, writes into the Postgres `audit_events` table (`002_core_schema.sql` creates it; `auditService.ts` never uses it). |
| **Budget versioning** | Filesystem baseline snapshots; create / lock APIs. `POST /baselines` writes `status: 'sanctioned'` immediately | Sanction compare UI, full CPM baseline integration. `baseline-sanction` workflow id is not asserted. Postgres `baseline_snapshots` is likewise unused by `baselineService.ts`. |
| **Integrations** | Adapter registry, inbound HMAC webhooks, OAuth tokens encrypted at rest | Live SAP/P6 OAuth; outbound webhooks on approve; iPaaS. Sync jobs are simulated. `GET .../adapters` always `configured: false`. `sap-s4` sync uses sample rows even when unconfigured. |
| **Validation / approval gates** | Zod envelopes, domain `actionValidation`, forecast/change workflow transitions | Configurable thresholds per portfolio; ML anomaly gates. UI monthly-close gates are sequential and data-derived (`monthlyCloseProgress.ts`). Most `/actions` payloads `.passthrough()`. |
| **Report packs** | Server JSON close pack + PDF (`pdfExport.ts`); hourly poll of due export jobs | True cron (`scheduleCron` is stored, not executed); `packType` ignored (always PDF); branded exec dashboards. |
| **Security / deployment** | Docker Compose, fail-fast prod env (`DATABASE_URL`, `JWT_SECRET`, demo/rate-limit/USERS_PATH — not HMAC/credentials/webhook secrets), Helmet/CORS/rate-limit, backup script | Shared-store rate limiting, K8s, third-party pen-test / SOC 2. Compose does not inject `CREDENTIALS_KEY` / `TRUST_PROXY` and has **no `/app/data` volume**. The image does not COPY SQL migrations into `server/dist/migrations`. |
| **Observability** | `errorId` on 500/route errors; unused `logger.ts` helper (`LOG_LEVEL`) | Request logging, `x-request-id`, metrics, tracing, error tracking. |
| **Edge cases** | `src/data/edgeCaseRegister.ts` + several covered cost/change tests | Remaining open rows (contingency double-draw, FX reval timing, etc.). |

## What is implemented

### Configurable enterprise workflows

- Shared definitions: `src/data/workflowConfig.ts`
- Server validation (forecast + change): `server/src/services/workflowEngine.ts`
- UI progress for monthly close: `src/engine/monthlyCloseProgress.ts` (`/close`) — sequential, data-derived gates (see `API.md`)
- Delegation **storage**: `GET/POST /api/platform/workflows/delegations` — list is unfiltered (`LIMIT 50` on Postgres). The engine does not apply these rows when checking transitions.

### Role-based permissions

- Single policy map: `server/src/auth/actionPolicy.ts`
- Blocks client-only actions (`ADD_AUDIT`, `HYDRATE`, `RESET` via `/actions`)
- Route guards + project membership on mutating and `:projectId` reads
- Password login, optional OIDC **ID-token exchange** (`POST /api/platform/auth/oidc`)

### Audit and baselines

- Append-only store: `server/data/audit/{projectId}.jsonl` under `tsx`; repo-root `data/audit/` from the production bundle
- Hash chain: `server/src/services/auditService.ts` (SHA-256; see `SECURITY.md`)
- API: `GET /api/projects/:id/audit` (never via reducer from the client)
- Immutable snapshots: `server/data/baselines/{projectId}/` under `tsx`; repo-root `data/baselines/` from the bundle — `GET/POST /api/projects/:id/baselines`

### Persistence

- Postgres when `DATABASE_URL` is set (`server/src/db/postgresProjectStore.ts`)
- JSON store remains the default for local dev without Postgres
- Production refuses to boot without `DATABASE_URL`
- Optimistic concurrency: `If-Match` + transactional `FOR UPDATE` (Postgres). JSON store: atomic file replace, **no writer mutex**, **in-memory cache** of `projects.json`.
- Session role/disabled flags for local+OIDC users come from the user store on every request (JWT `sub` only).

### Integrations and reports

- Adapter registry: `server/src/integrations/connectorRegistry.ts`
- Inbound webhooks: HMAC `x-webhook-signature` (`webhookAuth.ts`)
- Close pack JSON + PDF: `GET .../exports/close-pack` and `.../close-pack.pdf`
- Scheduled jobs: hourly due-job poll; next run is first-of-month 06:00 **local** (not the stored cron); runner always PDF

### Deployment

- `docker-compose.yml` — app + Postgres (Postgres not published to the host)
- `.env.example` — required and optional variables
- `DEPLOYMENT.md` — runbook including restore; `scripts/backup.sh` — pg_dump + audit/baseline archive

## Remaining (do not treat as shipped)

1. Full OIDC Authorization-Code + PKCE (current flow verifies a client-supplied ID token).
2. HMAC + DB-backed audit; request-scoped structured logs.
3. Relational normalization / event sourcing of the project blob.
4. Live ERP/P6 connectors and outbound event webhooks.
5. Shared rate-limit store for multi-replica deploys; Redis (or similar).
6. Execute `scheduleCron` as real cron rather than a fixed monthly next-run.
7. Copy (or embed) `server/src/db/migrations/*.sql` so the bundled image can apply them; mount a writable `/app/data` (JSON bootstrap + audit/baselines) and align `scripts/backup.sh` `DATA_DIR` with bundled `../../data` from `server/dist`.
8. Read `JWT_ISSUER` / `SESSION_TTL_SEC` / `DATABASE_PATH` / `USERS_PATH` / `BCRYPT_ROUNDS` at call time (today they miss `.env` because ESM imports run before `loadRootEnvFile()`).
9. Honour stored workflow delegations in `workflowEngine`; wrap each SQL migration in a transaction; mutex audit JSONL appends **and** JSON-store `applyAction`.
10. Mutex or drop the JSON-store last-wins race; stop running JSON `runMigrations()` on Postgres boots; honour `packType` / real cron; wire `audit_events` / `baseline_snapshots` instead of the filesystem writers.

## Edge-case register (initial)

Categories to cover before claiming “production ready”:

- **Cost**: parallel WBS detail vs control account, contingency double-draw, FX revaluation timing, ancestor vs descendant accrual roll-up
- **Change**: budget vs forecast variance mechanism, partial approval, withdrawn COs
- **Forecast**: locked period override, forecast-only changes after budget freeze
- **Portfolio**: inactive benchmark drift, currency mix, JV non-operated share
- **Integration**: partial ERP load, schedule actuals lag, duplicate PO lines
- **Audit**: actor impersonation, retroactive correction (requires compensating entry, not delete)

See `src/data/edgeCaseRegister.ts` for tracked scenarios and test linkage. Public HTTP details: `API.md`.
