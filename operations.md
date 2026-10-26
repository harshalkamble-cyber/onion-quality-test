# Operations, logging and monitoring

## Health endpoints

- API liveness: `GET /health/live`
- API readiness: `GET /health/ready` checks PostgreSQL and Redis.
- AI liveness: `GET /health/live`
- AI readiness: `GET /health/ready` reports model readiness, version, device and missing weights.
- Prometheus: API `/metrics`, AI `/metrics`; keep these endpoints on private service networks.

The AI container can be alive while not ready. A missing detector or classifier weight file is a readiness failure by design.

## Logs

The API emits JSON request/error/job logs with request IDs, method, route, HTTP status and duration. The scan worker logs scan identifiers and processing outcomes; the AI service logs request status and inference time. Forward stdout/stderr to CloudWatch, Azure Monitor, Google Cloud Logging, Loki or your approved collector. Add trace IDs across API, BullMQ and AI calls if distributed tracing is enabled.

Do not log authorization headers, tokens, cookies, multipart payloads, original image bytes or full farmer records. Retain logs according to your approved privacy and incident policy.

## Metrics and alerts

The API exports Node process metrics, HTTP request count and duration. AI exports inference call counts and inference duration. `infra/monitoring/prometheus.yml` and `alerts.yml` are sample scrape/alert rules.

Recommended additional metrics before launch:

- scan queue waiting/active/failed depth and oldest-job age;
- inference p50/p95/p99 by batch size, model version and device;
- onions detected per image and no-detection rate;
- low-confidence fraction, farmer feedback rate and manual-review disagreement;
- DB pool wait time, SQL latency, Redis evictions, upload storage capacity and worker restarts;
- cost per scan, GPU utilization/memory and CDN cache hit rate.

Alert on sustained API 5xx rate, scan queue backlog, model-not-ready state, inference timeout rate, disk/PVC utilization, database connection saturation, backup failure and AI p95 latency above the agreed target. Confirm that alert routing reaches a real on-call owner.

## Backup and recovery

Use managed PostgreSQL backups plus point-in-time recovery; back up model artifacts and the label/rubric/version metadata; protect audit records and configuration in a separate account/project; and define a retention policy for original photos. Regularly perform restore drills. Upload storage, database records and model versions must be restored together to keep reports auditable.

## Rollback

1. Stop new scan intake or set a maintenance banner if predictions are suspect.
2. Route workers to a known-good immutable model image/weight digest and redeploy AI pods.
3. Keep queued jobs pending until the correct weights are active; do not silently mix results across model versions.
4. Mark any affected reports for review and notify operators. Preserve the model version recorded on each prediction.
5. Review labels, drift, input conditions and release approval before re-enabling full traffic.
