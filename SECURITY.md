# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (do not open a public issue). Include steps to reproduce, affected versions, and impact. We aim to acknowledge within 3 business days and to provide a remediation timeline after triage.

## Supported versions

The latest release on the default branch receives security fixes.

## Security controls implemented

- **Authentication** — HMAC-signed (HS256) session tokens with a mandatory ≥16-char `JWT_SECRET` (the server refuses to start without it in production); bcrypt password hashing; optional OIDC via an explicit ID-token → session exchange (`POST /api/platform/auth/oidc`). Demo auth is hard-disabled in production. Demo `/auth/token` subjects are honoured only while demo auth is on.
- **Authorization** — role-based access (viewer/cost_controller/approver/admin) enforced on every mutating route, plus per-project membership enforcement (`ENFORCE_PROJECT_MEMBERSHIP`, default on in production) to prevent cross-project IDOR. A path-safety guard validates project identifiers. Action minimums live in `server/src/auth/actionPolicy.ts` (see `API.md`).
- **Input validation** — Zod schemas validate request payloads on mutating endpoints; the action envelope is type- and role-checked.
- **Transport / HTTP** — Helmet headers, deny-by-default CORS allowlist in production, baseline + login rate limiting, `x-powered-by` disabled, capped JSON body size, and production error masking with an `errorId`.
- **Webhooks** — inbound webhooks require a valid HMAC-SHA256 signature (`WEBHOOK_SECRET` / per-connector secret). Missing secret is 401 in production; unsigned requests are allowed only in non-prod.
- **Data integrity** — append-only audit JSONL with a SHA-256 hash chain (`prevHash` + payload) in `server/src/services/auditService.ts`. `AUDIT_HMAC_SECRET` is documented for a future HMAC-keyed chain; the current writer does not read it. Optimistic-concurrency writes are atomic (transactional, version-conditional on Postgres; atomic file replace on the JSON store). Trailing corrupt audit lines are skipped so a bad append cannot fail an already-committed project write.
- **Secrets at rest** — connector OAuth tokens encrypted with AES-256-GCM (`CREDENTIALS_KEY`, falling back to `JWT_SECRET`). Application secrets are supplied via environment/secret manager and are never committed (`server/data/` and `.env` are gitignored).

## Known follow-ups

See `REMEDIATION-STATUS.md` for hardening still recommended (e.g. HMAC-keyed / DB-backed audit, request-scoped logging, third-party penetration test, SOC 2 control mapping, full OIDC Authorization-Code+PKCE flow, shared-store rate limiting for multi-replica deployments).
