import { z } from "zod";
import { pilotSchema, type PilotId } from "../../contracts/index";
import { parseOsmAttribute } from "./attributes";

export const OSM_COLLECTION_URL = "https://overpass-api.de/api/interpreter";
export const OSM_PROJECTION_VERSION = "1.0";
export const MAX_OSM_RECORDS = 1000;

const categories = [
  "toilets",
  "library",
  "pharmacy",
  "community_centre",
  "police",
] as const;
const categorySchema = z.enum(categories);
const categoryNames: Record<(typeof categories)[number], string> = {
  toilets: "Toilets",
  library: "Library",
  pharmacy: "Pharmacy",
  community_centre: "Community centre",
  police: "Police facility",
};
// These anchors describe the acquired research circles, not approved pilot boundaries.
const anchors: Record<PilotId, string> = {
  hounslow_town_centre: "51.4683,-0.3618",
  camden_town: "51.5392,-0.1426",
  west_croydon: "51.3784,-0.1023",
};

function expectedQuery(pilotId: PilotId): string {
  return `[out:json][timeout:25][maxsize:16777216];nwr["amenity"~"^(${categories.join("|")})$"]["access"!~"^(private|no)$"](around:1609.344,${anchors[pilotId]});out meta center;`;
}

const text = z.string().max(2000);
const timestamp = z.string().max(40).datetime();
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const tagsSchema = z
  .object({
    amenity: categorySchema,
    name: text.optional(),
    opening_hours: text.optional(),
    access: text.optional(),
    wheelchair: text.optional(),
    fee: text.optional(),
    "toilets:wheelchair": text.optional(),
    "toilets:access": text.optional(),
    "addr:street": text.optional(),
    "addr:housenumber": text.optional(),
    "addr:postcode": text.optional(),
  })
  .strict();

const recordSchema = z
  .object({
    type: z.enum(["node", "way", "relation"]),
    id: integer,
    version: integer,
    timestamp,
    coordinates: z
      .object({
        lat: z.number().finite().min(-90).max(90),
        lon: z.number().finite().min(-180).max(180),
      })
      .strict(),
    coordinateMeaning: z.enum(["mapped_point", "bounding_box_center"]),
    tags: tagsSchema,
    live: z.literal(false),
    helpSchemeMembership: z.literal("not_established"),
    sourceId: z.literal("OSM"),
  })
  .strict()
  .superRefine((record, context) => {
    const expected =
      record.type === "node" ? "mapped_point" : "bounding_box_center";
    if (record.coordinateMeaning !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalid_coordinate_meaning",
      });
    }
    if (
      ["private", "no"].includes(record.tags.access?.trim().toLowerCase() ?? "")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "restricted_access",
      });
    }
  });

const snapshotSchema = z
  .object({
    sourceUrl: z.literal(OSM_COLLECTION_URL),
    query: z.string().max(500),
    fetchedAt: timestamp,
    sourceResponseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    publicationAllowed: z.literal(false),
    synthetic: z.literal(false),
    sourceTimestamp: timestamp,
    records: z.array(recordSchema).max(MAX_OSM_RECORDS),
  })
  .strict();

type Snapshot = z.infer<typeof snapshotSchema>;

function projectRecord(
  record: Snapshot["records"][number],
  snapshot: Snapshot,
  pilotId: PilotId,
) {
  const id = `${record.type}/${record.id}`;
  const statedName = record.tags.name?.trim();
  return {
    id,
    name: statedName || categoryNames[record.tags.amenity],
    nameSource: statedName
      ? ("osm_name" as const)
      : ("category_fallback" as const),
    pilotId,
    category: record.tags.amenity,
    osmType: record.type,
    osmId: record.id,
    sourceRecordKey: id,
    version: record.version,
    timestamp: record.timestamp,
    coordinates: record.coordinates,
    coordinateMeaning: record.coordinateMeaning,
    sourceId: record.sourceId,
    sourceUrl: snapshot.sourceUrl,
    osmUrl: `https://www.openstreetmap.org/${id}`,
    fetchedAt: snapshot.fetchedAt,
    sourceTimestamp: snapshot.sourceTimestamp,
    sourceResponseSha256: snapshot.sourceResponseSha256,
    openingHours: record.tags.opening_hours ?? null,
    openingStatus: "unknown" as const,
    currentAvailability: "unknown" as const,
    helpSchemeMembership: record.helpSchemeMembership,
    access: parseOsmAttribute(record.tags.access),
    wheelchair: parseOsmAttribute(record.tags.wheelchair),
    fee: parseOsmAttribute(record.tags.fee),
    toiletsWheelchair: parseOsmAttribute(record.tags["toilets:wheelchair"]),
    toiletsAccess: parseOsmAttribute(record.tags["toilets:access"]),
    publicationAllowed: false as const,
    visibility: "internal" as const,
    live: false as const,
    synthetic: false as const,
  };
}

