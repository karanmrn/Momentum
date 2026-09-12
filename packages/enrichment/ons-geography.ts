import { z } from "zod";

export const geographyLevels = ["LSOA", "MSOA"] as const;
export type GeographyLevel = (typeof geographyLevels)[number];
export const BOUNDARY_TOLERANCE_METRES = 10;
const codeSchema = z.string().regex(/^E0[12]\d{6}$/);
const pointSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export type Point = z.infer<typeof pointSchema>;
const ringSchema = z
  .array(pointSchema)
  .min(4)
  .max(50000)
  .superRefine((ring, ctx) => {
    const twiceArea = ring.reduce(
      (sum, point, i) =>
        i === 0
          ? sum
          : sum + ring[i - 1][0] * point[1] - point[0] * ring[i - 1][1],
      0,
    );
    if (
      ring[0][0] !== ring.at(-1)![0] ||
      ring[0][1] !== ring.at(-1)![1] ||
      new Set(ring.map((point) => point.join(","))).size < 3 ||
      twiceArea === 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Boundary ring must be closed and nondegenerate.",
      });
    }
  });
const polygonSchema = z.array(ringSchema).min(1).max(100);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygonSchema }).strict(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(polygonSchema).min(1).max(100),
    })
    .strict(),
]);
export type BoundaryGeometry = z.infer<typeof geometrySchema>;
export type BoundaryFeature = {
  code: string;
  name: string;
  geometry: BoundaryGeometry;
};

/** GeoJSON query responses are requested in EPSG:4326, longitude first. */
export function parseBoundaries(
  input: unknown,
  level: GeographyLevel,
): BoundaryFeature[] {
  const parsed = z
    .object({
      type: z.literal("FeatureCollection"),
      exceededTransferLimit: z.literal(false).optional(),
      crs: z
        .object({
          type: z.literal("name"),
          properties: z.object({
            name: z.enum([
              "urn:ogc:def:crs:OGC:1.3:CRS84",
              "urn:ogc:def:crs:EPSG::4326",
              "EPSG:4326",
            ]),
          }),
        })
        .optional(),
      features: z
        .array(
          z.object({
            type: z.literal("Feature"),
            properties: z.record(z.unknown()),
            geometry: geometrySchema,
          }),
        )
        .max(10),
    })
    .strict()
    .parse(input);
  const features = parsed.features.map((feature) => ({
    code: z
      .string()
      .regex(level === "LSOA" ? /^E01\d{6}$/ : /^E02\d{6}$/)
      .parse(feature.properties[`${level}21CD`]),
    name: z.string().min(1).max(100).parse(feature.properties[`${level}21NM`]),
    geometry: feature.geometry,
  }));
  if (new Set(features.map((feature) => feature.code)).size !== features.length)
    throw new Error("duplicate_boundary_code");
  const vertices = features.reduce(
    (total, feature) =>
      total +
      (feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
      ).reduce(
        (sum, polygon) => sum + polygon.reduce((n, ring) => n + ring.length, 0),
        0,
      ),
    0,
  );
  if (vertices > 50000) throw new Error("boundary_vertex_limit");
  return features;
}

function insideRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  // Local metric approximation is used only for the conservative ambiguity buffer.
  const scaleX = 111_320 * Math.cos((point[1] * Math.PI) / 180),
    scaleY = 111_320;
  const ax = (a[0] - point[0]) * scaleX,
    ay = (a[1] - point[1]) * scaleY;
  const bx = (b[0] - point[0]) * scaleX,
    by = (b[1] - point[1]) * scaleY;
  const dx = bx - ax,
    dy = by - ay,
    length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function classifyContainment(point: Point, input: BoundaryGeometry) {
  pointSchema.parse(point);
  const geometry = geometrySchema.parse(input);
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let distance = Infinity;
  for (const polygon of polygons)
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++)
        distance = Math.min(
          distance,
          distanceToSegment(point, ring[i - 1], ring[i]),
        );
    }
  const inside = polygons.some(
    (polygon) =>
      insideRing(point, polygon[0]) &&
      !polygon.slice(1).some((ring) => insideRing(point, ring)),
  );
  return {
    relation:
      distance <= BOUNDARY_TOLERANCE_METRES
        ? ("boundary_ambiguous" as const)
        : inside
          ? ("inside" as const)
          : ("outside" as const),
    boundaryDistanceMetres: Math.round(distance * 100) / 100,
  };
}

/** Never choose one polygon when the anchor is ambiguous or overlaps two polygons. */
export function selectContainingArea(
  point: Point,
  features: BoundaryFeature[],
) {
  const evaluated = features.map((feature) => ({
    feature,
    ...classifyContainment(point, feature.geometry),
  }));
  const inside = evaluated.filter((item) => item.relation === "inside");
  if (
    evaluated.some((item) => item.relation === "boundary_ambiguous") ||
    inside.length > 1
  ) {
    return { status: "boundary_ambiguous" as const, feature: null };
  }
  return inside.length === 1
    ? { status: "verified_containment" as const, feature: inside[0].feature }
    : { status: "no_containing_area" as const, feature: null };
}

