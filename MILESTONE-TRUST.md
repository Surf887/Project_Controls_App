# Trust milestone

Financial totals and monthly close are the product focus — not more modules.

## Aggregation grain (decided)

**Project-level totals use control accounts only** (`parentId === null`).

Work packages and cost elements under a control account are parallel detail — never summed with their parent. See `src/engine/costAggregation.ts` and `costAggregation.test.ts`.

Engines wired to this grain: forecast roll-ups, EVM, governance/portfolio, S-curve, cost structure, accruals header totals.

## CI

`.github/workflows/ci.yml` gates client/server tests and builds, PostgreSQL integration, browser workflows, dependency security, and the production Docker image.

## Server

- Auth/RBAC: Secure HttpOnly production sessions, per-project roles, and demo headers only when explicitly enabled outside production
- Schema validation: Zod on `POST .../actions`
- Migrations: transactional PostgreSQL migrations with startup advisory locking; JSON migration path is development-only
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

Playwright workflows: monthly close, cost sheet, forecast approval, WBS, manual mapping, P6 schedule integration, immutable audit, supported-scope gating, changes, and mobile navigation.

## Next (enterprise integrations / IdP)

- Complete corporate OIDC Authorization Code + PKCE rollout
- Add live P6/SAP/Planview adapters and high-volume normalized schedule storage
- Add distributed tracing/error tracking and shared-store rate limiting for multi-replica deployments
