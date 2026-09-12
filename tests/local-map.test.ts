import { describe, expect, it } from "vitest";
import { areas, type HelpCard } from "../packages/contracts/index.js";
import type {
  TrafficCameraSnapshot,
  TransportSnapshot,
} from "../packages/transport/index.js";
import { buildLocalMapItems, type LocalMapLayers } from "../src/LocalMap";

const area = areas[1];
const fetchedAt = "2026-09-12T10:00:00.000Z";
const expiresAt = "2026-09-12T10:05:00.000Z";
const now = Date.parse("2026-09-12T10:01:00.000Z");
const source = {
  sourceUrl: "https://api.tfl.gov.uk/StopPoint/940GZZLUCTN",
  sourceLabel: "Powered by TfL Open Data" as const,
  observedAt: null,
  fetchedAt,
};
const help: HelpCard[] = [
  {
    id: "council-library",
    name: "Council-listed library",
    pilotId: area.id,
    summary: "Council directory entry",
    url: "https://www.camden.gov.uk/",
    availability: "unconfirmed",
    schedule: null,
    coordinates: [51.5392, -0.1426],
  },
];
const transport: TransportSnapshot = {
  ...source,
  pilotId: area.id,
  status: "available",
  expiresAt,
  sourceId: "TFL-UNIFIED",
  synthetic: false,
  limitations: ["Station reference point only."],
  lines: [],
  stations: [
    {
      ...source,
      id: "940GZZLUCTN",
      name: "Camden Town",
      pilotId: area.id,
      coordinates: [51.5392, -0.1426],
      coordinateMeaning: "station_reference",
      status: "reported_disruption",
      description: "Operator reports a station disruption.",
      availability: "unknown",
      retrievalStatus: "available",
    },
  ],
};
const cameras: TrafficCameraSnapshot = {
  ...source,
  pilotId: area.id,
  status: "available",
  expiresAt,
  sourceId: "TFL-UNIFIED",
  synthetic: false,
  limitations: ["Metadata does not confirm availability."],
  scope: "one_mile_research_circle",
  cameras: [
    {
      ...source,
      id: "JamCams_test",
      name: "Camden traffic camera",
      pilotId: area.id,
      coordinates: [51.54, -0.14],
      coordinateMeaning: "camera_reference",
      status: "metadata_only",
      availability: "unknown",
    },
  ],
};
const all: LocalMapLayers = { help: true, transport: true, cameras: true };
const props = { area, help, transport, cameras };

describe("local map records", () => {
  it("uses one filtered record set for all three layers", () => {
    expect(
      buildLocalMapItems(props, all, now).map((item) => item.layer),
    ).toEqual(["help", "transport", "cameras"]);
    expect(
      buildLocalMapItems(
        props,
        { help: false, transport: true, cameras: false },
        now,
      ).map((item) => item.id),
    ).toEqual(["transport:940GZZLUCTN"]);
    expect(
      buildLocalMapItems(
        props,
        { help: false, transport: false, cameras: false },
        now,
      ),
    ).toEqual([]);
  });

  it("does not expose previous-area records while replacement snapshots load", () => {
    expect(buildLocalMapItems({ ...props, area: areas[0] }, all, now)).toEqual(
      [],
    );
    const mismatched = {
      ...transport,
      stations: [{ ...transport.stations[0], pilotId: areas[0].id }],
    };
    expect(
      buildLocalMapItems({ area, help: [], transport: mismatched }, all, now),
    ).toEqual([]);
  });

  it("retains station references after expiry without current disruption claims", () => {
    const fresh = buildLocalMapItems(props, all, now).find(
      (item) => item.layer === "transport",
    )!;
    expect(fresh.description).toContain(
      "Operator reports a station disruption",
    );
    const stale = buildLocalMapItems(props, all, Date.parse(expiresAt)).find(
      (item) => item.layer === "transport",
    )!;
    expect(stale.coordinates).toEqual(transport.stations[0].coordinates);
    expect(stale.description).toBe(
      "Transport update expired. Service status unknown.",
    );
    expect(stale.availability).toBe("Station availability unknown.");
    expect(stale.sourceUrl).toBe(transport.stations[0].sourceUrl);
  });

  it("keeps unavailable station data distinct from a known service condition", () => {
    const unavailable = { ...transport, status: "unavailable" as const };
    const rows = buildLocalMapItems(
      { area, help: [], transport: unavailable },
      all,
      now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Service status unknown.");
    expect(rows[0].fetchedAt).toBe(fetchedAt);
  });

  it("exposes camera metadata without media fields or known availability", () => {
    const camera = buildLocalMapItems(props, all, now).find(
      (item) => item.layer === "cameras",
    )!;
    expect(camera.description).toContain("Images are not loaded");
    expect(camera.availability).toBe("Camera availability unknown.");
    expect(camera).not.toHaveProperty("imageUrl");
    expect(camera).not.toHaveProperty("videoUrl");
    expect(
      buildLocalMapItems(props, all, Date.parse(expiresAt)).find(
        (item) => item.layer === "cameras",
      )?.description,
    ).toContain("Camera metadata expired");
  });

  it("omits invalid coordinates and unsafe source links without changing source text", () => {
    const rows = buildLocalMapItems(
      {
        area,
        help: [
          { ...help[0], id: "bad-point", coordinates: [NaN, 0] },
          {
            ...help[0],
            id: "bad-link",
            name: "<img src=x onerror=alert(1)>",
            url: "javascript:alert(1)",
          },
          { ...help[0], id: "no-point", coordinates: undefined },
        ],
      },
      all,
      now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceUrl).toBeNull();
    expect(rows[0].name).toBe("<img src=x onerror=alert(1)>");
    expect(rows[0].availability).toBe("Availability unconfirmed.");
  });
});
