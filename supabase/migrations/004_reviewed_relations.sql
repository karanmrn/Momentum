-- Extend the derived projection for reviewed fictional operational relations.
ALTER TABLE public.streetwise_semantic_assertions
  DROP CONSTRAINT IF EXISTS streetwise_semantic_assertion_pairs;
ALTER TABLE public.streetwise_semantic_assertions
  ADD CONSTRAINT streetwise_semantic_assertion_pairs CHECK ((
    (predicate = 'SAME_OPERATIONAL_ISSUE_AS' AND subject_type = 'PublishedNotice' AND object_type = 'PublishedNotice' AND subject_id <> object_id AND data ?& ARRAY['synthetic','methodVersion','qualification'] AND data->>'synthetic' = 'true' AND data->>'methodVersion' = 'fictional-relations/1' AND jsonb_typeof(data->'qualification') = 'object') OR
    (predicate = 'WITHIN_AREA' AND subject_type IN ('Place','DatasetCoverage') AND object_type = 'Area') OR
    (predicate = 'AFFECTS_PLACE' AND subject_type = 'PublishedNotice' AND object_type = 'Place') OR
    (predicate = 'ISSUED_BY' AND subject_type IN ('PublishedNotice','DatasetCoverage','HelpLocation','Place') AND object_type = 'Source') OR
    (predicate = 'CONTEXTUAL_HISTORY_FOR' AND subject_type = 'DatasetCoverage' AND object_type = 'PublishedNotice') OR
    (predicate = 'DERIVED_FROM' AND ((subject_type = 'PoliceRecord' AND object_type = 'SourceSnapshot') OR
      (subject_type = 'FictionalSummary' AND object_type = 'FictionalObservation'))) OR
    (predicate = 'CONTEXTUAL_AREA_ONLY' AND (
      (subject_type IN ('PoliceRecord','AreaContext','FictionalObservation') AND object_type = 'ResearchArea') OR
      (subject_type IN ('ResearchArea','HelpLocation','Place') AND object_type = 'Area')))
  ) IS TRUE);
