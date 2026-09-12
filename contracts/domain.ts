/** Proposed implementation contract, not a deployed/generated SDK.
 * Thread 00 owns this contract; implement runtime validation separately.
 * No field named `confidence` or `safetyScore` may be added without an ADR.
 */
export type UUID = string;
export type ISODateTime = string;
export type YearMonth = string; // runtime validation: YYYY-MM
export type PilotId = 'hounslow_town_centre' | 'camden_town' | 'west_croydon';
export type Visibility = 'public' | 'pilot_members' | 'owner_private' | 'moderator_private' | 'internal';
export type SourceKind = 'official_operator' | 'official_dataset' | 'council_directory' |
  'authorised_partner' | 'community_firsthand' | 'community_other_source' | 'map_inventory';
export type ReviewStatus = 'unreviewed' | 'in_review' | 'publication_approved' | 'rejected' | 'withdrawn';
export type NoticeStatus = 'scheduled' | 'active' | 'resolved' | 'expired' | 'retracted' | 'superseded';
export type Precision = 'asset_reference' | 'source_exact_place' | 'approximate_place' |
  'anonymised_point' | 'aggregate_area' | 'unknown';
export type TimePrecision = 'exact_source_interval' | 'reported_interval' | 'day' | 'month' | 'unknown';
export type RelationType = 'WITHIN_AREA' | 'LOCATED_AT' | 'AFFECTS_PLACE' | 'DESCRIBES_ASSET' |
  'ISSUED_BY' | 'DERIVED_FROM' | 'EXTRACTED_BY' | 'HAS_SOURCE_REVISION' | 'SUPERSEDES' |
  'RETRACTS' | 'POSSIBLE_DUPLICATE_OF' | 'MEMBER_OF_REVIEW_CLUSTER' | 'CONTRADICTS' |
  'SAME_OPERATIONAL_ISSUE_AS' | 'CONTEXTUAL_HISTORY_FOR' | 'ANALYSIS_ASSOCIATION' | 'HELP_NEAR_PLACE';
export type InferenceType = 'source_statement' | 'deterministic_join' | 'human_review' |
  'candidate_similarity' | 'statistical_analysis';
export type RelationStatus = 'candidate' | 'supported_for_stated_scope' | 'rejected' | 'retracted' | 'superseded';
export interface Provenance {
  sourceId: string;
  sourceFamilyId: string; // dataset/publisher family, not an event identity
  originGroupId: string | null; // original claim lineage; unknown stays null
  sourceRecordKey: string | null;
  snapshotId: UUID | null;
  sourceUrl: string | null;
  sourcePublishedAt: ISODateTime | null;
  observedFrom: ISODateTime | null;
  observedTo: ISODateTime | null;
  fetchedAt: ISODateTime | null;
  parserVersion: string | null;
}
export interface TemporalValidity {
  validFrom: ISODateTime | null;
  validTo: ISODateTime | null;
  expiresAt: ISODateTime | null;
  reviewedAt: ISODateTime | null;
  reviewDueAt: ISODateTime | null;
  timePrecision: TimePrecision;
  timezone: 'Europe/London';
}
export interface EvidenceDimensions {
  sourceKind: SourceKind;
  sourceAuthorityScope: string;
  spatialPrecision: Precision;
  timePrecision: TimePrecision;
  independence: 'independent_origin_supported' | 'shared_origin' | 'unknown';
  coverage: 'declared_complete_for_scope' | 'partial' | 'unknown';
  freshness: 'within_review_window' | 'stale' | 'unknown';
  reviewStatus: ReviewStatus;
}
export interface PublishedNotice {
  id: UUID;
  revision: number;
  pilotId: PilotId;
  placeIds: UUID[];
  category: string; // runtime enum is versioned separately from source offence categories
  title: string;
  publicSummary: string;
  sourceSupportedAction: string | null;
  status: NoticeStatus;
  visibility: 'public' | 'pilot_members';
  provenance: Provenance[];
  temporal: TemporalValidity;
  evidence: EvidenceDimensions;
  evidenceAssertionIds: UUID[];
  synthetic: boolean;
}
export interface GraphAssertion {
  id: UUID;
  subjectId: UUID;
  predicate: RelationType;
  objectId: UUID;
  evidenceRefs: UUID[];
  inferenceType: InferenceType;
  reasonCodes: string[];
  methodVersion: string;
  relationStatus: RelationStatus;
  visibility: Visibility;
  validFrom: ISODateTime | null;
  validTo: ISODateTime | null;
  recordedAt: ISODateTime;
  retiredAt: ISODateTime | null;
  reviewerId: UUID | null; // never exposed in public response unless explicitly approved
  supersedesAssertionId: UUID | null;
  synthetic: boolean;
}
export interface PreferenceWindow {
  weekdays: number[]; // ISO weekdays 1..7
  startLocal: string; // HH:mm
  endLocal: string; // overnight spans explicitly supported
}
export interface UserPreferences {
  userId: UUID; // owner-private; not included in public graph
  revision: number;
  followedAreaIds: PilotId[];
  followedPlaceIds: UUID[];
  selectedCategories: string[];
  transportModes: string[];
  presentationNeeds: Array<'step_free_information' | 'text_first' | 'reduced_motion'>;
  language: string;
  timezone: 'Europe/London';
  travelWindows: PreferenceWindow[];
  quietHours: PreferenceWindow[];
  inAppEnabled: boolean;
  externalPushOptInAt: ISODateTime | null;
  historicalDigestOptIn: boolean;
}
export interface RelevanceExplanation {
  reasonCodes: Array<'follows_area' | 'follows_station' | 'selected_category' |
    'selected_access_updates' | 'within_chosen_time_window' | 'correction_to_seen_notice'>;
  ruleVersion: string;
  humanReadable: string;
}
export interface PublicApiEnvelope<T> {
  schemaVersion: '1.0';
  generatedAt: ISODateTime;
  synthetic: boolean;
  data: T;
  coverage: Array<{sourceId: string; periodStart: string | null; periodEnd: string | null;
    status: 'available' | 'partial' | 'stale' | 'unavailable' | 'not_configured'}>;
}
export interface AssociationResult {
  id: UUID;
  status: 'insufficient_comparable_data' | 'ineligible_measurement' | 'analysis_pending_review' | 'reviewed_descriptive' | 'reviewed_inferential';
  researchQuestionId: string;
  sourceSeriesIds: string[];
  methodVersion: string;
  unit: string;
  commonPeriods: number;
  estimate: number | null;
  interval: [number, number] | null;
  diagnostics: Record<string, number | string | null>;
  limitations: string[];
  synthetic: boolean;
}
