-- Extend the existing derived graph. Keep the original session RLS and foreign keys.
ALTER TABLE public.streetwise_semantic_nodes
  DROP CONSTRAINT IF EXISTS streetwise_semantic_nodes_node_type_check;
ALTER TABLE public.streetwise_semantic_nodes
  ADD CONSTRAINT streetwise_semantic_nodes_node_type_check CHECK (node_type IN (
    'Area','Place','Source','PublishedNotice','DatasetCoverage',
    'SourceSnapshot','PoliceRecord','ResearchArea','AreaContext','FictionalObservation','FictionalSummary','HelpLocation'
  ));
ALTER TABLE public.streetwise_semantic_assertions
  DROP CONSTRAINT IF EXISTS streetwise_semantic_assertions_check;
ALTER TABLE public.streetwise_semantic_assertions
  ADD CONSTRAINT streetwise_semantic_assertions_check CHECK (
    data->>'id' = id AND data->>'subjectId' = subject_id AND
    data->>'objectId' = object_id AND data->>'predicate' = predicate
  );
ALTER TABLE public.streetwise_semantic_assertions
  DROP CONSTRAINT IF EXISTS streetwise_semantic_assertions_check1;
ALTER TABLE public.streetwise_semantic_assertions
  DROP CONSTRAINT IF EXISTS streetwise_semantic_assertion_pairs;
ALTER TABLE public.streetwise_semantic_assertions
  ADD CONSTRAINT streetwise_semantic_assertion_pairs CHECK (
    (predicate = 'WITHIN_AREA' AND subject_type IN ('Place','DatasetCoverage') AND object_type = 'Area') OR
    (predicate = 'AFFECTS_PLACE' AND subject_type = 'PublishedNotice' AND object_type = 'Place') OR
    (predicate = 'ISSUED_BY' AND subject_type IN ('PublishedNotice','DatasetCoverage','HelpLocation','Place') AND object_type = 'Source') OR
    (predicate = 'CONTEXTUAL_HISTORY_FOR' AND subject_type = 'DatasetCoverage' AND object_type = 'PublishedNotice') OR
    (predicate = 'DERIVED_FROM' AND ((subject_type = 'PoliceRecord' AND object_type = 'SourceSnapshot') OR
      (subject_type = 'FictionalSummary' AND object_type = 'FictionalObservation'))) OR
    (predicate = 'CONTEXTUAL_AREA_ONLY' AND (
      (subject_type IN ('PoliceRecord','AreaContext','FictionalObservation') AND object_type = 'ResearchArea') OR
      (subject_type IN ('ResearchArea','HelpLocation','Place') AND object_type = 'Area')))
  );
