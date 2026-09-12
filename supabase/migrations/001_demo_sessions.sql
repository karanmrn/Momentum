-- Synthetic demonstration storage. This is not the real-report domain schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'streetwise_demo_app') THEN
    CREATE ROLE streetwise_demo_app NOLOGIN;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.streetwise_demo_sessions (
  id text PRIMARY KEY CHECK (length(id) = 64),
  persona text NOT NULL DEFAULT 'alex' CHECK (persona IN ('alex','sam','moderator')),
  state jsonb NOT NULL CHECK (state->>'schemaVersion' = '1.0'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
ALTER TABLE public.streetwise_demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetwise_demo_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.streetwise_demo_sessions FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO streetwise_demo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streetwise_demo_sessions TO streetwise_demo_app;
DROP POLICY IF EXISTS isolated_demo_session ON public.streetwise_demo_sessions;
CREATE POLICY isolated_demo_session ON public.streetwise_demo_sessions TO streetwise_demo_app
USING (id = current_setting('app.demo_session', true) AND expires_at > now())
WITH CHECK (id = current_setting('app.demo_session', true) AND expires_at > now());

CREATE INDEX IF NOT EXISTS streetwise_demo_expiry ON public.streetwise_demo_sessions(expires_at);
