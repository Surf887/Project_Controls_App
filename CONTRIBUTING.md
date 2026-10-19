# Contributing

## Local setup

```bash
npm install
npm install --prefix server
cp .env.example .env        # Vite reads repo-root .env (VITE_*)
# Optional: also copy to server/.env — tsx (npm run dev:server) loads that path
npm run dev                 # client (5173) + API (3001)
```

For a quick frontend-only/demo run, set `VITE_DEMO_AUTH=true` (and `DEMO_AUTH=true` if you want to be explicit). The API enables demo auth automatically when `NODE_ENV=development` and `DEMO_AUTH` is unset; it is always off in production.

The server file loader (`server/src/config/loadEnv.ts`) will not override variables already in the environment. Path depends on how the process is started:

- `tsx` on source (`npm run dev:server`) → `server/.env`
- Bundled `node server/dist/index.js` → repo-root `.env`

If tooling injects `PORT`, set `API_PORT=3001` so the **API** stays on 3001. Vite (`vite.config.ts`) also reads `PORT` (default 5173) and `dev:client` binds `127.0.0.1` only — `API_PORT` does not pin the client. Playwright’s `baseURL` is `http://127.0.0.1:5173`.

## Checks before opening a PR

Run these and keep them green:

```bash
npm run build                       # client typecheck (tsc) + vite build
npm test                            # client/engine unit tests (vitest)
npm run build --prefix server       # server bundle + typecheck
DEMO_AUTH=true npm test --prefix server   # server unit/route tests
DEMO_AUTH=true npm run test:e2e     # Playwright (needs demo auth to pass login)
```

CI (`.github/workflows/ci.yml`) runs the same client, server, and e2e jobs, plus a dependency audit (`continue-on-error`) and a production Docker build. All blocking jobs must pass.

## Conventions

- TypeScript throughout; prefer small, focused modules and pure functions in `src/engine/*` (unit-tested).
- All server state mutations go through dispatched `ProjectAction`s validated server-side; never bypass the reducer.
- Add or update tests with behavior changes. New API routes need at least one route test; new engine logic needs unit tests.
- Don't commit secrets or runtime data (`.env`, `server/data/*` are gitignored).
- Public HTTP contracts live in `API.md`. If you add a route or action type, update that file (including the RBAC table) and add a route test.

## Common pitfalls

