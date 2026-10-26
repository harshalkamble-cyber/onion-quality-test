# Security strategy

## Identity and authorization

- Passwords are hashed using bcrypt with cost factor 12. Public registration creates only `farmer` accounts; first-admin creation is an operator command (`npm run create-admin` or `node dist/seed-admin.js`).
- Access sessions are short-lived JWTs in HttpOnly cookies. Opaque refresh tokens are stored as SHA-256 hashes and rotated on refresh. Revoked/expired refresh tokens are rejected.
- Unsafe requests authenticated by cookies require a matching double-submit CSRF token (`csrf_token` cookie plus `X-CSRF-Token` header). SameSite cookies, exact CORS origin and secure production cookies add defense in depth. Bearer-authenticated clients do not use ambient cookies.
- `authenticate` and `requireRole` middleware enforce resource ownership and role-level routes. Farmer scans and reports are queried by both scan ID and `user_id`.
- Admin and inspector access is provisioned by operators. Protect admin creation and deployment secrets with a secret manager and approvals.

## Input and upload safety

- Zod validates API input. SQL queries are parameterized. Request JSON and URL-encoded body limits are small.
- Multer enforces file count and per-file size, then `file-type` verifies JPEG/PNG/WebP signatures. SVG, HTML, archives and arbitrary file types are rejected. Server-generated UUID storage keys prevent path traversal; original names are sanitized and never used as storage paths.
- API and AI service enforce batch limits, image dimensions and pixel count. AI images are decoded and re-encoded into RGB arrays before inference.
- Keep upload data out of logs. Add malware scanning if uploads are retained or shared outside the inference path. Enforce retention and deletion policies.
- Put Nginx/WAF upload limits in front of the API. For larger batches, replace in-memory multipart handling with direct signed uploads to a private object store and server-side validation before enqueueing.

## Network and platform

- TLS is terminated at a managed ingress/load balancer or the included Nginx reverse proxy. Nginx redirects HTTP to HTTPS, enables TLS 1.2/1.3 and emits HSTS and basic browser security headers.
- PostgreSQL, Redis and AI inference should be private network services. The AI API requires a constant-time comparison of a dedicated service token. Do not expose `/v1/analyze` to the public internet.
- Production Redis requires a password. Compose isolates the data network. Kubernetes NetworkPolicy is a starter rule; review against your cluster CNI and monitoring endpoints.
- Docker images run as non-root users and drop Linux capabilities in Kubernetes examples. Use image scanning, SBOMs, signature verification, pinned image digests and patch windows before public launch.
- At rest encryption belongs to the managed database, volume/object-storage and backup layer; configure KMS/Key Vault/Cloud KMS keys. This repository does not implement application-level encryption of each image or database field.

## Production checklist

- Replace every placeholder secret and rotate any secret copied into shell history.
- Set `COOKIE_SECURE=true`; use a real HTTPS origin; keep API/AI/database/Redis ports private.
- Configure managed secret injection, least-privilege service accounts, firewall rules and egress restrictions.
- Enable database TLS, automated backups, PITR, storage encryption, access logging and restore drills.
- Configure rate limits at both edge and API. The built-in Express limiter is process-local; at multiple API replicas, replace it with a shared Redis-backed limiter before relying on it as a global quota.
- Add email/phone verification and abuse controls before opening signup to the public. Add MFA for administrator accounts before operational use.
- Configure dependency scanning, static analysis, container scanning, vulnerability patching and incident response.
- Ensure analytics and audit logs never contain passwords, cookies, raw image bytes, API secrets or unnecessary farmer personal data.
- Assess applicable Indian privacy, data-protection, consent, agriculture and consumer rules with qualified counsel for the real deployment and retention policy.

## Threat boundaries and limitations

The repository is a security-minded baseline, not a completed independent penetration test. It needs a production-specific security review, DAST, dependency review and authorization tests. `Helmet`, JWT and TLS are components, not a magical force field.
