# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (do not open a public issue). Include steps to reproduce, affected versions, and impact. We aim to acknowledge within 3 business days and to provide a remediation timeline after triage.

## Supported versions

The latest release on the default branch receives security fixes.

## Security controls implemented

- **Authentication** — HMAC-signed (HS256) session tokens with a mandatory ≥16-char `JWT_SECRET` (the server refuses to start without it in production); bcrypt password hashing; optional OIDC via an explicit ID-token → session exchange (`POST /api/platform/auth/oidc`). Demo auth is hard-disabled in production.
- **Authorization** — role-based access (viewer/cost_controller/approver/admin) enforced on every mutating route, plus per-project membership enforcement (`ENFORCE_PROJECT_MEMBERSHIP`, default on in production) to prevent cross-project IDOR. A path-safety guard validates project identifiers.
- **Input validation** — Zod schemas validate request payloads on mutating endpoints; the action envelope is type- and role-checked. Action writes require an `If-Match` state-version header (positive integer) so blind last-writer-wins overwrites are rejected.
- **Transport / HTTP** — Helmet headers, deny-by-default CORS allowlist in production, baseline + login rate limiting, `x-powered-by` disabled, capped JSON body size, production error masking with a correlation id, and per-request `x-request-id` correlation with structured JSON request logging.
- **Webhooks** — inbound webhooks require a valid HMAC-SHA256 signature (`WEBHOOK_SECRET` / per-connector secret).
- **Data integrity** — tamper-evident audit chain, HMAC-SHA256-keyed with `AUDIT_HMAC_SECRET` (required in production; dev falls back to an unkeyed SHA-256 chain and flags mixed chains on verify); optimistic-concurrency writes are atomic (transactional, version-conditional on Postgres; atomic file replace on the JSON store).
- **Session storage note** — the client keeps its session JWT in `localStorage`; an XSS compromise could read it. Accepted for the current deployment model (no cookies/CSRF surface); revisit if the threat model changes.
- **Secrets at rest** — connector OAuth tokens encrypted with AES-256-GCM (`CREDENTIALS_KEY`). Application secrets are supplied via environment/secret manager and are never committed (`server/data/` and `.env` are gitignored).

## Known follow-ups

See `REMEDIATION-STATUS.md` for hardening still recommended (e.g. third-party penetration test, SOC 2 control mapping, full OIDC Authorization-Code+PKCE flow, shared-store rate limiting for multi-replica deployments).
