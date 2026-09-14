# Enterprise architecture

Maps product capabilities to what this repo actually ships versus what is still roadmap. The trust milestone established control-account aggregation and monthly close; later passes added a real API, JWT/OIDC sessions, Postgres, and workflow gates.

## Capability matrix

| Capability | Shipped in this repo | Still open |
|---|---|---|
| **Configurable workflows** | `src/data/workflowConfig.ts` + server gates for forecast/change (`workflowEngine.ts`); admin UI + delegation API | SLA timers, BPMN, multi-tenant templates. Monthly-close statuses are published but not asserted server-side the way forecast/change are. |
| **Multi-project / portfolio** | Project list, activate, membership-filtered reads; `/api/platform/portfolio/governance` roll-up of the **active** project; 3-project compare UI | Cross-project consolidation, federated / JV structures. Governance currently rolls up the active project, not a full portfolio set. |
| **Role-based permissions** | JWT sessions, `actionPolicy.ts`, per-project roles, `ENFORCE_PROJECT_MEMBERSHIP` (default on in production) | SoD / ABAC. Demo `x-pc-role` remains a **non-prod** convenience. |
| **Database** | JSON file (dev) or Postgres JSONB blob when `DATABASE_URL` is set; SQL migrations at boot | Split cost sheet / registers into relational tables; event store. |
| **Audit** | Append-only JSONL + SHA-256 hash chain under `server/data/audit` | HMAC-keyed chain, serialized multi-writer lock, Postgres `audit_events` writes (table may exist; the live writer is still the JSONL file). |
| **Budget versioning** | Filesystem baseline snapshots; create / lock APIs | Sanction compare UI, full CPM baseline integration. |
| **Integrations** | Adapter registry, inbound HMAC webhooks, OAuth tokens encrypted at rest | Live SAP/P6 OAuth; outbound webhooks on approve; iPaaS. Sync jobs are simulated. |
| **Validation / approval gates** | Zod envelopes, domain `actionValidation`, forecast/change workflow transitions | Configurable thresholds per portfolio; ML anomaly gates. UI monthly-close gates are sequential and data-derived (`monthlyCloseProgress.ts`). |
| **Report packs** | Server JSON close pack + PDF (`pdfExport.ts`); hourly poll of due export jobs | True cron (`scheduleCron` is stored, not executed); branded exec dashboards. |
| **Security / deployment** | Docker Compose, fail-fast prod env, Helmet/CORS/rate-limit, backup script | Shared-store rate limiting, K8s, third-party pen-test / SOC 2. Compose does not yet inject `CREDENTIALS_KEY` / `TRUST_PROXY`. |
| **Observability** | `errorId` on 500/route errors; unused `logger.ts` helper (`LOG_LEVEL`) | Request logging, `x-request-id`, metrics, tracing, error tracking. |
| **Edge cases** | `src/data/edgeCaseRegister.ts` + several covered cost/change tests | Remaining open rows (contingency double-draw, FX reval timing, etc.). |

## What is implemented

### Configurable enterprise workflows

- Shared definitions: `src/data/workflowConfig.ts`
- Server validation (forecast + change): `server/src/services/workflowEngine.ts`
- UI progress for monthly close: `src/engine/monthlyCloseProgress.ts` (`/close`) — sequential, data-derived gates (see `API.md`)
- Delegation CRUD: `GET/POST /api/platform/workflows/delegations`

### Role-based permissions

- Single policy map: `server/src/auth/actionPolicy.ts`
- Blocks client-only actions (`ADD_AUDIT`, `HYDRATE`, `RESET` via `/actions`)
- Route guards + project membership on mutating and `:projectId` reads
- Password login, optional OIDC **ID-token exchange** (`POST /api/platform/auth/oidc`)

### Audit and baselines

- Append-only store: `server/data/audit/{projectId}.jsonl`
- Hash chain: `server/src/services/auditService.ts` (SHA-256; see `SECURITY.md`)
- API: `GET /api/projects/:id/audit` (never via reducer from the client)
- Immutable snapshots: `server/data/baselines/{projectId}/` — `GET/POST /api/projects/:id/baselines`

### Persistence

- Postgres when `DATABASE_URL` is set (`server/src/db/postgresProjectStore.ts`)
- JSON store remains the default for local dev without Postgres
- Production refuses to boot without `DATABASE_URL`
- Optimistic concurrency: `If-Match` + transactional version check (Postgres) / atomic file replace (JSON)

### Integrations and reports

- Adapter registry: `server/src/integrations/connectorRegistry.ts`
- Inbound webhooks: HMAC `x-webhook-signature` (`webhookAuth.ts`)
- Close pack JSON + PDF: `GET .../exports/close-pack` and `.../close-pack.pdf`
- Scheduled jobs: hourly due-job poll; next run is first-of-month 06:00 UTC (not the stored cron)

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

## Edge-case register (initial)

Categories to cover before claiming “production ready”:

- **Cost**: parallel WBS detail vs control account, contingency double-draw, FX revaluation timing, ancestor vs descendant accrual roll-up
- **Change**: budget vs forecast variance mechanism, partial approval, withdrawn COs
- **Forecast**: locked period override, forecast-only changes after budget freeze
- **Portfolio**: inactive benchmark drift, currency mix, JV non-operated share
- **Integration**: partial ERP load, schedule actuals lag, duplicate PO lines
- **Audit**: actor impersonation, retroactive correction (requires compensating entry, not delete)

See `src/data/edgeCaseRegister.ts` for tracked scenarios and test linkage. Public HTTP details: `API.md`.
