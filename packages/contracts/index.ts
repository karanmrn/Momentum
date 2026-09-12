import { z } from "zod";
export const pilotSchema = z.enum([
  "hounslow_town_centre",
  "camden_town",
  "west_croydon",
]);
export type PilotId = z.infer<typeof pilotSchema>;
export const categorySchema = z.enum([
  "infrastructure",
  "transport",
  "access",
  "community",
]);
export type Category = z.infer<typeof categorySchema>;
export const personaSchema = z.enum(["alex", "sam", "moderator"]);
export type Persona = z.infer<typeof personaSchema>;
export const areas: Area[] = [
  {
    id: "hounslow_town_centre",
    name: "Hounslow town centre",
    shortName: "Hounslow",
    center: [51.4683, -0.3618],
    place: "High Street approach",
    boundaryStatus: "Review pending",
    reportUrl: "https://fms.hounslowhighways.org/",
  },
  {
    id: "camden_town",
    name: "Camden Town centre",
    shortName: "Camden Town",
    center: [51.5392, -0.1426],
    place: "Camden High Street approach",
    boundaryStatus: "Review pending",
    reportUrl: "https://www.camden.gov.uk/love-clean-streets",
  },
  {
    id: "west_croydon",
    name: "West Croydon",
    shortName: "West Croydon",
    center: [51.3784, -0.1023],
    place: "London Road approach",
    boundaryStatus: "Review pending",
    reportUrl: "https://www.croydon.gov.uk/lovecleanstreets",
  },
];
export interface Area {
  id: PilotId;
  name: string;
  shortName: string;
  center: [number, number];
  place: string;
  boundaryStatus: string;
  reportUrl: string;
}
export interface Evidence {
  id: string;
  label: string;
  sourceKind:
    | "community_firsthand"
    | "official_operator"
    | "council_directory"
    | "map_inventory";
  sourceUrl: string | null;
  sourceFamilyId: string;
  originGroupId: string;
  observedAt: string;
  fetchedAt: string | null;
  precision: "approximate_place" | "aggregate_area";
  synthetic: boolean;
}
export interface TimelineEntry {
  revision: number;
  status: string;
  at: string;
  summary: string;
}
export interface Notice {
  id: string;
  revision: number;
  pilotId: PilotId;
  category: Category;
  title: string;
  summary: string;
  place: string;
  status: "active" | "resolved" | "retracted" | "superseded";
  observedAt: string;
  updatedAt: string;
  synthetic: true;
  reviewStatus: "publication_approved";
  sourceKind: "community_firsthand";
  evidence: Evidence[];
  timeline: TimelineEntry[];
  reason?: string;
}
export interface Report {
  id: string;
  revision: number;
  owner: Persona;
  pilotId: PilotId;
  category: Category;
  title: string;
  description: string;
  place: string;
  observedAt: string;
  status: "submitted" | "approved_for_summary" | "rejected" | "withdrawn";
  createdAt: string;
  noticeId: string | null;
  synthetic: true;
}
export interface Preferences {
  revision: number;
  areas: PilotId[];
  categories: Category[];
  inAppEnabled: boolean;
}
export interface Notification {
  id: string;
  noticeId: string;
  revision: number;
  recipient: Persona;
  kind: "notice" | "correction";
  state: "queued" | "delivered" | "suppressed";
  createdAt: string;
  message: string;
}
export interface GraphNode {
  id: string;
  type: "notice" | "observation" | "place" | "source";
  label: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  predicate: "DERIVED_FROM" | "AFFECTS_PLACE" | "ISSUED_BY";
  reason: string;
}
export interface EvidenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  limitations: string[];
}
export interface SourceCard {
  id: string;
  title: string;
  summary: string;
  url: string;
  status: "available" | "unavailable" | "link_only";
  sourceKind: string;
  fetchedAt: string | null;
  publishedAt: string | null;
  synthetic: false;
  scope: string;
}
export interface HelpCard {
  id: string;
  pilotId: PilotId;
  name: string;
  summary: string;
  url: string;
  availability: "unconfirmed";
  schedule: string | null;
}
export interface DemoState {
  schemaVersion: "1.0";
  reports: Report[];
  notices: Notice[];
  preferences: Record<Persona, Preferences>;
  notifications: Notification[];
  idempotency: Record<string, { fingerprint: string; result: unknown }>;
}
export interface SessionView {
  persona: Persona;
  synthetic: true;
  moderatorAreas: PilotId[];
}
export const reportInputSchema = z
  .object({
    pilotId: pilotSchema,
    category: categorySchema,
    title: z.string().trim().min(5).max(100),
    description: z.string().trim().min(5).max(600),
    place: z.string().trim().min(3).max(100),
    observedAt: z.string().datetime({ offset: true }),
    synthetic: z.literal(true),
  })
  .strict();
export type ReportInput = z.infer<typeof reportInputSchema>;
export const decisionSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    action: z.enum(["approve", "reject", "resolve", "retract"]),
    summary: z.string().trim().min(5).max(600),
  })
  .strict();
export type DecisionInput = z.infer<typeof decisionSchema>;
export const preferencesSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    areas: z.array(pilotSchema).min(1).max(3),
    categories: z.array(categorySchema).min(1).max(4),
    inAppEnabled: z.boolean(),
  })
  .strict();
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export interface Envelope<T> {
  schemaVersion: "1.0";
  synthetic: boolean;
  generatedAt: string;
  data: T;
  coverage: {
    sourceId: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
  }[];
}
export interface Store {
  read(sessionId: string): Promise<DemoState>;
  mutate<T>(
    sessionId: string,
    fn: (state: DemoState) => T | Promise<T>,
  ): Promise<T>;
}
