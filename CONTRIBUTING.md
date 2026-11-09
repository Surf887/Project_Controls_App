# Contributing

## Local setup

```bash
npm install
npm install --prefix server
cp .env.example .env        # set JWT_SECRET etc. for local runs
npm run dev                 # client (5173) + API (3001)
```

With `.env.example` copied as-is, **demo auth is off**. Sign in at the login screen with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@example.com` / `change-me-strong-password`).

For credential-free local demos, set **both**:

```bash
VITE_DEMO_AUTH=true   # client: role switcher + x-pc-role fallback
DEMO_AUTH=true        # server: accept demo header + POST /api/platform/auth/token
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
| Login screen, demo picker missing | `.env` has `DEMO_AUTH=false` (from `.env.example`) | Sign in with bootstrap admin, **or** set `DEMO_AUTH=true` **and** `VITE_DEMO_AUTH=true` and restart both processes. |
| `401` / demo `/token` returns 404 | Server demo auth off | `DEMO_AUTH=true` is a **server** env var. `VITE_*` only affects the client. |
| Client talks to the wrong port | Harness set `PORT` | Vite uses `PORT` (default 5173). The API uses `API_PORT` then `PORT` (default 3001). If something injects `PORT`, set `API_PORT=3001` so the API does not collide. |
| `JWT_SECRET must be at least 16 characters` | Short secret in `.env` | Use `openssl rand -hex 32`. In production the server also refuses to boot with no secret. |
| Server tests / e2e hang on login | Demo auth off in that process | `DEMO_AUTH=true npm test --prefix server` and `DEMO_AUTH=true npm run test:e2e` (CI already sets this). |
| `409` after an edit | Another write incremented `version` | Expected. The UI reloads server state; re-apply the change. Send `If-Match` on `POST .../actions`. |
| Production-like `npm start` dies immediately | Missing `DATABASE_URL` | JSON file store is **dev-only**. Production fail-fast requires Postgres. |
| Empty UI after a crash loop | Corrupt `localStorage` project blob | Error boundary “Reset local data”, or **Reset demo** in the top bar. |
| Webhook `401` locally | No `WEBHOOK_SECRET` **and** you sent a bad signature | Dev allows unsigned webhooks only when **no** secret is configured. If a secret is set, `x-webhook-signature` must be HMAC-SHA256 of the raw body. |

The server loads the **repo-root** `.env` at boot (`server/src/config/loadEnv.ts`) and does not override variables already in the environment. Changes to `.env` need a server restart; Vite picks up `VITE_*` on client restart.

## Architecture notes for contributors

- Shared domain lives in `src/engine/*` and `src/store/projectReducer.ts` — imported by both the SPA fallback and the server.
- Financial totals use **control accounts only** (`parentId === null`). See `MILESTONE-TRUST.md`.
- Accrual WBS rollup is descendant-only; do not “fix” it to match parent codes bidirectionally (`src/engine/accruals.ts`).
- New views: add a `NavView` + path in `src/routes/viewPaths.ts` and `src/data/navigationModel.ts`, lazy-load from `App.tsx`.
- Design tokens: `src/design-tokens.css` + `src/design-overrides.css`. Accent is `data-accent` on `<html>`. Do not duplicate sidebar markup — use `AppSidebar`.
