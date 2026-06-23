# Production-Readiness Audit — Project Controls Intelligence Platform

**Date:** June 2026 · **Commit audited:** `a72fafb` (master) · **Method:** static review of `src/`, `server/src/`, infra, CI, and docs (read-only). Evidence is cited as `file:line`.

---

## Verdict

The application is **not yet production-ready**. The domain logic is strong and the auth *core* is unusually well-built for a candidate app (real HMAC JWT verification, real OIDC JWKS verification, bcrypt, prod fail-fast on `JWT_SECRET`, helmet/CORS/rate-limit/error-masking). But shipping is blocked by a deployment artifact that does not run, several authorization holes (IDOR), an unauthenticated webhook, concurrency that silently loses data, and the near-total absence of observability. Feature-wise, parts of the product are simulated/seed data presented as real.

**Tally:** 5 Critical · 13 High · ~12 Medium · ~10 Low.

> Severity key — **Critical:** blocks launch or is directly exploitable / causes data loss. **High:** must fix before real users/data. **Medium:** fix soon after launch. **Low:** hygiene / hardening.

---

## Critical blockers (P0)

### C1 — The Docker image never compiles the server; the container crashes on start
`Dockerfile:11` runs only `npm run build`, which is the root script `tsc --noEmit && vite build` (`package.json:9`) — it builds the **client** and never runs `build:server`. The container starts with `node dist/index.js` (`server/package.json:7`), but `server/dist/` is gitignored (`.gitignore:3`) and never produced in the image. The `api` service fails with module-not-found.
**Fix:** add `RUN npm run build && npm run build:server` (or `npm run build --prefix server`) before `CMD`; use a multi-stage build so only the compiled output ships.

### C2 — Broken authorization coverage → IDOR (read/export any project)
`attachProjectRole` is registered only on `projectsRouter` (`server/src/routes/projects.ts:29`), but several routers are mounted separately on the same `:projectId` path and never run it:
- **Compute routes** `/compute/forecast` and `/compute/evm` (`projects.ts:82,93`; mounted `app.ts:57`) have no `requireRole` and no membership check — any authenticated user reads EVM/forecast for **any** project id.
- **`enterpriseRouter`** (audit, baselines, exports) and **platform `:projectId` routes** (`app.ts:58`) enforce only the *global* role; per-project membership (`ENFORCE_PROJECT_MEMBERSHIP`) is silently skipped.
**Fix:** apply `attachProjectRole` + `requireRole(...)` to the compute, enterprise, and platform `:projectId` routers.

### C3 — Unauthenticated, unsigned webhook endpoint
`POST /api/platform/webhooks/:connectorId` (`server/src/routes/platform.ts:135`; handler `connectorRegistry.ts:189`) has no `requireRole` and no HMAC/signature verification. It accepts and persists arbitrary payloads and drives the SAP partial-load path.
**Fix:** verify a per-connector signing secret (HMAC over the raw body) before processing; reject otherwise.

### C4 — Optimistic concurrency is not atomic → silent lost updates
Both stores do read-version → check → reduce → write as **separate, non-transactional** steps (`server/src/db/postgresProjectStore.ts:206-237`; `jsonProjectStore.ts:144-175`). Two concurrent requests can both read v5, both pass the `If-Match` check, and both write v6 — last write wins, no 409, data lost. The `If-Match` check gives false confidence.
**Fix (Postgres):** wrap in a transaction with a conditional `UPDATE ... WHERE project_id=$ AND version=$expected`; if `rowCount=0`, return 409. **Fix (JSON):** serialize writes with a mutex + atomic temp-file rename + fsync.

### C5 — Client authorization is driven by editable `localStorage`
`src/hooks/useProjectRole.ts:10-29` derives `canEdit`/`canApprove`/`isAdmin` from `localStorage['pc-role']`. Any user can set `pc-role = 'admin'` in devtools to unlock edit/approve/lock-period controls (e.g. `EditableGrid.tsx:121,467`). This is only safe if the server independently authorizes every action — which, per C2, it currently does not on all routes.
**Fix:** derive role from the verified JWT / `currentUser.role`; never trust a writable key. Pair with C2.

---

## High-severity gaps (P1)

