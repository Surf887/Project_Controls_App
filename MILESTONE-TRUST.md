# Trust milestone

Financial totals and monthly close are the product focus — not more modules.

## Aggregation grain (decided)

**Project-level totals use control accounts only** (`parentId === null`).

Work packages and cost elements under a control account are parallel detail — never summed with their parent. See `src/engine/costAggregation.ts` and `costAggregation.test.ts`.

Engines wired to this grain: forecast roll-ups, EVM, governance/portfolio, S-curve, cost structure, accruals header totals.

Forecast EAC also **allocates** project-level FX stress and net risk **equally** across those same non-reserve control accounts (`src/engine/forecast.ts`). Do not spread those amounts onto detail rows — the control-account roll-up would double-count.

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
- SQL migrations: `server/src/db/migrations/*.sql` applied at startup **when the files are next to the compiled module** (tsx path works; the Docker image currently omits them — see `DEPLOYMENT.md`)
- Optimistic concurrency: `If-Match` → 409 `VersionConflictError`. **Omitting `If-Match` skips the check.**
- Route tests: `server/src/routes/projects.test.ts` plus auth/OIDC/connector tests
- Smoke: `DEMO_AUTH=true npm run smoke --prefix server` — does **not** run `validateEnv()` / `getJwtSecret()` / bootstrap admin

## Product: guided monthly close

- Landing route: `/close` (replaces module-first dashboard as entry)
- Steps: baseline → WBS → accruals → VOWD → changes → forecast → approval → reports (`src/data/monthlyCloseSteps.ts`)
- Progress/blockers: `src/engine/monthlyCloseProgress.ts` (sidebar stepper + `/close`) — sequential UI gates only; it does **not** block reducer actions
- Real routes: `src/routes/viewPaths.ts`
- Command palette: Ctrl/Cmd+K
- Saved filters: `useSavedFilters` (server `/api/platform/filters`, `localStorage` key `pc-saved-filters:${scope}` on failure). SPA save never sets `shared: true`. No view currently imports the hook.
- Item detail: `/item/:type/:id` — only `change`, `risk`, `wbs`
- Extra routes not in `viewPaths`: `/logs`, `/admin/pmo`, `/admin/workflows`, `/exports`, `/close`
- Audit drill-down: `/audit/:entryId` (in-state `auditLog`, not the JSONL chain)
- Exports: `/exports`
- Mobile nav: bottom tabs on viewports ≤960px
- Seeded projects: `proj-demo-001` (active), `proj-benchmark-002`, `proj-benchmark-003`

## Workflows

Definitions: `src/data/workflowConfig.ts`. **Only forecast and change** transitions are asserted in `server/src/services/workflowEngine.ts` before the reducer runs.

| Workflow | Where it is enforced | Happy path | Min roles |
|---|---|---|---|
| Forecast approval | `workflowEngine.ts` | `draft` → `under_review` (`SUBMIT_FORECAST`) → `approved` / `rejected` | cost_controller submits; **approver** signs |
| Change board | `workflowEngine.ts` | `draft` → `submitted` (`SUBMIT_CHANGE`) → `approved` / `rejected` (`DECIDE_CHANGE`) | cost_controller raises; **approver** decides |
| Monthly close | **UI only** (`monthlyCloseProgress.ts`) | `open` → `reconciled` → `vowd_reviewed` → `changes_cleared` → `ready_for_forecast` | listed in config; not asserted on actions |
| Baseline sanction | **config only** | `working` → `proposed` → `sanctioned` → `locked` | `POST /baselines` writes `sanctioned` immediately; lock is admin |

`GET /api/platform/workflows` returns the definitions; that does not mean every row is server-enforced.

## Period lock vs ingestion

`settings.reportingPeriod.locked` is a reducer guard, not a workflow engine rule.

| Action | Locked period | Empty / invalid | Notes |
|---|---|---|---|
| `SET_COST_SHEET` | silent no-op | n/a | |
| `SYNC_COMMITMENTS` | silent no-op | n/a | POs roll into `P.04` |
| `APPLY_APPROVED_EXTRACTIONS` | silent no-op | silent no-op if `appliedCount === 0` | last cost/forecast per WBS; change additive |
| `SET_VALUES` | **still runs** | reverses postings that lost approval or changed financial fields | `extractionIntegrity.ts` |
| `LOCK_REPORTING_PERIOD` | n/a | server **400** if pending approved extractions remain | client reducer swallows the throw offline |

Connected SPA dispatch is wait-for-POST then hydrate (`projectStore.tsx`). Offline edits are not merged on reconnect.

## E2E

```bash
DEMO_AUTH=true npm run test:e2e
```

Playwright: monthly close, cost sheet, forecast approval, WBS, changes, mobile nav. There is **no login spec** — tests `goto` routes directly and need demo auth.

## Accrual rollup (do not regress)

`accruedCostForWbs(entries, wbs)` includes the account and **descendants** (`wbs` or `wbs.*`) in `reviewed`/`posted` status. Ancestor bookings (for example PO accruals on `P.04`) must not be copied onto every child — that double-counted exposure across sibling subtrees.

`incurredForRow` is **not** the same function: it adds open (not posted/reversed) accruals for that exact WBS to `actualsToDate`. Do not mix the two in tests.

## Next (not done)

- HMAC-keyed audit chain and Postgres `audit_events` (JSONL SHA-256 chain is what ships)
- Full OIDC Authorization-Code + PKCE (token-exchange exists)
- Move baselines + audit off the filesystem into Postgres
- Normalize the JSONB project blob into relational cost/register tables
- Optimistic client UI / offline merge
- Period-lock `SET_VALUES` (or document it as an intentional correction path)
- Metrics / tracing / shared rate-limit store — see `REMEDIATION-STATUS.md`
