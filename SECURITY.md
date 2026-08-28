# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (do not open a public issue). Include steps to reproduce, affected versions, and impact. We aim to acknowledge within 3 business days and to provide a remediation timeline after triage.

## Supported versions

The latest release on the default branch receives security fixes.

## Security controls implemented

- **Authentication** — HMAC-signed (HS256) sessions with a mandatory ≥16-char `JWT_SECRET`; production credentials persist in a Secure, HttpOnly, SameSite=Strict cookie rather than browser storage; bcrypt password hashing; optional server-side OIDC Authorization Code + PKCE with signed state, nonce validation, and discovery/token exchange. Legacy browser ID-token exchange is disabled in production.
- **Identity lifecycle** — session IDs are persisted and checked server-side, supporting immediate logout, administrator/user-wide revocation, expiry pruning, OIDC group role mapping, and bearer-protected SCIM user provisioning/deactivation.
- **Authorization** — role-based access (viewer/cost_controller/approver/admin) enforced on every mutating route, plus per-project membership enforcement (`ENFORCE_PROJECT_MEMBERSHIP`, default on in production) to prevent cross-project IDOR. A path-safety guard validates project identifiers.
- **Input validation** — Zod schemas validate request payloads on mutating endpoints; the action envelope is type- and role-checked.
- **Transport / HTTP** — Helmet headers, deny-by-default CORS allowlist in production, baseline + login rate limiting, `x-powered-by` disabled, capped JSON body size, and production error masking with a correlation id.
- **Webhooks** — inbound webhooks require a valid HMAC-SHA256 signature (`WEBHOOK_SECRET` / per-connector secret).
- **Data integrity** — canonical HMAC audit chain keyed with `AUDIT_HMAC_SECRET`; project-state and audit writes commit in one PostgreSQL transaction; baseline snapshots and audit events are database-backed in production; optimistic concurrency is version-conditional.
- **Secrets at rest** — connector OAuth tokens encrypted with AES-256-GCM (`CREDENTIALS_KEY`). Application secrets are supplied via environment/secret manager and are never committed (`server/data/` and `.env` are gitignored).
- **Document privacy** — uploaded source documents are signature-validated, malware-scanned, deduplicated, encrypted with a separate AES-256-GCM key, and retained in PostgreSQL. Local OCR is the default; cloud OCR requires explicit provider configuration.
- **Asynchronous ingestion** — production OCR jobs persist in PostgreSQL, use idempotency keys, bounded retries, and expiring worker leases; project membership guards every status endpoint.
- **Horizontal controls** — optional Redis-backed API/login rate limits are mandatory when multiple replicas are declared; PostgreSQL advisory locks prevent duplicate scheduled exports.
- **Snowflake boundary** — the adapter accepts validated view identifiers only, limits result sets, prefers OAuth/key-pair authentication, and stages read-only rows for mapping and approval before any cost posting.
- **Planview boundary** — product-specific endpoints are fixed by deployment/profile configuration, OAuth/API credentials stay server-side, result sets are bounded, and governance items require mapping and approval before register/schedule posting.
- **Observability** — structured request/error logs carry correlation IDs; optional Prometheus metrics require a dedicated bearer token.

## Known follow-ups

See `REMEDIATION-STATUS.md` for hardening still recommended (e.g. third-party penetration test, SOC 2 control mapping, full OIDC Authorization-Code+PKCE flow, shared-store rate limiting for multi-replica deployments).
