# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (do not open a public issue). Include steps to reproduce, affected versions, and impact. We aim to acknowledge within 3 business days and to provide a remediation timeline after triage.

## Supported versions

The latest release on the default branch receives security fixes.

## Security controls implemented

- **Authentication** — HMAC-signed (HS256) session tokens with a mandatory ≥16-char `JWT_SECRET` (the server refuses to start without it in production); bcrypt password hashing; optional OIDC via an explicit ID-token → session exchange (`POST /api/platform/auth/oidc`, JWKS verify — `OIDC_CLIENT_SECRET` is unused). Demo auth is hard-disabled in production. Demo `/auth/token` subjects are honoured only while demo auth is on (unknown role → cost_controller). With demo auth on, a **missing** `x-pc-role` still authenticates as **cost_controller**. For persisted users, `attachUser` reloads the user store by `sub` — JWT `role` is ignored, and `disabled=true` drops the session on the next request (password login stays generic 401; OIDC 403). `JWT_ISSUER` must be in the process environment; a `.env`-only value is ignored because `jwt.ts` captures it at import time.
- **Authorization** — role-based access (viewer/cost_controller/approver/admin) enforced on every mutating route, plus per-project membership enforcement (`ENFORCE_PROJECT_MEMBERSHIP`, default on in production) to prevent cross-project IDOR. A path-safety guard validates project identifiers (`[a-zA-Z0-9._-]{1,128}`). Action minimums live in `server/src/auth/actionPolicy.ts` (see `API.md`). A project role **replaces** the global role (`effectiveRole`); global admins bypass membership. Non-admins with no project assignment see an empty project list. There is no HTTP disable-user or global-role-change endpoint (`setUserDisabled` / `setUserRole` are store helpers only). Workflow delegations are stored but never consulted by `workflowEngine.ts`. `GET /api/platform/workflows/delegations` returns up to 50 rows to any viewer (no project/user filter). Saved-filter DELETE is owner-only; shared filters are visible to every viewer.
- **Input validation** — Zod on mutating platform/enterprise routes; the `/actions` **envelope** is type- and role-checked. Most register payloads `.passthrough()` extra fields — amounts are not bounded at the HTTP layer.
- **Transport / HTTP** — Helmet headers, deny-by-default CORS allowlist in production, baseline + login rate limiting, `x-powered-by` disabled, capped JSON body size, and production error masking with an `errorId`.
- **Webhooks** — inbound webhooks require a valid HMAC-SHA256 signature (`WEBHOOK_SECRET` / per-connector secret). Missing secret is 401 in production; unsigned requests are allowed only in non-prod.
- **Data integrity** — append-only audit JSONL with a SHA-256 hash chain (`prevHash` + payload) in `server/src/services/auditService.ts`. `AUDIT_HMAC_SECRET` is documented for a future HMAC-keyed chain; the current writer does not read it. Appends are not mutexed; concurrent writers on one project can interleave lines. Postgres project writes are transactional (`FOR UPDATE` + version-conditional `UPDATE`) even when `If-Match` is omitted. The JSON store uses atomic temp+fsync+rename but **no process mutex**, so concurrent omitted-header writes can last-wins. Trailing corrupt audit lines are skipped so a bad append cannot fail an already-committed project write. The SPA `/audit` page is a **different** store: in-state `state.auditLog` (last 100, no hash). `SET_SELECTED_VALUE` is viewer-allowed and mutates shared `selectedValueId` on the project blob.
- **Secrets at rest** — connector OAuth tokens encrypted with AES-256-GCM (`CREDENTIALS_KEY`, falling back to `JWT_SECRET`). `decryptConnectorTokens` still parses legacy plaintext JSON (no `enc:v1:` prefix). Application secrets are supplied via environment/secret manager and are never committed (`server/data/` and `.env` are gitignored). `GET .../integrations/adapters` always reports `configured: false`; `sap-s4` sync uses in-repo sample rows.

## Known follow-ups

See `REMEDIATION-STATUS.md` for hardening still recommended (e.g. HMAC-keyed / DB-backed audit, request-scoped logging, third-party penetration test, SOC 2 control mapping, full OIDC Authorization-Code+PKCE flow, shared-store rate limiting for multi-replica deployments).
