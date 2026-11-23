# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (do not open a public issue). Include steps to reproduce, affected versions, and impact. We aim to acknowledge within 3 business days and to provide a remediation timeline after triage.

## Supported versions

The latest release on the default branch receives security fixes.

## Security controls implemented

- **Authentication** — HMAC-signed (HS256) session tokens with a mandatory ≥16-char `JWT_SECRET` (the server refuses to start without it in production); bcrypt password hashing; optional OIDC via an explicit ID-token → session exchange (`POST /api/platform/auth/oidc`). Demo auth is hard-disabled in production. `attachUser` uses the user-store role/disabled flag, not the JWT `role` claim. An invalid Bearer token does **not** fall back to `x-pc-role`.
- **Authorization** — role-based access (viewer/cost_controller/approver/admin) enforced on every mutating route, plus per-project membership enforcement (`ENFORCE_PROJECT_MEMBERSHIP`, default on in production) to prevent cross-project IDOR. A path-safety guard validates project identifiers. Unknown `x-pc-role` values are anonymous; an empty header under demo auth is `cost_controller`. The only viewer-allowed `ProjectAction` is `SET_SELECTED_VALUE` (shared `selectedValueId` on the project blob). Client `useProjectRole` maps unknown session roles to `cost_controller` for UI chrome only — the server still enforces `actionPolicy.ts`.
- **Input validation** — Zod schemas validate request payloads on mutating endpoints; the action envelope is type- and role-checked. `LOCK_REPORTING_PERIOD` is additionally rejected (400) while approved extractions are pending apply.
- **Transport / HTTP** — Helmet **library defaults** (no custom CSP), deny-by-default CORS allowlist in production, baseline + login rate limiting (health probes share the global limiter), `x-powered-by` disabled, capped JSON body size, and production error masking with an `errorId` UUID. `TRUST_PROXY=true` means hop count 1.
- **Webhooks** — inbound webhooks require a valid HMAC-SHA256 signature (`WEBHOOK_SECRET` / per-connector secret).
- **Data integrity** — append-only JSONL audit chain (`server/data/audit/{projectId}.jsonl`) hashed with SHA-256 over each record plus `prevHash`. `AUDIT_HMAC_SECRET` is **not** applied today (a keyed HMAC chain is still a follow-up). Optimistic-concurrency writes are atomic on Postgres (`FOR UPDATE` + version-conditional UPDATE). The JSON file store uses atomic temp+fsync+rename but has **no mutex** and caches the file in memory. Omitting `If-Match` skips the version check.
- **Secrets at rest** — connector OAuth tokens encrypted with AES-256-GCM (`CREDENTIALS_KEY`, falling back to `JWT_SECRET` if unset). Application secrets are supplied via environment/secret manager and are never committed (`server/data/` and `.env` are gitignored).
- **Period lock** — reducer no-ops `SET_COST_SHEET`, `SYNC_COMMITMENTS`, and `APPLY_APPROVED_EXTRACTIONS` when the reporting period is locked. `SET_VALUES` is not locked and can reverse ingestion postings.

## Known follow-ups

See `REMEDIATION-STATUS.md` for hardening still recommended (HMAC-keyed audit chain, third-party penetration test, SOC 2 control mapping, full OIDC Authorization-Code+PKCE flow, shared-store rate limiting for multi-replica deployments, structured request logging, JSON-store write mutex).