### Security & data integrity
- **Forgeable, racy, non-durable audit log.** The "immutable" chain uses plain SHA-256 with no secret (`server/src/services/auditService.ts:36`), so anyone with write access can edit an entry and recompute the whole chain. Appends are unlocked (`:66-84`) so concurrent writes interleave and break `prevHash`/`seq`. The Postgres `audit_events` table exists but is **never written** (`database.ts:23`). **Fix:** HMAC the chain with a server-held key; serialize/lock appends; persist to the DB (append-only).
- **JSON file store is the silent production fallback.** Postgres is opt-in via `DATABASE_URL` (`database.ts:63`); without it, prod runs a single-file store with non-atomic `writeFileSync` (`jsonProjectStore.ts:78`) — a crash mid-write truncates the entire database, and there's no locking/fsync/backup. **Fix:** fail fast in prod if `DATABASE_URL` is unset; make JSON writes atomic for dev.
- **Action payloads are effectively unvalidated past the envelope.** Most action schemas use `z.record(...)`/`.passthrough()` (`server/src/validation/schemas.ts:18-57`), so arbitrary fields/types/ranges land in the stored blob. Several mutating routes accept raw `req.body` with no schema: `POST /filters` (`platform.ts:30`), `/workflows/delegations` (`:68`), `/integrations/oauth/:connectorId` (`:113`), `/integrations/sync` (`:119`), `/baselines` (`enterprise.ts:53`). **Fix:** add bounded zod schemas, especially for financial actions.

### Frontend correctness
- **No React error boundary anywhere** (`src/main.tsx:8`). One render-time throw white-screens the whole app with no recovery. **Fix:** top-level (and ideally per-route) `ErrorBoundary` with a reset-state fallback.
- **409 conflicts silently discard the user's edit.** `src/api/client.ts:131` throws a 409 with `version`, but `src/store/projectStore.tsx:189-210` ignores that branch, shows a generic "Sync failed", and refetches server state — overwriting uncommitted work with no conflict UX. **Fix:** detect 409, show a conflict/rebase prompt.
- **No token expiry/refresh handling.** `expiresIn` is stored but never used (`client.ts:22`); expiry surfaces only reactively as a 401 on the next action. No refresh flow. **Fix:** schedule a proactive refresh/expiry check.

### Feature completeness (simulated data presented as real)
- **The entire "Intelligence" suite renders static mock data** as if extracted from P&IDs/models with confidence scores (`src/views/intelligence.tsx`; data in `src/data/intelligence.ts:94-206`).
- **Connectors/integrations are fully simulated** — `testConnectorConnection`/`runConnectorSync` fabricate results (`src/integrations/connectors.ts:111-184`); SAP/Aconex/SharePoint/Snowflake do nothing real.
- **Ingestion** is a browser-only CSV demo with a "Simulate document" button (`App.tsx:312`), self-described as future work (`App.tsx:855`).
**Fix:** gate these behind a clear "sample data / demo" banner or hide them in production until wired to real sources.

### Infra / ops
- **No observability.** All logging is raw `console.*` (`app.ts:68`, `index.ts:40`); no structured/request logging, no log levels, no correlation propagation, no metrics, no tracing, no error tracking (Sentry). **Fix:** add pino/winston request logging + an error-tracking SDK; expose `/metrics`.
- **`/api/health` doesn't check the DB** — it reports whether Postgres is *configured*, not reachable (`app.ts:49`); a dead DB still returns `ok:true`. No liveness/readiness split. **Fix:** add a readiness probe that pings the pool.
- **Graceful shutdown drops in-flight requests.** `server/src/index.ts:44-49` calls `server.close()` without awaiting, then `process.exit(0)` immediately. **Fix:** `server.close(async () => { await closePool(); process.exit(0) })` with a forced-exit timeout.
- **In-memory rate-limit store** (`app.ts:38`, `routes/auth.ts:35`) — limits reset per instance and don't hold across replicas. **Fix:** shared store (Redis) for multi-instance.
- **CI is missing security/lint/coverage/deploy stages** (`.github/workflows/ci.yml`): no ESLint, no `npm audit`/CodeQL/Dependabot, no coverage gate, no Docker build, no deploy pipeline. **Fix:** add these jobs.
- **No linting/formatting and no code splitting (client).** No ESLint/Prettier config or `lint` script anywhere; every view is statically imported (`App.tsx:21-77`) into one ~600 kB chunk. **Fix:** add ESLint+Prettier; `React.lazy`/`Suspense` per route and `manualChunks` in `vite.config.ts`.
- **Test coverage gaps; plaintext secrets; exposed Postgres.** 3 of 4 server routers and 7 of 9 services have no tests; 0 component/UI tests; no coverage tool configured. `docker-compose.yml:5-7` ships `pc/pc` DB creds in plaintext and publishes `5432:5432`. **Fix:** add route/service/UI tests + coverage thresholds; move creds to env/secrets and drop the public port mapping.

