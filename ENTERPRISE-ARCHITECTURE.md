# Enterprise architecture roadmap

Maps product capabilities to implementation phases. The trust milestone established control-account aggregation and monthly close; this document defines the path to enterprise-grade governance.

## Capability matrix

“Today” is what the repo actually does (verified against `server/src` / `src/`). Phase 2/3 remain roadmap except where noted as shipped.

| Capability | Today (shipped) | Still open |
|---|---|---|
| **Configurable workflows** | `src/data/workflowConfig.ts` + `server/src/services/workflowEngine.ts` gate forecast/change transitions; `GET /api/platform/workflows`; admin UI at `/admin/workflows`; delegations API | SLA clocks, BPMN, DB-loaded templates, multi-tenant |
| **Multi-project / portfolio** | Seeded 3-project compare, active-project sync, `GET /api/platform/portfolio/governance` | True portfolio API, roll-up policies, federated / JV |
| **Role-based permissions** | JWT sessions, `actionPolicy.ts`, per-project membership (`ENFORCE_PROJECT_MEMBERSHIP`), OIDC **token exchange**. Demo `x-pc-role` only when `DEMO_AUTH` is on | SoD, ABAC, Authorization-Code+PKCE |
| **Real database** | Postgres when `DATABASE_URL` is set (required in production). JSON file store is **dev-only**. State is a versioned JSONB blob | Relational split of cost sheet/registers, replicas |
| **Audit immutability** | Append-only JSONL + SHA-256 `prevHash` chain; corrupt trailing lines skipped. In-state array still exists for the UI | HMAC keying (`AUDIT_HMAC_SECRET` is unused), write to Postgres `audit_events`, serialized lock across processes |
| **Budget versioning** | Filesystem snapshots `GET/POST /api/projects/:id/baselines`, admin lock | Sanction compare UI, CPM baseline integration |
| **Integrations** | Adapter registry, sync jobs API, HMAC webhooks. Connectors are **simulated** (no live SAP/P6 OAuth) | Real adapters, iPaaS |
| **Validation / approval gates** | Zod on mutating routes; workflow engine + RBAC on actions | Configurable portfolio thresholds, ML gates |
| **Report packs** | Server JSON close pack + **PDF** (`/exports/close-pack.pdf`); hourly scheduler (cron string stored, not parsed) | Branded packs, real cron, scheduled email |
| **Security / deployment** | Compose + multi-stage Docker, Helmet/CORS/rate-limit, fail-fast prod env, `DEPLOYMENT.md` / backup script | Shared rate-limit store, metrics/tracing, K8s |
| **Edge cases** | `src/data/edgeCaseRegister.ts`; accrual ancestor double-count fixed | Field incident library |

## Phase 1 — Foundation (implemented in this repo)

### Configurable enterprise workflows

- Shared definitions: `src/data/workflowConfig.ts`
- Server validation: `server/src/services/workflowEngine.ts`
- Workflows: forecast approval, change board, monthly close gates

### Role-based permissions

- Single policy map: `server/src/auth/actionPolicy.ts`
- Blocks client-only actions (`ADD_AUDIT`, `HYDRATE`, `RESET` via actions)
- Route guards on mutating endpoints

### Immutable audit

- Append-only store: `server/data/audit/{projectId}.jsonl`
- SHA-256 hash chain per entry: `server/src/services/auditService.ts` (HMAC keying is **not** wired; `AUDIT_HMAC_SECRET` is unused)
- API: `GET /api/projects/:id/audit` (never via reducer from client)
- Trailing corrupt JSONL lines are skipped so a partial write cannot 500 a successful action

### Budget versioning

- Immutable snapshots: `server/data/baselines/{projectId}/`
- API: `GET/POST /api/projects/:id/baselines`

### Real database path

- Postgres schema: `server/src/db/migrations/*.sql` (runs at startup when `DATABASE_URL` is set)
- Store: `server/src/db/postgresProjectStore.ts` — versioned JSONB blob + transactional `If-Match`
- JSON store (`projects.json`) remains the default for local dev **without** Postgres and is refused in production

### Integrations

- Adapter registry: `server/src/integrations/connectorRegistry.ts`
- Types: ERP, schedule (P6), contracts, procurement, document control
- Client connectors UI becomes config; execution moves server-side

### Report packs

- Server bundles: `server/src/services/exportService.ts`
- API: `GET /api/projects/:id/exports/close-pack` (JSON) and `.../close-pack.pdf` (PDFKit)
- Scheduler: `exportScheduler.ts` — hourly tick; `scheduleCron` is stored but not parsed

### Deployment

- `docker-compose.yml` — app + Postgres
- `.env.example` — required variables

## Phase 2 — Enterprise hardening

Shipped in-repo (do not re-build):

1. Postgres store when `DATABASE_URL` is set (`postgresProjectStore.ts`)
2. OIDC ID-token → session exchange (`server/src/auth/oidc.ts`, `POST /api/platform/auth/oidc`)
3. PDF close packs (`pdfExport.ts`, pdfkit)
4. Inbound HMAC webhooks (`webhookAuth.ts`)
5. Atomic optimistic concurrency (409 on `If-Match` mismatch)

Still open:

1. Dual-write / cutover tooling from JSON files for existing deploys
2. Full OIDC Authorization-Code + PKCE (current flow verifies a client-supplied ID token)
3. Portfolio governance policies (approval thresholds, delegation SLAs)
4. Outbound webhook delivery for approved forecast/change events
5. HMAC-keyed audit chain + persist `audit_events` in Postgres
6. Parse `scheduleCron` instead of the fixed hourly / next-month runner

## Phase 3 — Production scale

1. Event sourcing / normalized cost-sheet tables (state is still one JSONB blob)
2. Cross-portfolio consolidation currency
3. Automated backup **scheduling** (script exists: `scripts/backup.sh`; ops must cron it)
4. Pen-test remediation, SOC2 controls mapping
5. Shared rate-limit store (Redis) + metrics/tracing
6. Edge-case library from field deployments (accrual reversals, FX revals, JV splits, etc.)

## Edge-case register (initial)

Categories to cover before claiming “production ready”:

- **Cost**: parallel WBS detail vs control account, contingency double-draw, FX revaluation timing
- **Change**: budget vs forecast variance mechanism, partial approval, withdrawn COs
- **Forecast**: locked period override, forecast-only changes after budget freeze
- **Portfolio**: inactive benchmark drift, currency mix, JV non-operated share
- **Integration**: partial ERP load, schedule actuals lag, duplicate PO lines
- **Audit**: actor impersonation, retroactive correction (requires compensating entry, not delete)

See `src/data/edgeCaseRegister.ts` for tracked scenarios and test linkage.
