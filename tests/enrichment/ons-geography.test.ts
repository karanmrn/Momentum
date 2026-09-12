import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyContainment,
  parseBoundaries,
  selectContainingArea,
  onsGeographySchema,
  type BoundaryGeometry,
} from "../../packages/enrichment/ons-geography";
import {
  collectOnsGeography,
  fetchOnsBytes,
  boundaryServices,
  boundaryQuery,
} from "../../scripts/enrichment/ons-geography";
import prior from "../../research/datasets/ons-status.json";

const square = (x: number, y: number, width = 0.005): BoundaryGeometry => ({
  type: "Polygon",
  coordinates: [
    [
      [x - width, y - width],
      [x + width, y - width],
      [x + width, y + width],
      [x - width, y + width],
      [x - width, y - width],
    ],
  ],
});
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "ons-geography-"));
  directories.push(path);
  return path;
}
const metadata = (level: "LSOA" | "MSOA") => ({
  name: level === "LSOA" ? "LSOA_2021_EW_BFC_V10" : "MSOA_2021_EW_BFC_V7",
  geometryType: "esriGeometryPolygon",
  extent: { spatialReference: { wkid: 27700 } },
  fields: [{ name: `${level}21CD` }, { name: `${level}21NM` }],
});
function featureCollection(level: "LSOA" | "MSOA") {
  return {
    type: "FeatureCollection",
    features: prior.pilots.map((pilot) => {
      const count = pilot.counts.find((row) =>
        row.geographyCode.startsWith(level === "LSOA" ? "E01" : "E02"),
      )!;
      return {
        type: "Feature",
        properties: {
          [`${level}21CD`]: count.geographyCode,
          [`${level}21NM`]: count.geographyName,
        },
        geometry: square(pilot.longitude, pilot.latitude),
      };
    }),
  };
}
function populationCsv(codes: string[]) {
  const all = prior.pilots.flatMap((pilot) => pilot.counts);
  return [
    "DATE,GEOGRAPHY_CODE,GEOGRAPHY_NAME,GEOGRAPHY_TYPE,C2021_RESTYPE_3,C2021_RESTYPE_3_NAME,MEASURES,OBS_VALUE,OBS_STATUS,OBS_CONF,RECORD_COUNT",
    ...codes.map((code) => {
      const row = all.find((item) => item.geographyCode === code);
      return [
        "2021",
        code,
        row?.geographyName ?? "Replacement area",
        code.startsWith("E01")
          ? "2021 super output areas - lower layer"
          : "2021 super output areas - middle layer",
        "0",
        "Total: All usual residents",
        "20100",
        "1234",
        "A",
        "F",
        codes.length,
      ].join(",");
    }),
  ].join("\n");
}
const sourceFetch = () =>
  vi.fn<typeof fetch>().mockImplementation(async (request) => {
    const url = new URL(String(request));
    if (url.hostname === "www.nomisweb.co.uk")
      return new Response(
        populationCsv(url.searchParams.get("geography")!.split(",")),
      );
    const level = url.pathname.includes("Lower_layer") ? "LSOA" : "MSOA";
    return Response.json(
      url.pathname.endsWith("/query")
        ? featureCollection(level)
        : metadata(level),
    );
  });

describe("ONS boundary containment", () => {
  it("distinguishes inside, outside, and points on or near a boundary", () => {
    const shape = square(0, 0, 1);
    expect(classifyContainment([0, 0], shape).relation).toBe("inside");
    expect(classifyContainment([2, 0], shape).relation).toBe("outside");
    expect(classifyContainment([1, 0], shape).relation).toBe(
      "boundary_ambiguous",
    );
    expect(classifyContainment([1.00001, 0], shape).relation).toBe(
      "boundary_ambiguous",
    );
  });
  it("excludes holes and handles islands in a multipolygon", () => {
    const outer = square(0, 0, 2),
      hole = square(0, 0, 0.5),
      island = square(5, 5, 1);
    if (
      outer.type !== "Polygon" ||
      hole.type !== "Polygon" ||
      island.type !== "Polygon"
    )
      throw new Error("fixture");
    const shape: BoundaryGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [outer.coordinates[0], hole.coordinates[0]],
        island.coordinates,
      ],
    };
    expect(classifyContainment([0, 0], shape).relation).toBe("outside");
    expect(classifyContainment([0.5, 0], shape).relation).toBe(
      "boundary_ambiguous",
    );
    expect(classifyContainment([1, 0], shape).relation).toBe("inside");
    expect(classifyContainment([5, 5], shape).relation).toBe("inside");
  });
  it("rejects missing, malformed, duplicate, truncated, or wrong CRS geometry", () => {
    const valid = featureCollection("LSOA");
    expect(parseBoundaries(valid, "LSOA")).toHaveLength(3);
    for (const input of [
      { error: { message: "failed" } },
      { ...valid, exceededTransferLimit: true },
      { ...valid, crs: { type: "name", properties: { name: "EPSG:27700" } } },
      { ...valid, features: [valid.features[0], valid.features[0]] },
      { ...valid, features: [{ ...valid.features[0], geometry: null }] },
    ])
      expect(() => parseBoundaries(input, "LSOA")).toThrow();
    expect(() =>
      classifyContainment([0, 0], {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      }),
    ).toThrow();
    expect(() =>
      classifyContainment([0, 0], {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [2, 2],
            [0, 0],
          ],
        ],
      }),
    ).toThrow();
  });
  it("keeps overlapping and boundary candidates ambiguous", () => {
    const feature = { code: "E01000001", name: "A", geometry: square(0, 0, 1) };
    expect(selectContainingArea([0, 0], [feature]).status).toBe(
      "verified_containment",
    );
    expect(
      selectContainingArea([0, 0], [feature, { ...feature, code: "E01000002" }])
        .status,
    ).toBe("boundary_ambiguous");
    expect(selectContainingArea([1, 0], [feature]).feature).toBeNull();
    expect(selectContainingArea([0, 0], []).status).toBe("no_containing_area");
  });
});