export type ResearchPlace = ReturnType<typeof projectRecord>;

interface ProjectionBase {
  projectionVersion: typeof OSM_PROJECTION_VERSION;
  pilotId: PilotId;
  publicationAllowed: false;
  visibility: "internal";
  live: false;
  synthetic: false;
  sourceUrl: typeof OSM_COLLECTION_URL;
  attribution: string;
  licence: "ODbL 1.0";
  licenceUrl: string;
  scope: "research_circle";
  limitations: string[];
}

export type OsmPlaceProjection = ProjectionBase &
  (
    | {
        status: "available" | "empty";
        fetchedAt: string;
        sourceTimestamp: string;
        sourceResponseSha256: string;
        records: ResearchPlace[];
      }
    | {
        status: "unavailable";
        code: "source_unavailable" | "invalid_snapshot";
        fetchedAt: null;
        sourceTimestamp: null;
        sourceResponseSha256: null;
        records: [];
      }
  );

/** Validate an acquired snapshot. This function fetches and publishes nothing. */
export function projectOsmSnapshot(
  input: unknown,
  pilot: PilotId,
  { now = new Date() }: { now?: Date } = {},
): OsmPlaceProjection {
  const pilotId = pilotSchema.parse(pilot);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("invalid_clock");
  const base: ProjectionBase = {
    projectionVersion: OSM_PROJECTION_VERSION,
    pilotId,
    publicationAllowed: false,
    visibility: "internal",
    live: false,
    synthetic: false,
    sourceUrl: OSM_COLLECTION_URL,
    attribution: "© OpenStreetMap contributors",
    licence: "ODbL 1.0",
    licenceUrl: "https://www.openstreetmap.org/copyright",
    scope: "research_circle",
    limitations: [
      "The research circle is not an approved pilot boundary.",
      "Mapped amenities do not confirm current hours, public access, working facilities, or help-scheme membership.",
      "Way and relation centres are bounding-box centres, not entrances.",
      "OSM coverage can be incomplete. Missing records do not establish missing facilities.",
    ],
  };
  const unavailable = (
    code: "source_unavailable" | "invalid_snapshot",
  ): OsmPlaceProjection => ({
    ...base,
    status: "unavailable",
    code,
    fetchedAt: null,
    sourceTimestamp: null,
    sourceResponseSha256: null,
    records: [],
  });
  if (input === null || input === undefined)
    return unavailable("source_unavailable");
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) return unavailable("invalid_snapshot");
  const snapshot = parsed.data;
  const fetched = Date.parse(snapshot.fetchedAt);
  const sourceTime = Date.parse(snapshot.sourceTimestamp);
  if (
    snapshot.query !== expectedQuery(pilotId) ||
    fetched > now.getTime() ||
    sourceTime > fetched
  ) {
    return unavailable("invalid_snapshot");
  }
  const keys = new Set<string>();
  for (const record of snapshot.records) {
    const key = `${record.type}/${record.id}`;
    const revisionTime = Date.parse(record.timestamp);
    if (keys.has(key) || revisionTime > fetched || revisionTime > sourceTime) {
      return unavailable("invalid_snapshot");
    }
    keys.add(key);
  }
  const records = snapshot.records.map((record) =>
    projectRecord(record, snapshot, pilotId),
  );
  return {
    ...base,
    status: records.length ? "available" : "empty",
    fetchedAt: snapshot.fetchedAt,
    sourceTimestamp: snapshot.sourceTimestamp,
    sourceResponseSha256: snapshot.sourceResponseSha256,
    records,
  };
}
