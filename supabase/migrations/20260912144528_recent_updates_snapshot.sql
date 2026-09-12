-- Public news metadata. Only the dedicated server runtime can access storage.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'streetwise_updates_runtime') THEN
    CREATE ROLE streetwise_updates_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'streetwise_updates_runtime' AND (rolbypassrls OR rolcanlogin OR rolsuper)) THEN
    RAISE EXCEPTION 'streetwise_updates_runtime must be a NOLOGIN NOBYPASSRLS group role';
  END IF;
END $$;

CREATE TABLE public.recent_updates_snapshot (
  id text PRIMARY KEY CHECK (id = 'latest'),
  snapshot jsonb NOT NULL CHECK ((
    jsonb_typeof(snapshot) = 'object'
    AND snapshot->>'schemaVersion' = '1.0'
    AND jsonb_typeof(snapshot->'checkedAt') = 'string'
    AND octet_length(snapshot::text) <= 256000
  ) IS TRUE)
);
ALTER TABLE public.recent_updates_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_updates_snapshot FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.recent_updates_snapshot FROM PUBLIC;
-- Supabase can assign table privileges through default grants. Remove them explicitly.
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = target) THEN
      EXECUTE format('REVOKE ALL ON public.recent_updates_snapshot FROM %I', target);
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO streetwise_updates_runtime;
GRANT SELECT, INSERT, UPDATE ON public.recent_updates_snapshot TO streetwise_updates_runtime;
CREATE POLICY recent_updates_read ON public.recent_updates_snapshot
  FOR SELECT TO streetwise_updates_runtime USING (id = 'latest');
CREATE POLICY recent_updates_insert ON public.recent_updates_snapshot
  FOR INSERT TO streetwise_updates_runtime WITH CHECK (id = 'latest');
CREATE POLICY recent_updates_update ON public.recent_updates_snapshot
  FOR UPDATE TO streetwise_updates_runtime USING (id = 'latest') WITH CHECK (id = 'latest');
-- Provisioning must grant this group to a separate NOBYPASSRLS runtime login.
-- Use that login only through RECENT_UPDATES_DATABASE_URL. Do not grant browser roles membership.
