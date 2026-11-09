# Trust milestone

Financial totals and monthly close are the product focus — not more modules.

## Aggregation grain (decided)

**Project-level totals use control accounts only** (`parentId === null`).

Work packages and cost elements under a control account are parallel detail — never summed with their parent. See `src/engine/costAggregation.ts` and `costAggregation.test.ts`.

Engines wired to this grain: forecast roll-ups, EVM, governance/portfolio, S-curve, cost structure, accruals header totals.

## CI

`.github/workflows/ci.yml` runs, on every push/PR:

- Client unit tests + production build
- Server tests + build + smoke (`DEMO_AUTH=true`)
- Playwright e2e (`DEMO_AUTH=true`)
- Advisory `npm audit` (non-blocking)
- Production Docker image build (the gate that used to miss compiling the server)

## Server

- Auth/RBAC: `server/src/auth/rbac.ts`, `server/src/middleware/auth.ts`
  - Bearer session JWT is the real path
  - `x-pc-role` / `POST /api/platform/auth/token` only when `DEMO_AUTH` is on (never in production)
  - Demo JWTs whose `sub` is not in the user store are honoured **only** with demo auth on
- Schema validation: Zod on mutating routes, including `POST .../actions`
- Stores: JSON file (dev) or Postgres JSONB (`DATABASE_URL`; required in production)
- SQL migrations: `server/src/db/migrations/*.sql` applied at startup
- Optimistic concurrency: `If-Match` → 409 `VersionConflictError`
- Route tests: `server/src/routes/projects.test.ts` plus auth/OIDC/connector tests
- Smoke: `DEMO_AUTH=true npm run smoke --prefix server`

## Product: guided monthly close

- Landing route: `/close` (replaces module-first dashboard as entry)
- Steps: baseline → WBS → accruals → VOWD → changes → forecast → approval → reports (`src/data/monthlyCloseSteps.ts`)
- Progress/blockers: `src/engine/monthlyCloseProgress.ts` (sidebar stepper + `/close`)
- Real routes: `src/routes/viewPaths.ts`
- Command palette: Ctrl/Cmd+K
- Saved filters: `useSavedFilters` (server `/api/platform/filters`, `localStorage` fallback)
- Item detail: `/item/:type/:id`
- Audit drill-down: `/audit/:entryId`
- Exports: `/exports`
- Mobile nav: bottom tabs on viewports ≤960px

## Workflows (server-enforced)

Definitions: `src/data/workflowConfig.ts`. Forecast/change transitions are asserted in `server/src/services/workflowEngine.ts` before the reducer runs.

| Workflow | Happy path | Min roles |
|---|---|---|
| Forecast approval | `draft` → `under_review` (`SUBMIT_FORECAST`) → `approved` / `rejected` | cost_controller submits; **approver** signs |
| Change board | `draft` → `submitted` (`SUBMIT_CHANGE`) → `approved` / `rejected` (`DECIDE_CHANGE`) | cost_controller raises; **approver** decides |
| Monthly close | `open` → `reconciled` → `vowd_reviewed` → `changes_cleared` → `ready_for_forecast` | last gate before forecast submit is **approver** |
| Baseline sanction | `working` → `proposed` → `sanctioned` → `locked` | approver sanctions; **admin** locks |

`GET /api/platform/workflows` returns the same definitions the server uses.

## E2E

```bash
npm run test:e2e
```

Playwright workflows: monthly close, cost sheet, forecast approval, WBS, changes, mobile nav.

## Accrual rollup (do not regress)

`accruedCostForWbs(entries, wbs)` includes the account and **descendants** (`wbs` or `wbs.*`) in `reviewed`/`posted` status. Ancestor bookings (for example PO accruals on `P.04`) must not be copied onto every child — that double-counted exposure across sibling subtrees.

## Next (not done)

- HMAC-keyed audit chain and Postgres `audit_events` (JSONL SHA-256 chain is what ships)
- Full OIDC Authorization-Code + PKCE (token-exchange exists)
- Move baselines + audit off the filesystem into Postgres
- Normalize the JSONB project blob into relational cost/register tables
- Metrics / tracing / shared rate-limit store — see `REMEDIATION-STATUS.md`