- **Both demo flags matter, and Vite DEV is a third switch.** `VITE_DEMO_AUTH` is baked in at Vite compile time. Restart `npm run dev:client` after changing it. `import.meta.env.DEV` also shows demo chrome, but `x-pc-role` is attached only when `VITE_DEMO_AUTH === 'true'`. Server demo auth is `DEMO_AUTH` / `NODE_ENV` (see `server/src/auth/rbac.ts`). When server demo auth is on, a missing Bearer token is still the **cost_controller** demo user; the SPA auto-calls `/auth/token` using `localStorage['pc-role']`. The top-bar switcher remints `/token`.
- **Empty user store.** Password login needs a user. Either set `ADMIN_EMAIL` + `ADMIN_PASSWORD` before first boot, or use demo auth.
- **`.env` path split.** Repo-root `.env` is what Vite and the production bundle read. `tsx` in development reads `server/.env`. Existing process env always wins.
- **Import-time env vars.** `JWT_ISSUER`, `SESSION_TTL_SEC`, `DATABASE_PATH`, `USERS_PATH`, and `BCRYPT_ROUNDS` are read when their modules are first imported, which is **before** `loadRootEnvFile()`. A value that exists only in `.env` is ignored; export or inject them. `JWT_SECRET`, `DATABASE_URL`, and OIDC flags are read at call time and do pick up the file.
- **`If-Match` / 409.** All `/actions` writes compare versions **when the header is present**. Omitting it skips that check. Postgres still serializes writers (`FOR UPDATE`); the JSON store has **no mutex** (atomic rename only). Non-numeric headers become `NaN` and 409. The UI reloads on conflict rather than merging.
- **Action Zod is the envelope.** `SET_COST_SHEET` and most registers `.passthrough()` extra fields. Do not assume the API bounds amounts. Submit/approve/reject forecast and change payloads are the strict ones.
- **Membership in production-like runs.** `ENFORCE_PROJECT_MEMBERSHIP` defaults on when `NODE_ENV=production`. A non-admin with no project role gets 403 on `:projectId` routes **and** an empty `GET /api/projects`. A project role **replaces** the global role (`effectiveRole`); it does not take the higher of the two.
- **User store beats the JWT.** For persisted users, `attachUser` uses `findUserById` (`role`, `disabled`). JWT `role`/`name` claims are ignored. `setUserDisabled` / `setUserRole` have **no HTTP route**. Disabled password login is generic 401; OIDC is 403; an already-issued Bearer becomes unauthenticated.
- **JSON store cache.** `JsonProjectStore` reads `projects.json` once into memory. Hand-editing the file while `tsx` is running is ignored until restart. Concurrent `applyAction` still has no mutex.
- **Delegations are records, not grants.** `POST /api/platform/workflows/delegations` persists a row. `workflowEngine.ts` still checks the caller’s effective role against `workflowConfig.ts` only.
- **Compute payloads.** `GET .../compute/forecast` `rows` and `GET .../compute/evm` `accounts` are **counts**, not arrays.
- **PO accrual WBS.** Generated PO accruals are booked to `P.04` (`purchaseOrderAccrual` in `src/engine/accruals.ts`), not the PO’s own WBS.
- **`JWT_SECRET` length.** Must be ≥16 characters whenever it is set. Unset is allowed only outside production (insecure fallback).
- **Accrual WBS roll-up.** `accruedCostForWbs` includes the node and descendants, not ancestors. Parent-level PO accruals must not be expected on every child (see `src/engine/accruals.ts`).
- **Monthly close is sequential.** `evaluateMonthlyClose` blocks later steps until the prior step is complete. Completeness is derived from project data, not the published `monthly-close` workflow id.
- **Bundled filesystem paths.** Under `tsx`, JSON/audit/baseline files live in `server/data` and SQL migrations in `server/src/db/migrations`. The esbuild bundle resolves `../../data` from `server/dist` (repo-root `data/`) and SQL from `server/dist/migrations`. The current Docker image does not COPY those `.sql` files. JSON `runMigrations()` still runs on Postgres boots and needs a writable `/app/data`.
- **Export jobs.** POST accepts `{ scheduleCron? }` only. `packType` is hardcoded `close_pack`. The hourly runner calls `generateClosePackPdfAsync` and **discards the Buffer** (`console.log` only — no file, no email). Next run is 1st-of-month 06:00 **local**.
- **Two audit trails.** SPA `/audit`, Team Reports, monthly-close signals, and the close-pack `audit_activity` CSV read in-state `state.auditLog` (last 100). `GET /api/projects/:id/audit` is the SHA-256 JSONL store. `src/api/client.ts` never fetches that endpoint.
- **`SET_SELECTED_VALUE` is shared.** Viewers may POST it. It writes `selectedValueId` on the project blob (extraction workspace), not a per-session UI flag. `useProjectRole().canEdit` is `role !== 'viewer'` and does not hide this.
- **PDF download 401.** `downloadClosePackPdf` throws a generic `Error`, not `ApiError`, so a 401 on `GET .../close-pack.pdf` will not expire the SPA session the way JSON API calls do.
- **Saved filters.** `DELETE /api/platform/filters/:filterId` is owner-only. `GET` returns the caller’s rows plus `shared: true`. `useSavedFilters` falls back to `localStorage` on API failure — the two copies do not sync.
- **SQL `001_init.sql` is `SELECT 1`.** Real schema is `002_core_schema.sql`, `003_platform.sql`, `004_users.sql`. Unused tables (no TypeScript INSERT): `audit_events`, `baseline_snapshots`, `integration_sync_jobs`, `workflow_definitions`. `portfolios` is a seeded `'default'` row. `app_settings` **is** used (`active_project_id`). Live audit/baselines are still filesystem JSONL/JSON.
- **Integrations list vs sync.** Adapter `configured` in `GET .../adapters` is always `false`. `sap-s4` sync runs sample rows without OAuth.

## Branching & review

Work on a feature branch, open a PR against `master`, ensure CI is green, and get review before merge. Use clear, conventional commit messages.
