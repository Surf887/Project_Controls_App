# Trust milestone

Financial totals and monthly close are the product focus — not more modules.

## Aggregation grain (decided)

**Project-level totals use control accounts only** (`parentId === null`).

Work packages and cost elements under a control account are parallel detail — never summed with their parent. See `src/engine/costAggregation.ts` and `costAggregation.test.ts`.

Engines wired to this grain: forecast roll-ups, EVM, governance/portfolio, S-curve, cost structure, accruals header totals, ISO 19008 SCCS roll-up.

### Accrual WBS attribution

`accruedCostForWbs` (`src/engine/accruals.ts`) sums entries whose `wbs` is the queried code **or a descendant** (`wbs === X` or `wbs.startsWith(X.)`), and only `reviewed` / `posted` statuses.

It does **not** pull ancestor bookings onto children. A parent-level PO accrual on `P.04` stays on `P.04` and is not added in full to every `P.04.*` sibling (that bidirectional match was the previous double-count).

## CI

`.github/workflows/ci.yml` on every push/PR:

| Job | What it runs |
|---|---|
| client | `npm test` + `npm run build` |
| server | `npm test` + `npm run build` + `npm run smoke` (with `DEMO_AUTH=true`) |
| e2e | Playwright (`DEMO_AUTH=true`) |
| security | `npm audit` at high (advisory, `continue-on-error`) |
| docker | Production image build (client + server compile) |

## Server

- Auth/RBAC: `server/src/auth/rbac.ts`, `server/src/middleware/auth.ts` (Bearer session; `x-pc-role` only when demo auth is on)
- Schema validation: Zod on mutating routes; action envelope + role on `POST .../actions`
- Stores: JSON file or Postgres (`DATABASE_URL`); SQL migrations at boot (`server/src/db/postgres.ts`)
- Route tests: `server/src/routes/projects.test.ts` and related auth/service tests
- Smoke: `npm run smoke --prefix server`
- Public routes: `API.md`

## Product: guided monthly close

- Landing route: `/close` (replaces module-first dashboard as entry)
- Steps: baseline → WBS → accruals → VOWD → changes → forecast → approval → reports
- Real routes: `src/routes/viewPaths.ts`
- Command palette: Ctrl/Cmd+K
- Saved filters: API (`/api/platform/filters`) when the backend is up; localStorage via `useSavedFilters` as fallback
- Item detail: `/item/:type/:id`
- Audit drill-down: `/audit/:entryId`
- Exports: `/exports` plus server JSON/PDF close packs
- Mobile nav: bottom tabs on viewports ≤960px
- SCCS workspace: `/cost-structure/sccs`

## E2E

```bash
DEMO_AUTH=true npm run test:e2e
```

Playwright workflows: monthly close, cost sheet, forecast approval, WBS, changes, mobile nav. The e2e job will not get past login unless demo auth is on.

## Next

Shipped since the original “Next” list: Postgres store + SQL migrations, PDF close pack, OIDC ID-token exchange, `If-Match` concurrency, inbound webhook HMAC.

Still open:

- Full OIDC Authorization-Code + PKCE; drop demo role headers from any shared environment
- HMAC-keyed, DB-backed audit (current writer is SHA-256 JSONL)
- Request-scoped structured logs / metrics
- Relational split of the project JSONB blob
- Execute stored `scheduleCron` instead of the fixed monthly next-run
