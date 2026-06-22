# Trust milestone

Financial totals and monthly close are the product focus — not more modules.

## Aggregation grain (decided)

**Project-level totals use control accounts only** (`parentId === null`).

Work packages and cost elements under a control account are parallel detail — never summed with their parent. See `src/engine/costAggregation.ts` and `costAggregation.test.ts`.

Engines wired to this grain: forecast roll-ups, EVM, governance/portfolio, S-curve, cost structure, accruals header totals.

## CI

`.github/workflows/ci.yml` runs client test/build and server test/smoke on every push/PR.

## Server

- Auth/RBAC: `server/src/auth/rbac.ts`, `server/src/middleware/auth.ts` (Bearer token or `x-pc-role` header for demo)
- Schema validation: Zod on `POST .../actions`
- Migrations: `server/src/db/migrate.ts` (JSON store; SQL placeholders for Postgres)
- Route tests: `server/src/routes/projects.test.ts`
- Smoke: `npm run smoke --prefix server`

## Product: guided monthly close

- Landing route: `/close` (replaces module-first dashboard as entry)
- Steps: baseline → WBS → accruals → VOWD → changes → forecast → approval → reports
- Real routes: `src/routes/viewPaths.ts`
- Command palette: Ctrl/Cmd+K
- Saved filters: localStorage via `useSavedFilters`
- Item detail: `/item/:type/:id`
- Audit drill-down: `/audit/:entryId`
- Exports: `/exports`
- Mobile nav: bottom tabs on viewports ≤960px

## E2E

```bash
npm run test:e2e
```

Playwright workflows: monthly close, cost sheet, forecast approval, WBS, changes, mobile nav.

## Next (Postgres / IdP)

- Replace JSON store with Postgres + run SQL migrations
- Wire corporate IdP; remove demo role headers
- PDF generation (currently close summary exports as text placeholder)