---

## Medium-severity items (P2)

- **Persisted client state has no schema version/migration** (`src/store/persistence.ts`); shape changes silently merge stale data. `localStorage.setItem` is unguarded against `QuotaExceededError`.
- **Unescaped interpolation in the print/export path** — `state.meta.name`/period written into raw HTML via `document.write` (`src/views/exports.tsx:82-104`); escape or build via `textContent`.
- **State stored as an opaque JSONB blob** (`migrations/002_core_schema.sql:26`) — no referential integrity, whole-document rewrite per action; normalization is the next enterprise step.
- **Two migration systems both run at boot**; SQL migrations apply non-transactionally (`server/src/db/postgres.ts:55`) — a partial failure leaves the schema half-applied. Wrap each in a transaction.
- **No account lockout** (only IP rate limiting on `/login`); **no session revocation/refresh** (stateless 1h tokens, no denylist).
- **OAuth connector tokens stored in plaintext** (`migrations/003:52`); encrypt at rest.
- **`scheduleCron` is accepted but ignored** — the scheduler is a fixed hourly interval (`index.ts:36`); custom schedules never fire.
- **No backup/DR**, **no reverse proxy/TLS guidance**, **no restart policies**, and the `web` compose service uses Vite's dev `preview` server with a `localhost` API base (`docker-compose.yml`) — won't work off-localhost.
- **`.env.example` minor gaps** — `JWT_ISSUER`, `DISABLE_RATE_LIMIT`, `OIDC_CLIENT_SECRET` are read/referenced but not listed.
- **Accessibility:** command palette lacks focus trap/restoration (`CommandPalette.tsx:101`); topbar "More" menu lacks arrow-key/Esc nav (`App.tsx:438`); MobileNav lacks `aria-current`; some controls rely on color/glyphs alone.
- **Per-view loading/empty/error states** are thin — backend-dependent views render blank tables while loading/failing (`workflowAdmin.tsx:25`).

---

## Low-severity / hygiene

- Number parsing coerces invalid input to `0` silently (`EditableGrid.tsx:29`, `wbsImport.ts:36`); WBS import fabricates financials (`wbsImport.ts:124`).
- `downloadClosePackPdf` throws a bare `Error` (not `ApiError`), so a 401 there won't trigger re-login (`client.ts:159`).
- OIDC is token-exchange only — no Authorization Code/PKCE handshake (`oidc.ts:44`); weak password policy (8-char min, `schemas.ts:175`).
- Postgres pool unconfigured (default sizing, `postgres.ts:14`); `JSON_LIMIT` defaults to 10 MB (`app.ts:34`); `console.error` logs full error objects (potential payload/token leakage).
- `if-match` header parsed with `Number()` → `NaN` treated as "no check" (`projects.ts:58`).
- npm audit clean except 1 low (esbuild dev-server, dev-only). Dependencies use caret ranges; consider pinning for reproducible images.
- **Missing docs:** deployment/operations runbook, OpenAPI/API reference, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`.

---

## What's already solid

JWT signing/verification with mandatory ≥16-char `JWT_SECRET` in prod (`jwt.ts:18`); DEMO_AUTH hard-blocked in prod (`rbac.ts:22`, `index.ts:16`); helmet, deny-by-default CORS allowlist, login + baseline rate limiting, `x-powered-by` disabled, prod error masking with correlation id (`app.ts`); real OIDC JWKS verification; bcrypt with configurable rounds; idempotent bootstrap admin; a real (opt-in) Postgres path with SQL migrations; a well-tested domain engine (60 unit tests) and passing e2e smoke suite; an honest architecture doc that already flags much of this as roadmap.

---

## Suggested remediation order

1. **P0 — make it deployable and safe:** fix the Docker server build (C1); close the authz/IDOR gaps and the webhook (C2, C3, C5); make concurrency atomic (C4).
2. **P1 — make it operable and trustworthy:** observability (logging/metrics/error tracking) + real DB health check; graceful shutdown; HMAC + DB-backed audit; fail-fast on missing `DATABASE_URL`; tighten validation; error boundary + 409 UX + token refresh on the client; CI lint/audit/coverage/docker; gate or remove simulated features.
3. **P2 — harden:** secrets management, backups/DR, TLS/reverse proxy, schema-versioned persistence, normalized DB model, accessibility, expanded tests + coverage gate, operational docs.
