# Contributing

## Local setup

```bash
npm install
npm install --prefix server
cp .env.example .env        # set JWT_SECRET etc. for local runs
npm run dev                 # client (5173) + API (3001)
```

For a quick frontend-only/demo run, set `VITE_DEMO_AUTH=true` and `DEMO_AUTH=true` (local only — never in production).

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
