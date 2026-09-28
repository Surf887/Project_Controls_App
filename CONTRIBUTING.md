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

If tooling injects `PORT`, set `API_PORT=3001`.

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

- **Both demo flags matter.** `VITE_DEMO_AUTH` is baked in at Vite compile time. Restart `npm run dev:client` after changing it. Server demo auth is `DEMO_AUTH` / `NODE_ENV` (see `server/src/auth/rbac.ts`).
- **Empty user store.** Password login needs a user. Either set `ADMIN_EMAIL` + `ADMIN_PASSWORD` before first boot, or use demo auth.
- **`.env` path split.** Repo-root `.env` is what Vite and the production bundle read. `tsx` in development reads `server/.env`. Existing process env always wins.
- **Import-time env vars.** `JWT_ISSUER`, `SESSION_TTL_SEC`, `DATABASE_PATH`, `USERS_PATH`, and `BCRYPT_ROUNDS` are read when their modules are first imported, which is **before** `loadRootEnvFile()`. A value that exists only in `.env` is ignored; export or inject them. `JWT_SECRET`, `DATABASE_URL`, and OIDC flags are read at call time and do pick up the file.
- **`If-Match` / 409.** All `/actions` writes are versioned **when the header is present**. Omitting `If-Match` skips the conflict check. Non-numeric headers become `NaN` and 409. The UI reloads on conflict rather than merging.
- **Membership in production-like runs.** `ENFORCE_PROJECT_MEMBERSHIP` defaults on when `NODE_ENV=production`. A non-admin with no project role gets 403 on `:projectId` routes. A project role **replaces** the global role (`effectiveRole`); it does not take the higher of the two.
- **Delegations are records, not grants.** `POST /api/platform/workflows/delegations` persists a row. `workflowEngine.ts` still checks the caller’s effective role against `workflowConfig.ts` only.
- **Compute payloads.** `GET .../compute/forecast` `rows` and `GET .../compute/evm` `accounts` are **counts**, not arrays.
- **PO accrual WBS.** Generated PO accruals are booked to `P.04` (`purchaseOrderAccrual` in `src/engine/accruals.ts`), not the PO’s own WBS.
- **`JWT_SECRET` length.** Must be ≥16 characters whenever it is set. Unset is allowed only outside production (insecure fallback).
- **Accrual WBS roll-up.** `accruedCostForWbs` includes the node and descendants, not ancestors. Parent-level PO accruals must not be expected on every child (see `src/engine/accruals.ts`).
- **Monthly close is sequential.** `evaluateMonthlyClose` blocks later steps until the prior step is complete. Completeness is derived from project data, not the published `monthly-close` workflow id.
- **Bundled filesystem paths.** Under `tsx`, JSON/audit/baseline files live in `server/data` and SQL migrations in `server/src/db/migrations`. The esbuild bundle resolves `../../data` from `server/dist` (repo-root `data/`) and SQL from `server/dist/migrations`. The current Docker image does not COPY those `.sql` files.

## Branching & review

Work on a feature branch, open a PR against `master`, ensure CI is green, and get review before merge. Use clear, conventional commit messages.
