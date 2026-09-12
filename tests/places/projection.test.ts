import { describe, expect, it } from "vitest";
import { type PilotId } from "../../packages/contracts/index";
import {
  MAX_OSM_RECORDS,
  OSM_COLLECTION_URL,
  projectOsmSnapshot,
} from "../../packages/places/src/projection";

const now = new Date("2026-09-12T14:00:00Z");
const pilot: PilotId = "hounslow_town_centre";
const anchors: Record<PilotId, string> = {
  hounslow_town_centre: "51.4683,-0.3618",
  camden_town: "51.5392,-0.1426",
  west_croydon: "51.3784,-0.1023",
};
function record() {
  return {
    type: "node",
    id: 123,
    version: 2,
    timestamp: "2026-09-01T12:00:00Z",
    coordinates: { lat: 51.4683, lon: -0.3618 },
    coordinateMeaning: "mapped_point",
    tags: { amenity: "library", name: "Synthetic library" } as Record<
      string,
      string
    >,
    live: false,
    helpSchemeMembership: "not_established",
    sourceId: "OSM",
  };
}
function snapshot(pilotId: PilotId = pilot) {
  return {
    sourceUrl: OSM_COLLECTION_URL,
    query: `[out:json][timeout:25][maxsize:16777216];nwr["amenity"~"^(toilets|library|pharmacy|community_centre|police)$"]["access"!~"^(private|no)$"](around:1609.344,${anchors[pilotId]});out meta center;`,
    fetchedAt: "2026-09-12T13:10:10.755Z",
    sourceTimestamp: "2026-09-12T13:08:52Z",
    sourceResponseSha256: "a".repeat(64),
    publicationAllowed: false,
    synthetic: false,
    records: [record()],
  };
}
const project = (input: unknown, pilotId: PilotId = pilot) =>
  projectOsmSnapshot(input, pilotId, { now });