describe("ONS bounded acquisition and coverage", () => {
  it("retains six full-area observations with query and raw snapshot provenance", async () => {
    const workspace = await directory(),
      fetchImpl = sourceFetch();
    const result = await collectOnsGeography(workspace, fetchImpl);
    expect(result.status).toBe("verified");
    expect(
      result.observations.every(
        (row) => row.selectionComparison === "matches_postcode_target",
      ),
    ).toBe(true);
    expect(
      result.observations.every(
        (row) =>
          row.population.usualResidents === 1234 &&
          row.pilotPopulation === null &&
          !row.crimeRateDenominatorEligible,
      ),
    ).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    for (const evidence of [
      ...result.metadataEvidence,
      ...result.observations.flatMap((item) => item.boundaryEvidence),
    ]) {
      expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(
        (await readFile(join(workspace, evidence.rawPath))).byteLength,
      ).toBe(evidence.bytes);
    }
    expect(
      fetchImpl.mock.calls.every(
        ([, init]) => init?.redirect === "error" && init.signal,
      ),
    ).toBe(true);
    const forged = structuredClone(result);
    forged.observations[0].population.geographyCode = "E01099999";
    expect(onsGeographySchema.safeParse(forged).success).toBe(false);
  });
  it("finds a different containing polygon and requests its population code", async () => {
    const workspace = await directory(),
      fallback = sourceFetch();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (request, init) => {
        const url = new URL(String(request));
        if (
          url.pathname.includes("Lower_layer") &&
          url.pathname.endsWith("/query")
        ) {
          const collection = featureCollection("LSOA");
          if (url.searchParams.has("geometry")) {
            collection.features[0].properties = {
              LSOA21CD: "E01099999",
              LSOA21NM: "Replacement area",
            };
            return Response.json({
              ...collection,
              features: [collection.features[0]],
            });
          }
          collection.features[0].geometry = square(-0.5, 51.5);
          return Response.json(collection);
        }
        return fallback(request, init);
      });
    const result = await collectOnsGeography(workspace, fetchImpl),
      row = result.observations[0];
    expect(row.status).toBe("verified_containment");
    expect(row.selectedAreaRelation).toBe("outside");
    expect(row.selectionComparison).toBe("differs_from_postcode_target");
    expect(row.containingArea?.code).toBe("E01099999");
    expect(row.population.geographyCode).toBe("E01099999");
    expect(row.boundaryEvidence).toHaveLength(2);
  });
  it("does not assign a population when the point is on a boundary", async () => {
    const workspace = await directory(),
      fallback = sourceFetch();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (request, init) => {
        if (
          String(request).includes("Lower_layer") &&
          String(request).includes("/query")
        ) {
          const collection = featureCollection("LSOA"),
            pilot = prior.pilots[0];
          collection.features[0].geometry = square(
            pilot.longitude + 0.005,
            pilot.latitude,
          );
          return Response.json(collection);
        }
        return fallback(request, init);
      });
    const result = await collectOnsGeography(workspace, fetchImpl);
    expect(result.status).toBe("partial");
    expect(result.observations[0]).toMatchObject({
      status: "boundary_ambiguous",
      containingArea: null,
      population: { status: "not_applicable", usualResidents: null },
    });
    expect(
      fetchImpl.mock.calls.every(([url]) => !String(url).includes("geometry=")),
    ).toBe(true);
  });
  it("replaces prior success with explicit unavailable data after source failure", async () => {
    const workspace = await directory();
    expect((await collectOnsGeography(workspace, sourceFetch())).status).toBe(
      "verified",
    );
    const failed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private provider text", { status: 403 }),
      );
    const result = await collectOnsGeography(workspace, failed);
    expect(result.status).toBe("unavailable");
    expect(
      result.observations.every(
        (item) =>
          item.status === "source_unavailable" &&
          item.population.usualResidents === null,
      ),
    ).toBe(true);
    const saved = await readFile(
      join(workspace, "research/enrichment/ons-geography.json"),
      "utf8",
    );
    expect(saved).not.toContain("private provider text");
    expect(JSON.parse(saved).status).toBe("unavailable");
  });
  it("preserves verified geometry when population acquisition fails", async () => {
    const workspace = await directory(),
      fallback = sourceFetch();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation((request, init) =>
        String(request).includes("nomisweb")
          ? Promise.resolve(new Response("unavailable", { status: 500 }))
          : fallback(request, init),
      );
    const result = await collectOnsGeography(workspace, fetchImpl);
    expect(
      result.observations.every(
        (item) =>
          item.status === "verified_containment" &&
          item.population.status === "unavailable",
      ),
    ).toBe(true);
  });
  it("bounds requests, redirects, responses and cooldown retries", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchOnsBytes("https://example.org/data", fetchImpl),
    ).rejects.toThrow("source_not_allowed");
    expect(fetchImpl).not.toHaveBeenCalled();
    const url = `${boundaryServices.LSOA}?f=json`;
    fetchImpl.mockResolvedValueOnce(
      new Response("x".repeat(4 * 1024 * 1024 + 1)),
    );
    await expect(fetchOnsBytes(url, fetchImpl)).rejects.toThrow(
      "source_too_large",
    );
    fetchImpl.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "retry-after": "60" } }),
    );
    await expect(fetchOnsBytes(url, fetchImpl)).rejects.toThrow(
      "source_cooldown",
    );
    expect(() => boundaryQuery("LSOA", ["E01000001') OR 1=1"])).toThrow();
  });
});
