# Contributing

## Local setup

```bash
npm install
npm install --prefix server
cp .env.example .env
cp .env.example server/.env   # tsx (`npm run dev`) reads this file, not the repo-root copy
npm run dev                   # client (5173) + API (3001)
```

`loadRootEnvFile()` (`server/src/config/loadEnv.ts`) does **not** always read the repo-root `.env`:

| How you start the API | `import.meta.url` lives in | `.env` loaded |
|---|---|---|
| `npm run dev` / `tsx watch src/index.ts` | `server/src/config/` | **`server/.env`** (`../..` from that file) |
| Bundled `node server/dist/index.js` | `server/dist/` | **repo-root `.env`** |

Vite still loads repo-root `.env` for `VITE_*`. Copying `.env.example` only to the repo root turns the **client** demo picker off (`VITE_DEMO_AUTH=false`) while the **tsx server** never sees `DEMO_AUTH=false` and, in `NODE_ENV=development`, demo auth stays **on**. Put the same file at `server/.env` (or export `DEMO_AUTH` in the shell) so both sides match.

Sign in at the login screen with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@example.com` / `change-me-strong-password`) when demo auth is off.

For credential-free local demos, set **both** in the file each process actually loads:

```bash
VITE_DEMO_AUTH=true   # client: role switcher + x-pc-role fallback (repo-root `.env`)
DEMO_AUTH=true        # server: accept demo header + POST /api/platform/auth/token (`server/.env` under tsx)
```

Never enable either flag in production (`NODE_ENV=production` hard-disables `DEMO_AUTH` and refuses to boot if it is `true`).

Frontend-only (no API, `localStorage` persistence):

```bash
npm run dev:client
```

## Checks before opening a PR

Run these and keep them green:

```bash
npm run build                       # client typecheck (tsc) + vite build
npm test                            # client/engine unit tests (vitest)
npm run build --prefix server       # server bundle + typecheck
DEMO_AUTH=true npm test --prefix server   # server unit/route tests
npm run test:e2e                    # Playwright (set DEMO_AUTH=true)
```

CI (`.github/workflows/ci.yml`) runs the same client, server, and e2e jobs, plus a dependency audit and a production Docker build. All must pass.

## Conventions

- TypeScript throughout; prefer small, focused modules and pure functions in `src/engine/*` (unit-tested).
- All server state mutations go through dispatched `ProjectAction`s validated server-side; never bypass the reducer.
- Add or update tests with behavior changes. New API routes need at least one route test; new engine logic needs unit tests.
- Don't commit secrets or runtime data (`.env`, `server/data/*` are gitignored).

## Branching & review

Work on a feature branch, open a PR against `master`, ensure CI is green, and get review before merge. Use clear, conventional commit messages.

HTTP surface: `API.md`. Ops: `DEPLOYMENT.md`.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Login screen, demo picker missing | Repo-root `.env` has `VITE_DEMO_AUTH=false` | Sign in with bootstrap admin, **or** set `VITE_DEMO_AUTH=true` (repo-root) **and** `DEMO_AUTH=true` (`server/.env` under tsx) and restart both processes. |
| Client demo off, `/token` still works | tsx did not load repo-root `.env` | Copy `.env` to `server/.env`, or export `DEMO_AUTH=false` in the shell. |
| `401` / demo `/token` returns 404 | Server demo auth off | `DEMO_AUTH=true` is a **server** env var. `VITE_*` only affects the client. |
| Client talks to the wrong port | Harness set `PORT` | Vite uses `PORT` (default 5173). The API uses `API_PORT` then `PORT` (default 3001). If something injects `PORT`, set `API_PORT=3001` so the API does not collide. |
| `/api` 502 in Vite even though API_PORT is set | Proxy target is hardcoded | `vite.config.ts` always proxies `/api` → `http://localhost:3001`, not `API_PORT`. Keep the API on 3001 or change the proxy. |
| `JWT_SECRET must be at least 16 characters` | Short secret in `.env` | Use `openssl rand -hex 32`. In production the server also refuses to boot with no secret. Unset `JWT_SECRET` in **dev** falls back to a source-committed secret (`jwt.ts`) — do not rely on that outside local toys. |
| `JWT_ISSUER` / `SESSION_TTL_SEC` in `.env` ignored | Captured at **import time** | `JWT_ISSUER` (`jwt.ts`), `SESSION_TTL_SEC` (`auth.ts`), `DATABASE_PATH`, `USERS_PATH`, and `BCRYPT_ROUNDS` are read when the module first loads — **before** `loadRootEnvFile()`. Export them in the shell (or Compose) so they exist before Node starts. `JWT_SECRET` is read later in `getJwtSecret()` and does pick up the file. |
| Server tests / e2e hang on login | Demo auth off in that process | `DEMO_AUTH=true npm test --prefix server` and `DEMO_AUTH=true npm run test:e2e` (CI already sets this). Playwright has **no login spec** — it hits routes directly and needs demo auth. |
| `409` after an edit | Another write incremented `version` | Expected. The UI reloads server state; re-apply the change. Send `If-Match` on `POST .../actions`. Omitting `If-Match` **skips** the version check. |
| Production-like `npm start` dies immediately | Missing `DATABASE_URL` | JSON file store is **dev-only**. Production fail-fast requires Postgres. |
| Empty UI after a crash loop | Corrupt `localStorage` project blob | Error boundary “Reset local data” only clears `project-controls-platform-v2`. Auth keys (`pc-token`, `pc-role`, …) stay. Or **Reset demo** in the top bar. |
| Webhook `401` locally | No `WEBHOOK_SECRET` **and** you sent a bad signature | Dev allows unsigned webhooks only when **no** secret is configured. If a secret is set, `x-webhook-signature` must be HMAC-SHA256 of the raw body. |
| SSO button missing though OIDC is on | Client URL not set | Server OIDC is `OIDC_ISSUER` + `OIDC_CLIENT_ID`. The login button also needs `VITE_OIDC_LOGIN_URL`. `OIDC_CLIENT_SECRET` is unused (token-exchange verifies the ID token against JWKS). |

`loadRootEnvFile()` does not override variables already in the environment. Changes to `.env` need a server restart; Vite picks up `VITE_*` on client restart.

## Architecture notes for contributors

- Shared domain lives in `src/engine/*` and `src/store/projectReducer.ts` — imported by both the SPA fallback and the server.
- Financial totals use **control accounts only** (`parentId === null`). See `MILESTONE-TRUST.md`.
- Accrual WBS rollup is descendant-only; do not “fix” it to match parent codes bidirectionally (`src/engine/accruals.ts`). `incurredForRow` uses **open** accruals on that exact WBS only (no descendant rollup, excludes `posted`/`reversed`) — it is not a second name for `accruedCostForWbs`.
- `workflowEngine.ts` asserts **forecast** and **change** transitions only. Monthly-close progress in the sidebar is `monthlyCloseProgress.ts` (UI). Baseline/monthly-close rows in `workflowConfig.ts` are not server-enforced.
- New views: add a `NavView` + path in `src/routes/viewPaths.ts` and `src/data/navigationModel.ts`, lazy-load from `App.tsx`. Extra routes that are **not** in `viewPaths`: `/logs`, `/admin/pmo`, `/admin/workflows`, `/exports`, `/close`, `/item/:type/:id` (change/risk/wbs only).
- Saved filters: `useSavedFilters` POSTs without `shared: true` and falls back to `localStorage` key `pc-saved-filters:${scope}` when the API fails.
- `src/api/client.ts` has no baseline helpers — use `API.md` / curl for `GET/POST /baselines`. `If-Match` is sent only from `dispatchAction`.
- Design tokens: `src/design-tokens.css` + `src/design-overrides.css`. Accent is `data-accent` on `<html>`. Do not duplicate sidebar markup — use `AppSidebar`.
