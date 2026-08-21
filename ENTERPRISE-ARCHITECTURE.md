# Enterprise architecture roadmap

Maps product capabilities to implementation phases. The trust milestone established control-account aggregation and monthly close; this document defines the path to enterprise-grade governance.

## Capability matrix

| Capability | Today | Phase 1 (foundation) | Phase 2 (enterprise) | Phase 3 (scale) |
|---|---|---|---|---|
| **Configurable workflows** | Hard-coded forecast/change flows | `workflowConfig.ts` + `workflowEngine.ts` | Admin UI, delegation, SLAs | BPMN, multi-tenant templates |
| **Multi-project / portfolio** | 3-project compare, active sync | Portfolio API, roll-up policies | PMO dashboards, cross-project RBAC | Federated portfolios, JV structures |
| **Role-based permissions** | Demo `x-pc-role` header | `actionPolicy.ts` aligned to reducer | OIDC/JWT, project-scoped roles | SoD, attribute-based access |
| **Real database** | JSON file + localStorage fallback | Postgres schema + Docker | Read replicas, connection pooling | Sharding, event store |
| **Audit immutability** | Workflow history in state | Canonical HMAC chain | PostgreSQL `audit_events` with atomic state/audit commits | WORM storage, SIEM export |
| **Budget versioning** | Label + forecast revs | Baseline snapshots (immutable) | Sanction lock, revision compare | Full CPM baseline integration |
| **Integrations** | Reviewed P6 CSV/XER + governed Snowflake cost staging | Adapter registry + sync jobs API | Direct SAP/P6 OAuth and webhooks | iPaaS, message bus |
| **Integrated cost/schedule** | Cost control with rules-of-credit EVM | Canonical P6 activities/relationships, reviewed CSV/XER, control-account PV/EV | P6 API, schedule snapshots, SAP actuals | Streaming status updates, portfolio schedule analytics |
| **Document intelligence** | Private local text/PDF OCR + optional Azure/AWS | Encrypted source store, evidence, review and forecast-driver ledger | Layout/table models, provider policy, batch queues | Domain-trained extraction and model monitoring |
| **Dynamic source mapping** | User-defined CSV/company profiles | Versioned canonical mappings, safe transforms/lookups, drift detection | Snowflake schema introspection and governed cost staging | Cross-portfolio mapping library and stewardship workflow |
| **Validation / approval gates** | Domain rules in engines | Workflow engine + RBAC on actions | Configurable thresholds per portfolio | ML anomaly gates |
| **Report packs** | CSV templates + export centre | Server `exportService` bundles | PDF packs, scheduled distribution | Branded exec dashboards |
| **Security / deployment** | CI + smoke | Docker Compose, `.env.example` | TLS, rate limits, secrets vault | K8s, backup/DR runbooks |
| **Edge cases** | Core O&G scenarios in seed | Documented edge-case register | Per-domain regression suites | Production incident library |

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
- Hash chain per entry: `server/src/services/auditService.ts`
- API: `GET /api/projects/:id/audit` (never via reducer from client)

### Budget versioning

- Immutable snapshots: `server/data/baselines/{projectId}/`
- API: `GET/POST /api/projects/:id/baselines`

### Real database path

- Postgres schema: `server/src/db/migrations/002_core_schema.sql`
- Enable with `DATABASE_URL` (Docker Compose included)
- JSON store remains default for local dev without Postgres

### Integrations

- Adapter registry: `server/src/integrations/connectorRegistry.ts`
- Types: ERP, schedule (P6), contracts, procurement, document control
- Client connectors UI becomes config; execution moves server-side

### Integrated schedule-control foundation

- Canonical activities, relationships, import batches, and row-level issues: `src/data/schedule.ts`
- Reviewed P6 CSV column mapping and atomic validation: `src/utils/p6CsvImport.ts`
- Control-account PV/EV, SPI/CPI, finish variance, and completion curves: `src/engine/scheduleControl.ts`
- Governed schedule workspace, manual WBS correction, monthly-close signal, and report pack
- Current browser path is intentionally bounded; large schedules move to normalized Postgres tables and a streaming adapter in Phase 2

### Document-to-forecast intelligence

- Local extraction is default; scanned content can use a private OCR service or local Tesseract data
- Azure Document Intelligence and AWS Textract are explicit opt-in providers
- Malware scan, MIME signature validation, SHA-256 deduplication, and AES-256-GCM encrypted PostgreSQL storage
- All quantified findings enter as draft forecast drivers with page evidence
- Cost-control review and approver decision are separate RBAC actions; only approved drivers affect EAC
- Unified driver ledger excludes linked risk/issue/change/claim duplication

### Dynamic Mapping Studio

- Arbitrary source headers and company code values map to canonical project-controls fields without code changes
- Profiles are organization/dataset scoped, versioned, audited, previewable, and schema-fingerprint aware
- Safe operations only: direct/coalesce/concat/constants, transformations, and lookup maps—no arbitrary scripts
- Contractor CSV ingestion and the Snowflake cost adapter consume the same governed profile contract

### Snowflake cost reconciliation

- Read-only OAuth/key-pair Snowflake adapter with validated identifiers and bounded queries
- Arbitrary company schemas map through active `cost_transaction` profiles
- External line IDs deduplicate; optional watermarks support incremental reads
- Unmapped WBS and non-USD rows cannot be approved or posted
- Approver signs off staged batches before cost control posts actuals/invoices, commitments, or accruals

### Report packs

- Server bundles: `server/src/services/exportService.ts`
- API: `GET /api/projects/:id/exports/close-pack`

### Deployment

- `docker-compose.yml` — app + Postgres
- `.env.example` — required variables

## Phase 2 — Enterprise hardening

1. Normalize schedule activities, relationships, snapshots, and source mappings into Postgres tables
2. Add authenticated P6 API adapters with streaming/staged imports
3. Add SAP commitments/actuals reconciliation against the same control-account dictionary
4. Add Planview governance/milestone adapter and reusable source mapping profiles
5. Complete server-side OIDC Authorization Code + PKCE and enterprise session controls
6. Add portfolio governance policies, webhooks, APM, and external penetration testing

## Phase 3 — Production scale

1. Event sourcing for cost sheet mutations
2. Cross-portfolio consolidation currency
3. Backup automation (pg_dump schedule, audit archive)
4. Pen-test remediation, SOC2 controls mapping
5. Edge-case library from field deployments (accrual reversals, FX revals, JV splits, etc.)

## Edge-case register (initial)

Categories to cover before claiming “production ready”:

- **Cost**: parallel WBS detail vs control account, contingency double-draw, FX revaluation timing
- **Change**: budget vs forecast variance mechanism, partial approval, withdrawn COs
- **Forecast**: locked period override, forecast-only changes after budget freeze
- **Portfolio**: inactive benchmark drift, currency mix, JV non-operated share
- **Integration**: partial ERP load, schedule actuals lag, duplicate PO lines
- **Audit**: actor impersonation, retroactive correction (requires compensating entry, not delete)

See `src/data/edgeCaseRegister.ts` for tracked scenarios and test linkage.
