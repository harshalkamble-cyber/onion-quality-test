CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('farmer', 'admin', 'inspector');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE scan_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'farmer',
  preferred_language VARCHAR(5) NOT NULL DEFAULT 'mr' CHECK (preferred_language IN ('en','hi','mr')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role_created ON users(role, created_at DESC);

CREATE TABLE IF NOT EXISTS farmers (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  farm_name VARCHAR(160),
  village VARCHAR(120),
  district VARCHAR(120),
  state VARCHAR(120) NOT NULL DEFAULT 'Maharashtra',
  farm_size_acres NUMERIC(10,2) CHECK (farm_size_acres IS NULL OR farm_size_acres >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status scan_status NOT NULL DEFAULT 'queued',
  source VARCHAR(20) NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','camera','bulk')),
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  onion_count INTEGER NOT NULL DEFAULT 0 CHECK (onion_count >= 0),
  model_version VARCHAR(80),
  error_code VARCHAR(80),
  error_message TEXT,
  report JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scans_user_created ON scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_status_created ON scans(status, created_at);

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(80) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  width INTEGER,
  height INTEGER,
  onion_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_images_scan ON images(scan_id);

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  quality_stars SMALLINT NOT NULL CHECK (quality_stars BETWEEN 1 AND 5),
  label VARCHAR(40) NOT NULL,
  onion_count INTEGER NOT NULL DEFAULT 0,
  share_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (share_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scan_id, quality_stars)
);
CREATE INDEX IF NOT EXISTS idx_ratings_scan ON ratings(scan_id);

CREATE TABLE IF NOT EXISTS ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  onion_index INTEGER NOT NULL,
  bbox JSONB NOT NULL,
  quality_stars SMALLINT NOT NULL CHECK (quality_stars BETWEEN 1 AND 5),
  confidence NUMERIC(6,5) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  visual_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_predictions_scan ON ai_predictions(scan_id);
CREATE INDEX IF NOT EXISTS idx_predictions_image ON ai_predictions(image_id);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
  format VARCHAR(12) NOT NULL DEFAULT 'json' CHECK (format IN ('json','csv','pdf')),
  report_data JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'system',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(80),
  target_id VARCHAR(120),
  ip_hash VARCHAR(128),
  user_agent VARCHAR(300),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);

CREATE TABLE IF NOT EXISTS system_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_name VARCHAR(120) NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time ON system_metrics(metric_name, recorded_at DESC);

-- Keep updated_at correct without application-specific ORM behavior.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS dataset_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL UNIQUE,
  source_name VARCHAR(255) NOT NULL,
  label_state VARCHAR(20) NOT NULL DEFAULT 'unreviewed' CHECK(label_state IN ('unreviewed','in_review','approved','rejected')),
  image_count INTEGER NOT NULL DEFAULT 1 CHECK(image_count > 0),
  dataset_version VARCHAR(80),
  license_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dataset_assets_state ON dataset_assets(label_state, created_at DESC);

CREATE TABLE IF NOT EXISTS model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(80) NOT NULL UNIQUE,
  detector_hash VARCHAR(128) NOT NULL,
  classifier_hash VARCHAR(128) NOT NULL,
  validation_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  dataset_version VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','validated','active','retired','rejected')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON model_versions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS retraining_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dataset_version VARCHAR(80) NOT NULL,
  requested_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','queued','running','succeeded','failed','cancelled')),
  pipeline_run_id VARCHAR(160),
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_retraining_jobs_status ON retraining_jobs(status, created_at DESC);
