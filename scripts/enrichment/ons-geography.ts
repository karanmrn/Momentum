import { createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import prior from "../../research/datasets/ons-status.json";
import { anchors, parsePopulationCsv } from "../datasets/ons/index";
import {
  classifyContainment,
  parseBoundaries,
  selectContainingArea,
  onsGeographySchema,
  type GeographyLevel,
  type OnsAreaObservation,
  type OnsGeographyDataset,
  type Point,
} from "../../packages/enrichment/ons-geography";

export const boundaryServices = {
  LSOA: "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BFC_V10/FeatureServer/0",
  MSOA: "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Middle_layer_Super_Output_Areas_December_2021_Boundaries_EW_BFC_V7/FeatureServer/0",
} as const;
const nomisBase =
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1/data.csv";
export function boundaryQuery(
  level: GeographyLevel,
  selector: string[] | Point,
): string {
  const parameters = new URLSearchParams({
    f: "geojson",
    outFields: `${level}21CD,${level}21NM`,
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "10",
  });
  if (typeof selector[0] === "string") {
    const codes = z
      .array(z.string().regex(level === "LSOA" ? /^E01\d{6}$/ : /^E02\d{6}$/))
      .min(1)
      .max(3)
      .parse(selector);
    parameters.set("where", `${level}21CD IN ('${codes.join("','")}')`);
  } else {
    const [longitude, latitude] = z
      .tuple([z.number().min(-1).max(0.5), z.number().min(51).max(52)])
      .parse(selector);
    parameters.set("where", "1=1");
    parameters.set(
      "geometry",
      `${longitude - 0.0002},${latitude - 0.0002},${longitude + 0.0002},${latitude + 0.0002}`,
    );
    parameters.set("geometryType", "esriGeometryEnvelope");
    parameters.set("inSR", "4326");
    parameters.set("spatialRel", "esriSpatialRelIntersects");
  }
  return `${boundaryServices[level]}/query?${parameters}`;
}

export async function fetchOnsBytes(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    ![
      ...Object.values(boundaryServices).flatMap((base) => [
        base,
        `${base}/query`,
      ]),
      nomisBase,
    ].includes(`${parsed.origin}${parsed.pathname}`)
  ) {
    throw new Error("source_not_allowed");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (attempt === 0 && [429, 503].includes(response.status)) {
      await response.body?.cancel();
      const retry = Number(response.headers.get("retry-after") ?? "1");
      // A long provider cooldown ends this run. Do not retry before the provider permits it.
      if (!Number.isFinite(retry) || retry < 0 || retry > 2)
        throw new Error("source_cooldown");
      await delay(Math.max(250, retry * 1000));
      continue;
    }
    if (!response.ok || response.redirected || !response.body)
      throw new Error("source_unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4 * 1024 * 1024) throw new Error("source_too_large");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("source_unavailable");
}

export async function collectOnsGeography(
  workspace: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OnsGeographyDataset> {
  const checkedAt = new Date().toISOString();
  const relative = `.data/enrichment/ons-geography/${checkedAt.replace(/[:.]/g, "-")}`;
  await mkdir(resolve(workspace, relative), { recursive: true, mode: 0o700 });
  const metadataEvidence: OnsGeographyDataset["metadataEvidence"] = [];
  async function capture(url: string, filename: string) {
    const bytes = await fetchOnsBytes(url, fetchImpl);
    const evidence = {
      url,
      rawPath: `${relative}/${filename}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
      retrievedAt: new Date().toISOString(),
    };
    await writeFile(resolve(workspace, evidence.rawPath), bytes, {
      mode: 0o600,
    });
    return {
      raw: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      evidence,
    };
  }
  const observations: OnsAreaObservation[] = anchors.flatMap((anchor) =>
    (["LSOA", "MSOA"] as const).map((level) => {
      const old = prior.pilots
        .find((pilot) => pilot.pilotId === anchor.pilotId)!
        .counts.find((count) =>
          count.geographyCode.startsWith(level === "LSOA" ? "E01" : "E02"),
        )!;
      return {
        pilotId: anchor.pilotId,
        level,
        anchor: [anchor.longitude, anchor.latitude],
        anchorPrecision: "research_anchor_four_decimal_degrees",
        status: "source_unavailable",
        selectedPostcodeArea: {
          code: old.geographyCode,
          name: old.geographyName,
        },
        selectedAreaRelation: "unknown",
        selectedAreaBoundaryDistanceMetres: null,
        containingArea: null,
        selectionComparison: "unknown",
        boundaryEvidence: [],
        population: {
          status: "not_applicable",
          geographyCode: null,
          usualResidents: null,
          period: "2021-03-21",
          scope: "whole_statistical_area",
          evidence: null,
        },
        sourcePrecision:
          "2021_full_resolution_boundary_anchor_containment_only",
        geographyVintage: 2021,
        sourceCrs: "EPSG:27700",
        geometryCrs: "EPSG:4326",
        boundaryVersion: level === "LSOA" ? "BFC_V10" : "BFC_V7",
        boundaryToleranceMetres: 10,
        pilotPopulation: null,
        pilotBoundaryApproved: false,
        crimeRateDenominatorEligible: false,
        alertEligible: false,
        synthetic: false,
        checkedAt,
        errorCode: "boundary_acquisition_or_validation_failed",
      } as OnsAreaObservation;
    }),
  );
  for (const level of ["LSOA", "MSOA"] as const) {
    const selected = observations.filter((item) => item.level === level);
    try {
      const meta = await capture(
        `${boundaryServices[level]}?f=json`,
        `${level}-metadata.json`,
      );
      z.object({
        name: z.literal(
          level === "LSOA" ? "LSOA_2021_EW_BFC_V10" : "MSOA_2021_EW_BFC_V7",
        ),
        geometryType: z.literal("esriGeometryPolygon"),
        extent: z.object({
          spatialReference: z.object({ wkid: z.literal(27700) }),
        }),
        fields: z
          .array(z.object({ name: z.string() }))
          .refine((fields) =>
            [`${level}21CD`, `${level}21NM`].every((name) =>
              fields.some((field) => field.name === name),
            ),
          ),
      }).parse(JSON.parse(meta.raw));
      metadataEvidence.push(meta.evidence);
      const captureResult = await capture(
        boundaryQuery(
          level,
          selected.map((item) => item.selectedPostcodeArea.code),
        ),
        `${level}-selected-boundaries.geojson`,
      );
      const features = parseBoundaries(JSON.parse(captureResult.raw), level);
      if (
        features.length !== 3 ||
        selected.some(
          (item) =>
            !features.some(
              (feature) => feature.code === item.selectedPostcodeArea.code,
            ),
        )
      )
        throw new Error("missing_selected_boundary");
      for (const item of selected) {
        try {
          const original = features.find(
            (feature) => feature.code === item.selectedPostcodeArea.code,
          )!;
          const relation = classifyContainment(item.anchor, original.geometry);
          item.selectedAreaRelation = relation.relation;
          item.selectedAreaBoundaryDistanceMetres =
            relation.boundaryDistanceMetres;
          item.boundaryEvidence = [captureResult.evidence];
          let candidates = features;
          // Known boundary ambiguity already prevents assignment. Only an outside point needs a new area search.
          if (relation.relation === "outside") {
            const nearby = await capture(
              boundaryQuery(level, item.anchor),
              `${item.pilotId}-${level}-nearby.geojson`,
            );
            candidates = parseBoundaries(JSON.parse(nearby.raw), level);
            item.boundaryEvidence.push(nearby.evidence);
          }
          const result = selectContainingArea(item.anchor, candidates);
          item.status = result.status;
          item.errorCode = null;
          if (result.feature) {
            item.containingArea = {
              code: result.feature.code,
              name: result.feature.name,
            };
            item.selectionComparison =
              result.feature.code === item.selectedPostcodeArea.code
                ? "matches_postcode_target"
                : "differs_from_postcode_target";
            item.population.status = "unavailable";
            item.population.geographyCode = result.feature.code;
          }
        } catch {
          item.status = "source_unavailable";
          item.errorCode = "boundary_acquisition_or_validation_failed";
        }
      }
    } catch {
      /* Preserve explicit unavailable observations for this level. */
    }
  }
  const codes = [
    ...new Set(
      observations.flatMap((item) =>
        item.containingArea ? [item.containingArea.code] : [],
      ),
    ),
  ];
  if (codes.length) {
    try {
      const url = `${nomisBase}?${new URLSearchParams({ geography: codes.join(","), c2021_restype_3: "0", measures: "20100", date: "2021" })}`;
      const captured = await capture(url, "ts001-containing-areas.csv");
      const population = parsePopulationCsv(captured.raw, codes);
      for (const item of observations)
        if (item.containingArea) {
          const row = population.find(
            (value) => value.GEOGRAPHY_CODE === item.containingArea!.code,
          )!;
          if (row.GEOGRAPHY_NAME !== item.containingArea.name)
            throw new Error("population_name_mismatch");
        }
      for (const item of observations)
        if (item.containingArea) {
          const row = population.find(
            (value) => value.GEOGRAPHY_CODE === item.containingArea!.code,
          )!;
          item.population = {
            status: "available",
            geographyCode: row.GEOGRAPHY_CODE,
            usualResidents: row.OBS_VALUE,
            period: "2021-03-21",
            scope: "whole_statistical_area",
            evidence: captured.evidence,
          };
        }
    } catch {
      for (const item of observations)
        if (item.containingArea)
          item.errorCode = "population_acquisition_or_validation_failed";
    }
  }
  const available = observations.filter(
    (item) =>
      item.status === "verified_containment" &&
      item.population.status === "available",
  ).length;
  const result = onsGeographySchema.parse({
    schemaVersion: "1.0",
    methodVersion: "ons-anchor-containment/1",
    checkedAt,
    status:
      available === 6 ? "verified" : available > 0 ? "partial" : "unavailable",
    observations,
    metadataEvidence,
    attribution: [
      "Source: Office for National Statistics licensed under the Open Government Licence v.3.0.",
      "Contains OS data © Crown copyright and database right 2026.",
      "Census 2021 usual residents: Office for National Statistics, via Nomis.",
    ],
    documentation: [
      "https://www.arcgis.com/sharing/rest/content/items/2bbaef5230694f3abae4f9145a3a9800/info/metadata/metadata.xml?format=default&output=html",
      "https://www.data.gov.uk/dataset/b9d6e8eb-95a8-4a32-832f-e8a746252f43/middle-layer-super-output-areas-december-2021-boundaries-ew-bfc-v7",
      "https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/",
      "https://www.ons.gov.uk/methodology/geography/licences",
      "https://www.nomisweb.co.uk/datasets/c2021ts001",
    ],
    limitations: [
      "Containment applies to a research anchor, not the pilot circle or an incident location.",
      "Population counts cover the whole named statistical area on Census Day, 21 March 2021.",
      "LSOA and MSOA populations overlap. Do not sum them or use them as pilot crime-rate denominators.",
      "No pilot boundary is approved. Pilot population remains unknown.",
      "Counts do not represent current population, visitors, night-time footfall, or personal risk.",
      "A 10 metre ambiguity buffer covers four-decimal anchor rounding and local projection uncertainty. It is not a surveyed accuracy claim.",
      "ONS BFC boundaries retain full source resolution and are clipped to the coastline. ArcGIS transforms source EPSG:27700 to EPSG:4326.",
      "Census disclosure control can produce small count differences between tables.",
    ],
  });
  const output = resolve(workspace, "research/enrichment");
  await mkdir(output, { recursive: true });
  const temporary = join(output, `ons-geography.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temporary, join(output, "ons-geography.json"));
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  collectOnsGeography(process.cwd())
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify({
          status: result.status,
          observations: result.observations.map((item) => ({
            pilotId: item.pilotId,
            level: item.level,
            status: item.status,
            selectedAreaRelation: item.selectedAreaRelation,
            containingArea: item.containingArea,
            residents: item.population.usualResidents,
          })),
        })}\n`,
      );
      if (result.status !== "verified") process.exitCode = 1;
    })
    .catch(() => {
      process.stderr.write("ONS geography collection failed.\n");
      process.exitCode = 1;
    });
}
