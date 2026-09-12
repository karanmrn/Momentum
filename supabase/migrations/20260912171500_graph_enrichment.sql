-- Extend the derived graph without changing session RLS or endpoint permissions.
ALTER TABLE public.streetwise_semantic_nodes
  DROP CONSTRAINT IF EXISTS streetwise_semantic_nodes_node_type_check;
ALTER TABLE public.streetwise_semantic_nodes
  ADD CONSTRAINT streetwise_semantic_nodes_node_type_check CHECK (node_type IN (
    'Area','Place','Source','PublishedNotice','DatasetCoverage','SourceSnapshot',
    'PoliceRecord','ResearchArea','AreaContext','FictionalObservation','FictionalSummary','HelpLocation',
    'EnrichmentSnapshot','HistoricalAggregate','PoliceOutcome','AvailabilityAssertion','DatasetRecord'
  ));
ALTER TABLE public.streetwise_semantic_assertions
  DROP CONSTRAINT IF EXISTS streetwise_semantic_assertion_pairs;
ALTER TABLE public.streetwise_semantic_assertions
  ADD CONSTRAINT streetwise_semantic_assertion_pairs CHECK ((
    (predicate = 'SAME_OPERATIONAL_ISSUE_AS' AND subject_type = 'PublishedNotice' AND object_type = 'PublishedNotice' AND subject_id <> object_id AND data ?& ARRAY['synthetic','methodVersion','qualification'] AND data->>'synthetic' = 'true' AND data->>'methodVersion' = 'fictional-relations/1' AND jsonb_typeof(data->'qualification') = 'object') OR
    (predicate = 'EXTRACTED_FROM' AND subject_type IN ('HistoricalAggregate','PoliceOutcome') AND object_type = 'EnrichmentSnapshot' AND data->>'methodVersion' = 'enrichment-projection/1' AND data->>'synthetic' = 'false') OR
    (predicate = 'OUTCOME_FOR' AND subject_type = 'PoliceOutcome' AND object_type = 'PoliceRecord' AND data->>'methodVersion' = 'enrichment-projection/1' AND data->>'synthetic' = 'false') OR
    (predicate = 'AVAILABILITY_FOR' AND subject_type = 'AvailabilityAssertion' AND object_type IN ('HelpLocation','Place') AND data->>'methodVersion' = 'availability-projection/1' AND data->>'synthetic' = 'false') OR
    (predicate = 'WITHIN_AREA' AND subject_type IN ('Place','DatasetCoverage') AND object_type = 'Area') OR
    (predicate = 'AFFECTS_PLACE' AND subject_type = 'PublishedNotice' AND object_type = 'Place') OR
    (predicate = 'ISSUED_BY' AND subject_type IN ('PublishedNotice','DatasetCoverage','HelpLocation','Place','DatasetRecord') AND object_type = 'Source') OR
    (predicate = 'CONTEXTUAL_HISTORY_FOR' AND subject_type = 'DatasetCoverage' AND object_type = 'PublishedNotice') OR
    (predicate = 'DERIVED_FROM' AND ((subject_type = 'PoliceRecord' AND object_type = 'SourceSnapshot') OR
      (subject_type = 'FictionalSummary' AND object_type = 'FictionalObservation'))) OR
    (predicate = 'CONTEXTUAL_AREA_ONLY' AND (
      (subject_type IN ('PoliceRecord','AreaContext','FictionalObservation') AND object_type = 'ResearchArea') OR
      (subject_type IN ('ResearchArea','HelpLocation','Place','HistoricalAggregate','DatasetRecord') AND object_type = 'Area')))
  ) IS TRUE);

ALTER TABLE public.streetwise_semantic_assertions
  DROP CONSTRAINT IF EXISTS streetwise_semantic_source_qualification;
ALTER TABLE public.streetwise_semantic_assertions
  ADD CONSTRAINT streetwise_semantic_source_qualification CHECK ((
    CASE WHEN data->>'methodVersion' IN ('enrichment-projection/1','availability-projection/1') THEN
      jsonb_typeof(data->'sourceQualification') = 'object' AND
      data->'sourceQualification'->>'visibility' = 'public_context' AND
      data->'sourceQualification'->>'lifecycle' = 'dated_source_snapshot' AND
      data->'sourceQualification'->>'independence' = 'unknown' AND
      data->'sourceQualification'->>'alertEligible' = 'false'
    ELSE NOT (data ? 'sourceQualification') END
  ) IS TRUE);
