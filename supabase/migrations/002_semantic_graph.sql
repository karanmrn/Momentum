-- Derived demonstration graph. The session state remains authoritative.
CREATE TABLE IF NOT EXISTS public.streetwise_semantic_snapshots (
  session_id text NOT NULL REFERENCES public.streetwise_demo_sessions(id) ON DELETE CASCADE,
  pilot_id text NOT NULL CHECK (pilot_id IN ('hounslow_town_centre','camden_town','west_croydon')),
  metadata jsonb NOT NULL CHECK (metadata->>'ontologyVersion' = '1.0'),
  PRIMARY KEY (session_id, pilot_id)
);
CREATE TABLE IF NOT EXISTS public.streetwise_semantic_nodes (
  session_id text NOT NULL,
  pilot_id text NOT NULL,
  id text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('Area','Place','Source','PublishedNotice','DatasetCoverage')),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 99),
  data jsonb NOT NULL CHECK (data->>'id' = id AND data->>'type' = node_type),
  PRIMARY KEY (session_id, pilot_id, id),
  UNIQUE (session_id, pilot_id, id, node_type),
  FOREIGN KEY (session_id,pilot_id) REFERENCES public.streetwise_semantic_snapshots ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.streetwise_semantic_assertions (
  session_id text NOT NULL,
  pilot_id text NOT NULL,
  id text NOT NULL,
  subject_id text NOT NULL,
  subject_type text NOT NULL,
  object_id text NOT NULL,
  object_type text NOT NULL,
  predicate text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 199),
  data jsonb NOT NULL CHECK (data->>'id' = id AND data->>'subjectId' = subject_id AND data->>'objectId' = object_id AND data->>'predicate' = predicate),
  PRIMARY KEY (session_id,pilot_id,id),
  FOREIGN KEY (session_id,pilot_id,subject_id,subject_type) REFERENCES public.streetwise_semantic_nodes(session_id,pilot_id,id,node_type) ON DELETE CASCADE,
  FOREIGN KEY (session_id,pilot_id,object_id,object_type) REFERENCES public.streetwise_semantic_nodes(session_id,pilot_id,id,node_type) ON DELETE CASCADE,
  CHECK (
    (predicate = 'WITHIN_AREA' AND subject_type IN ('Place','DatasetCoverage') AND object_type = 'Area') OR
    (predicate = 'AFFECTS_PLACE' AND subject_type = 'PublishedNotice' AND object_type = 'Place') OR
    (predicate = 'ISSUED_BY' AND subject_type IN ('PublishedNotice','DatasetCoverage') AND object_type = 'Source') OR
    (predicate = 'CONTEXTUAL_HISTORY_FOR' AND subject_type = 'DatasetCoverage' AND object_type = 'PublishedNotice')
  )
);
ALTER TABLE public.streetwise_semantic_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetwise_semantic_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.streetwise_semantic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetwise_semantic_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.streetwise_semantic_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetwise_semantic_assertions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.streetwise_semantic_snapshots, public.streetwise_semantic_nodes, public.streetwise_semantic_assertions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.streetwise_semantic_snapshots, public.streetwise_semantic_nodes, public.streetwise_semantic_assertions TO streetwise_demo_app;
DROP POLICY IF EXISTS isolated_semantic_snapshot ON public.streetwise_semantic_snapshots;
CREATE POLICY isolated_semantic_snapshot ON public.streetwise_semantic_snapshots TO streetwise_demo_app
USING (session_id = current_setting('app.demo_session',true) AND EXISTS (SELECT 1 FROM public.streetwise_demo_sessions WHERE id = session_id))
WITH CHECK (session_id = current_setting('app.demo_session',true) AND EXISTS (SELECT 1 FROM public.streetwise_demo_sessions WHERE id = session_id));
DROP POLICY IF EXISTS isolated_semantic_node ON public.streetwise_semantic_nodes;
CREATE POLICY isolated_semantic_node ON public.streetwise_semantic_nodes TO streetwise_demo_app
USING (session_id = current_setting('app.demo_session',true) AND EXISTS (SELECT 1 FROM public.streetwise_demo_sessions WHERE id = session_id))
WITH CHECK (session_id = current_setting('app.demo_session',true) AND EXISTS (SELECT 1 FROM public.streetwise_demo_sessions WHERE id = session_id));
DROP POLICY IF EXISTS isolated_semantic_assertion ON public.streetwise_semantic_assertions;
CREATE POLICY isolated_semantic_assertion ON public.streetwise_semantic_assertions TO streetwise_demo_app
USING (session_id = current_setting('app.demo_session',true) AND EXISTS (SELECT 1 FROM public.streetwise_demo_sessions WHERE id = session_id))
WITH CHECK (session_id = current_setting('app.demo_session',true) AND EXISTS (SELECT 1 FROM public.streetwise_demo_sessions WHERE id = session_id));
