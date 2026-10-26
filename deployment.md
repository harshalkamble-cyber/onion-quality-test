# Deployment guide

## Prerequisites

- A supported Kubernetes platform or Docker host, domain name, TLS certificate, secret manager and CI registry.
- PostgreSQL 17 and Redis 7 endpoints with encryption, backup and access controls.
- The two validated model artifacts and an appropriate CPU/GPU node pool.
- A dataset/model owner, grading rubric owner, on-call owner and an incident/rollback procedure.

## Docker Compose deployment

### Local/staging

```bash
cp .env.example .env
# Edit .env; replace every CHANGE_ME with unique random values.
mkdir -p certs models
# Put approved weights in models/ (see models/README.md)
docker compose -f compose.yaml up --build -d
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs -f api worker ai
```

The local web UI is on port 3000 and the API on 4000, both bound to loopback. PostgreSQL, Redis and AI are not published on the host. Use `docker compose --profile monitoring -f compose.yaml up -d prometheus` to start the local Prometheus service.

### Host production behind Nginx

1. Configure `.env` with the production domain, `WEB_ORIGIN=https://your-domain.example`, `NEXT_PUBLIC_API_URL=/api`, `NODE_ENV=production`, `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, production-grade random secrets and approved model version.
2. Install full-chain TLS certificate at `certs/fullchain.pem` and private key at `certs/privkey.pem`, with restrictive permissions. Automate certificate rotation.
3. Use the Nginx service only after checking the configuration and running `nginx -t` against it in a staging deployment.
4. Run `docker compose --profile production -f compose.yaml up --build -d`. Only Nginx ports 80/443 should be public; API and web loopback port mappings are host-local. Apply host firewall rules and keep SSH administration restricted.
5. Verify `https://your-domain.example`, `/health/ready`, `https://your-domain.example/api/auth/me` while signed in, and `/api/docs` is unavailable in production.
6. Create a first admin account using the documented one-time command, then remove credentials from shell history and rotate if they were exposed.

Compose is useful for a single host, pilot or staging. It is not multi-zone HA and does not by itself deliver a 99.9% uptime target.

## Kubernetes deployment

The files in `infra/k8s/` are templates. They need image names, storage class, domains, secrets, TLS, resource requests and policies adapted for the target cluster. Do not run all templates blindly; `storage.yaml` intentionally contains a placeholder storage class.

1. Create the namespace and a secret through your cloud secret manager/External Secrets Operator. Do **not** commit a filled-in Secret manifest. If using the template manually, copy `infra/k8s/secret.example.yaml.template`, replace every value, put the resulting file in a local ignored path, and apply it only to the intended cluster.
2. Set `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_PASSWORD`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `AI_SERVICE_TOKEN`, `AUDIT_HASH_SALT`, and `ML_PIPELINE_CALLBACK_TOKEN`. Use independent random values; database URL password must match the database password.
3. Set the correct cloud `storageClassName` in `infra/k8s/storage.yaml` (AWS EFS CSI, Azure Files CSI, Google Filestore CSI, or another audited RWX class). The API and worker must share `/data/uploads`; the AI pod mounts `/models` read-only. Install model weights using a controlled artifact delivery process.
4. Build and push immutable container tags or digests for `onion-quality-web`, `onion-quality-api`, and `onion-quality-ai`. Build the web image with `NEXT_PUBLIC_API_URL=/api` so browser requests use the same public origin. Replace image placeholders in `api.yaml`, `worker.yaml`, `web.yaml` and `ai.yaml`.
5. Prefer managed PostgreSQL/Redis instead of the in-cluster sample StatefulSets for public production. If using managed services, point `DATABASE_URL` and `REDIS_URL` at the private service endpoints and omit `postgres.yaml`/`redis.yaml` from the applied set.
6. Run the schema through a migration job. Example: `kubectl -n oniongrade create configmap oniongrade-schema --from-file=schema.sql=db/schema.sql` and run a restricted migration job against the database. Do not bake cloud database passwords into migration image layers.
7. Apply the namespace, secret/config, storage, and the selected service manifests in dependency order. Install an ingress controller and cert-manager (or create `oniongrade-tls` through your cloud certificate mechanism). Set the Ingress hostname and certificate secret.
8. Enable a metrics-server for HPAs, configure external Prometheus/Grafana/Alertmanager, and run the smoke/load/restore tests before routing public traffic.

### Cloud notes

- **AWS:** EKS, managed PostgreSQL (RDS/Aurora), ElastiCache Redis, EFS CSI for shared uploads, ECR, ACM/ALB or Nginx ingress, CloudWatch, KMS, WAF and an S3 artifact bucket. Add IAM Roles for Service Accounts and private subnets.
- **Azure:** AKS, Azure Database for PostgreSQL, Azure Managed Redis/approved Redis service, Azure Files CSI for shared uploads, ACR, Key Vault CSI, Application Gateway/WAF, Azure Monitor and managed disk/backup encryption.
- **Google Cloud:** GKE, Cloud SQL for PostgreSQL, Memorystore Redis, Filestore CSI for shared uploads, Artifact Registry, Secret Manager CSI, Cloud Load Balancing/Cloud Armor, Cloud Logging/Monitoring and KMS.

Service names and storage drivers vary by cloud. The Kubernetes manifests are a portability baseline, not a cloud account configured on your behalf.

## CI/CD

`.github/workflows/ci.yml` runs API TypeScript checks/build, frontend TypeScript/build, Python syntax/schema tests and container builds. For a production pipeline, add signed image publication to a registry, SCA/SAST/container scanning, SBOM generation, provenance attestation, staged deployment, automated smoke tests and a human approval gate.

`.github/workflows/retrain-model.yml` is manually dispatched by the admin retraining API if configured. It requires a self-hosted GPU runner labelled `self-hosted`, `linux`, `gpu` and these GitHub secrets:

- `ONION_DETECTOR_DATASET_URL`: HTTPS URL for approved detector archive containing `data.yaml` and image/label directories.
- `ONION_CLASSIFIER_DATASET_URL`: HTTPS URL for a classifier archive with `train/` and `val/` subdirectories for all five star classes.
- `DATASET_DOWNLOAD_TOKEN`: least-privilege bearer token for those archives.
- `RETRAIN_CALLBACK_API_URL`: base API URL ending in `/api`.
- `ML_PIPELINE_CALLBACK_TOKEN`: the same high-entropy token as the API deployment.

Set the API environment variables `ML_RETRAIN_GITHUB_TOKEN`, `ML_RETRAIN_GITHUB_REPOSITORY`, `ML_RETRAIN_GITHUB_WORKFLOW=retrain-model.yml` and `ML_RETRAIN_GITHUB_REF`. The workflow creates a candidate weights artifact; it does not activate weights. Review evaluation and approval before deployment.

## Rollback

Deploy previous immutable image digests and model artifact hashes; retain the DB backup/restore point, current secret versions and schema version. Never roll back database changes that are not backward-compatible with the old release. Run a smoke scan on a pre-approved test image before restoring normal traffic.
