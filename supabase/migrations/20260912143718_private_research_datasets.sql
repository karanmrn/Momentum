-- Acquired source records. These tables do not contain public graph projections.
CREATE SCHEMA research;
REVOKE ALL ON SCHEMA research FROM PUBLIC;

CREATE TABLE research.dataset_artifacts (
  artifact_id text PRIMARY KEY CHECK (artifact_id ~ '^[a-f0-9]{64}$'),
  dataset text NOT NULL CHECK (length(dataset) BETWEEN 1 AND 100),
  relative_path text NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 500),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_count bigint NOT NULL CHECK (byte_count >= 0),
  record_count bigint NOT NULL CHECK (record_count >= 0),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  publication_allowed boolean NOT NULL DEFAULT false CHECK (NOT publication_allowed),
  synthetic boolean NOT NULL DEFAULT false CHECK (NOT synthetic),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE research.dataset_records (
  artifact_id text NOT NULL REFERENCES research.dataset_artifacts(artifact_id),
  record_key text NOT NULL CHECK (length(record_key) BETWEEN 1 AND 1000),
  pilot_id text CHECK (pilot_id IN ('hounslow_town_centre', 'camden_town', 'west_croydon')),
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 1000),
  source_url text CHECK (length(source_url) <= 4000),
  fetched_at timestamptz,
  observed_at text CHECK (length(observed_at) <= 100),
  raw jsonb NOT NULL,
  publication_allowed boolean NOT NULL DEFAULT false CHECK (NOT publication_allowed),
  synthetic boolean NOT NULL DEFAULT false CHECK (NOT synthetic),
  PRIMARY KEY (artifact_id, record_key)
);
CREATE INDEX dataset_records_pilot_source ON research.dataset_records(pilot_id, source_id);

ALTER TABLE research.dataset_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.dataset_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE research.dataset_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.dataset_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA research FROM PUBLIC;

-- Supabase roles can receive default grants. Remove them explicitly when present.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'streetwise_demo_app'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA research FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA research FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