describe("internal OSM place projection", () => {
  it("preserves stable identity, source revisions, coordinates and collection provenance", () => {
    const input = snapshot();
    const result = project(input);
    expect(result).toMatchObject({
      status: "available",
      pilotId: pilot,
      visibility: "internal",
      publicationAllowed: false,
      scope: "research_circle",
      live: false,
      synthetic: false,
      sourceTimestamp: input.sourceTimestamp,
      fetchedAt: input.fetchedAt,
      sourceResponseSha256: input.sourceResponseSha256,
      licence: "ODbL 1.0",
    });
    expect(result.records[0]).toMatchObject({
      id: "node/123",
      sourceRecordKey: "node/123",
      osmType: "node",
      osmId: 123,
      name: "Synthetic library",
      nameSource: "osm_name",
      pilotId: pilot,
      category: "library",
      sourceId: "OSM",
      version: 2,
      timestamp: input.records[0].timestamp,
      sourceUrl: OSM_COLLECTION_URL,
      osmUrl: "https://www.openstreetmap.org/node/123",
      coordinates: input.records[0].coordinates,
      coordinateMeaning: "mapped_point",
      fetchedAt: input.fetchedAt,
      sourceTimestamp: input.sourceTimestamp,
      publicationAllowed: false,
    });
  });

  it("keeps stated hours separate from unknown opening and current availability", () => {
    const input = snapshot();
    Object.assign(input.records[0].tags, {
      opening_hours: "24/7",
      wheelchair: "yes",
      fee: "no",
      access: "customers",
    });
    const place = project(input).records[0];
    expect(place).toMatchObject({
      openingHours: "24/7",
      openingStatus: "unknown",
      currentAvailability: "unknown",
      helpSchemeMembership: "not_established",
      wheelchair: { state: "yes", rawValue: "yes" },
      fee: { state: "no", rawValue: "no" },
      access: { state: "unknown", rawValue: "customers" },
      toiletsAccess: { state: "unknown", rawValue: null },
    });
  });

  it("does not infer attributes from a name or category", () => {
    const place = project(snapshot()).records[0];
    expect(place).toMatchObject({
      openingHours: null,
      openingStatus: "unknown",
      currentAvailability: "unknown",
      access: { state: "unknown", rawValue: null },
      wheelchair: { state: "unknown", rawValue: null },
      fee: { state: "unknown", rawValue: null },
      helpSchemeMembership: "not_established",
    });
  });

  it.each(["node", "way", "relation"])(
    "preserves %s identity and coordinate meaning",
    (type) => {
      const input = snapshot();
      input.records[0].type = type;
      input.records[0].coordinateMeaning =
        type === "node" ? "mapped_point" : "bounding_box_center";
      expect(project(input).records[0]).toMatchObject({
        id: `${type}/123`,
        osmType: type,
        coordinateMeaning: input.records[0].coordinateMeaning,
      });
    },
  );

  it("keeps unnamed amenities with an explicit category fallback", () => {
    const input = snapshot();
    delete input.records[0].tags.name;
    expect(project(input).records[0]).toMatchObject({
      name: "Library",
      nameSource: "category_fallback",
    });
    input.records[0].tags.name = "   ";
    expect(project(input).records[0]).toMatchObject({
      name: "Library",
      nameSource: "category_fallback",
    });
  });

  it.each(Object.keys(anchors) as PilotId[])(
    "binds the acquisition query to %s",
    (pilotId) => {
      const result = project(snapshot(pilotId), pilotId);
      expect(result.status).toBe("available");
      expect(result.records[0].pilotId).toBe(pilotId);
    },
  );

  it("rejects a snapshot relabelled as another pilot", () => {
    expect(project(snapshot(), "camden_town")).toMatchObject({
      status: "unavailable",
      code: "invalid_snapshot",
    });
  });

  it("distinguishes a valid empty result from a missing or failed source", () => {
    expect(project({ ...snapshot(), records: [] })).toMatchObject({
      status: "empty",
      records: [],
      fetchedAt: snapshot().fetchedAt,
    });
    for (const input of [null, undefined]) {
      expect(project(input)).toMatchObject({
        status: "unavailable",
        code: "source_unavailable",
        records: [],
        fetchedAt: null,
      });
    }
    const result = project({
      status: "failed",
      detail: "private upstream content",
    });
    expect(result).toMatchObject({
      status: "unavailable",
      code: "invalid_snapshot",
      records: [],
      fetchedAt: null,
    });
    expect(JSON.stringify(result)).not.toContain("private upstream content");
  });

  it.each([
    { sourceUrl: "https://other.example/data" },
    { sourceUrl: `${OSM_COLLECTION_URL}?secret=value` },
    { publicationAllowed: true },
    { synthetic: true },
    { sourceResponseSha256: "invalid" },
    { fetchedAt: "yesterday" },
    { fetchedAt: "2026-09-13T00:00:00Z" },
    { sourceTimestamp: "2026-09-13T00:00:00Z" },
    { query: "unbounded query" },
    { privateBody: "unapproved field" },
  ])("rejects invalid snapshot metadata: %j", (change) => {
    expect(project({ ...snapshot(), ...change })).toMatchObject({
      status: "unavailable",
      code: "invalid_snapshot",
      records: [],
    });
  });

  it.each([
    { id: 0 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { version: 0 },
    { timestamp: "2026-09-12T13:10:11Z" },
    { timestamp: "2026-09-12T13:09:00Z" },
    { type: "unknown" },
    { coordinateMeaning: "entrance" },
    { coordinateMeaning: "bounding_box_center" },
    { coordinates: { lat: 91, lon: 0 } },
    { coordinates: { lat: 0, lon: -181 } },
    { coordinates: { lat: NaN, lon: 0 } },
    { coordinates: { lat: "51.4", lon: 0 } },
    { sourceId: "official_operator" },
    { live: true },
    { helpSchemeMembership: "confirmed" },
    { tags: { amenity: "pub" } },
    { tags: { amenity: "library", access: "private" } },
    { tags: { amenity: "library", access: "no" } },
    { tags: { amenity: "library", name: "x".repeat(2001) } },
    { tags: { amenity: "library", description: "unapproved source text" } },
    { user: "unapproved contributor metadata" },
  ])("rejects invalid source records: %j", (change) => {
    expect(
      project({ ...snapshot(), records: [{ ...record(), ...change }] }),
    ).toMatchObject({
      status: "unavailable",
      code: "invalid_snapshot",
      records: [],
    });
  });

  it("rejects duplicate source keys, including conflicting revisions", () => {
    for (const version of [2, 3]) {
      expect(
        project({
          ...snapshot(),
          records: [record(), { ...record(), version }],
        }).status,
      ).toBe("unavailable");
    }
  });

  it("keeps the same numeric identifier in different OSM namespaces", () => {
    const records = [
      record(),
      { ...record(), type: "way", coordinateMeaning: "bounding_box_center" },
    ];
    expect(
      project({ ...snapshot(), records }).records.map((row) => row.id),
    ).toEqual(["node/123", "way/123"]);
  });

  it("bounds records without silently truncating the snapshot", () => {
    const records = Array.from({ length: MAX_OSM_RECORDS }, (_, index) => ({
      ...record(),
      id: index + 1,
    }));
    expect(project({ ...snapshot(), records }).records).toHaveLength(
      MAX_OSM_RECORDS,
    );
    expect(
      project({
        ...snapshot(),
        records: [...records, { ...record(), id: MAX_OSM_RECORDS + 1 }],
      }).status,
    ).toBe("unavailable");
  });

  it("rejects unsupported pilot IDs and invalid clocks", () => {
    expect(() => project(snapshot(), "london" as PilotId)).toThrow();
    expect(() =>
      projectOsmSnapshot(snapshot(), pilot, { now: new Date("invalid") }),
    ).toThrow("invalid_clock");
  });

  it("does not mutate the source or share parsed coordinate objects", () => {
    const input = snapshot();
    const before = structuredClone(input);
    const result = project(input);
    result.records[0].coordinates.lat = 0;
    expect(input).toEqual(before);
  });
});