const httpsSchema = z
  .string()
  .url()
  .refine(
    (url) =>
      new URL(url).protocol === "https:" &&
      !new URL(url).username &&
      !new URL(url).password,
  );
export const evidenceSchema = z
  .object({
    url: httpsSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z
      .number()
      .int()
      .positive()
      .max(4 * 1024 * 1024),
    retrievedAt: z.string().datetime(),
    rawPath: z.string().startsWith(".data/enrichment/ons-geography/"),
  })
  .strict();
const areaSchema = z
  .object({ code: codeSchema, name: z.string().min(1).max(100) })
  .strict();
export const onsAreaObservationSchema = z
  .object({
    pilotId: z.enum(["camden_town", "hounslow_town_centre", "west_croydon"]),
    level: z.enum(geographyLevels),
    anchor: pointSchema,
    anchorPrecision: z.literal("research_anchor_four_decimal_degrees"),
    status: z.enum([
      "verified_containment",
      "boundary_ambiguous",
      "no_containing_area",
      "source_unavailable",
    ]),
    selectedPostcodeArea: areaSchema,
    selectedAreaRelation: z.enum([
      "inside",
      "outside",
      "boundary_ambiguous",
      "unknown",
    ]),
    selectedAreaBoundaryDistanceMetres: z.number().nonnegative().nullable(),
    containingArea: areaSchema.nullable(),
    selectionComparison: z.enum([
      "matches_postcode_target",
      "differs_from_postcode_target",
      "unknown",
    ]),
    boundaryEvidence: z.array(evidenceSchema).max(3),
    population: z
      .object({
        status: z.enum(["available", "unavailable", "not_applicable"]),
        geographyCode: codeSchema.nullable(),
        usualResidents: z.number().int().nonnegative().max(1000000).nullable(),
        period: z.literal("2021-03-21"),
        scope: z.literal("whole_statistical_area"),
        evidence: evidenceSchema.nullable(),
      })
      .strict(),
    sourcePrecision: z.literal(
      "2021_full_resolution_boundary_anchor_containment_only",
    ),
    geographyVintage: z.literal(2021),
    sourceCrs: z.literal("EPSG:27700"),
    geometryCrs: z.literal("EPSG:4326"),
    boundaryVersion: z.enum(["BFC_V10", "BFC_V7"]),
    boundaryToleranceMetres: z.literal(10),
    pilotPopulation: z.null(),
    pilotBoundaryApproved: z.literal(false),
    crimeRateDenominatorEligible: z.literal(false),
    alertEligible: z.literal(false),
    synthetic: z.literal(false),
    checkedAt: z.string().datetime(),
    errorCode: z
      .enum([
        "boundary_acquisition_or_validation_failed",
        "population_acquisition_or_validation_failed",
      ])
      .nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const verified = value.status === "verified_containment";
    if (
      verified !== (value.containingArea !== null) ||
      (verified && value.boundaryEvidence.length === 0) ||
      (!verified &&
        (value.population.status !== "not_applicable" ||
          value.population.geographyCode !== null ||
          value.selectionComparison !== "unknown")) ||
      (verified &&
        value.population.geographyCode !== value.containingArea?.code) ||
      (value.population.status === "available" &&
        (!verified ||
          value.population.evidence === null ||
          value.population.usualResidents === null ||
          value.population.geographyCode !== value.containingArea?.code)) ||
      (value.population.status !== "available" &&
        (value.population.usualResidents !== null ||
          value.population.evidence !== null)) ||
      (verified &&
        value.selectionComparison !==
          (value.containingArea?.code === value.selectedPostcodeArea.code
            ? "matches_postcode_target"
            : "differs_from_postcode_target")) ||
      [value.selectedPostcodeArea, value.containingArea].some(
        (area) =>
          area && !area.code.startsWith(value.level === "LSOA" ? "E01" : "E02"),
      ) ||
      value.boundaryVersion !== (value.level === "LSOA" ? "BFC_V10" : "BFC_V7")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Geography evidence or scope is inconsistent.",
      });
    }
  });
export type OnsAreaObservation = z.infer<typeof onsAreaObservationSchema>;
export const onsGeographySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    methodVersion: z.literal("ons-anchor-containment/1"),
    checkedAt: z.string().datetime(),
    status: z.enum(["verified", "partial", "unavailable"]),
    observations: z.array(onsAreaObservationSchema).length(6),
    metadataEvidence: z.array(evidenceSchema).max(2),
    attribution: z.array(z.string()).min(2).max(4),
    documentation: z.array(httpsSchema).min(3).max(8),
    limitations: z.array(z.string()).min(4).max(12),
  })
  .strict()
  .superRefine((data, ctx) => {
    const count = data.observations.filter(
      (item) =>
        item.status === "verified_containment" &&
        item.population.status === "available",
    ).length;
    if (
      new Set(data.observations.map((item) => `${item.pilotId}:${item.level}`))
        .size !== 6 ||
      data.status !==
        (count === 6 ? "verified" : count > 0 ? "partial" : "unavailable")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Coverage status must match the six observations.",
      });
    }
  });
export type OnsGeographyDataset = z.infer<typeof onsGeographySchema>;

export function getOnsAreaObservations(input: unknown): OnsAreaObservation[] {
  return onsGeographySchema.parse(input).observations;
}
