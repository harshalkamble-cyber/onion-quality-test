# Testing strategy

## Automated checks in this repository

- `apps/api`: `npm run typecheck`, `npm test`, `npm run build`; the repository includes deterministic tests for star-label mapping and grade-distribution reconciliation.
- `apps/web`: `npx tsc --noEmit`, `npm run build`.
- `apps/ai`: Python `compileall`, Pydantic schema tests in `apps/ai/tests`.
- `.github/workflows/ci.yml`: executes the checks and builds all three container images.

The included automated tests are deliberately small. They are not a substitute for complete end-to-end, security, model-quality, accessibility, and load testing.

## Required test matrix before production

| Area | Cases | Exit criterion |
|---|---|---|
| Authentication | Farmer register/login/logout, refresh rotation, expired/revoked refresh, invalid password, disabled user | No session escalation; tokens invalidated as specified |
| RBAC/data isolation | Farmer A tries to read Farmer B scan/report/CSV; inspector routes; admin-only retraining | 403/404 without data leakage; only permitted roles succeed |
| CSRF/CORS | Cookie write without token, mismatched token, malicious origin, bearer client behavior | Unsafe cookie writes rejected; only approved origin accepted |
| Upload | Wrong MIME signature, SVG/polyglot, empty/corrupt file, huge dimensions, >15 MB file, >100 MB batch, too many files, path-like names | Rejected before inference; no unexpected file writes |
| Queue | Redis unavailable, AI unavailable, job retry, duplicate queue ID, worker killed, DB transaction rollback | No silent loss; safe final status and retriable failure behavior |
| AI inference | No detections, many onions, overlapped onions, quality classes, unknown class label, confidence edge, defect classes present/absent | No fabricated rating; mappings/counts/reasons align with reviewed ground truth |
| Reports | Per-onion count equals grouped grade sum, average score, CSV escaping/BOM, report ownership | Counts reconcile and exports contain no other user's information |
| PWA/offline | Cached shell navigation, IndexedDB queue, reconnect with valid session, reconnect without auth, browser storage disabled | Pending photos stay local until the API accepts them; clear status/error shown |
| Accessibility | Keyboard-only navigation, visible focus, screen reader names, contrast, reduced motion, 200% zoom | WCAG 2.2 AA review passes for supported routes |
| Mobile | Low-cost Android browser, camera input, 3G throttling, rotated photos, 320px viewport | No clipped controls; upload feedback visible; memory remains stable |
| Database | Migration from empty and previous version, concurrent writes, restore/PITR drill | No data corruption; restore RTO/RPO meet agreed policy |
| Model quality | Per-grade precision/recall, calibration, farm/lot holdout, lighting/variety subgroups, bias review | Domain expert signs off against the release gates in model-card.md |
| Performance | 1/5/10/30 image batches, 100+ onions per batch, CPU and GPU, queue backlog and concurrent farmers | p95/p99 and error-rate targets met on production-like infrastructure |

## Manual smoke test

1. Register a farmer. Confirm `GET /api/auth/me` resolves to that account.
2. Sign in, upload a clear test image and confirm the API returns `202` quickly with a scan ID.
3. Follow the scan until `completed`; compare `onion_count` with the number of `ai_predictions` records.
4. Confirm the sum of five `ratings.onion_count` groups equals the number of individual predictions. Confirm distribution percentages sum to approximately 100% when onions were detected.
5. Download the CSV, inspect quoting and ensure no prices exist in JSON or CSV.
6. Sign in as another farmer and confirm the first account's scan UUID is not readable.
7. Verify `/health/ready`, AI `/health/ready`, `/metrics`, logs and alert delivery.
8. Try an invalid image and a clear image with no onions. Ensure the API rejects invalid image data and the AI returns zero detections without fabricated stars.

## Load-test example

A starter k6 script lives at `tests/load/scans.js`. Run it against a non-production environment with a representative approved test image:

```bash
k6 run \
  -e BASE_URL=https://staging.example.org \
  -e TEST_USER_EMAIL=load-test-farmer@example.org \
  -e TEST_USER_PASSWORD='use-a-test-secret' \
  -e TEST_IMAGE_PATH=./tests/fixtures/onion-lot.jpg \
  tests/load/scans.js
```

The script creates scans and polls status. Use distinct test accounts/fixtures, monitor DB/Redis/GPU metrics and clean up test data under an approved policy. Do not point load tests at a real farmer production environment.
