import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Router } from "express";
import { z } from "zod";
import {
  areas,
  pilotSchema,
  type PilotId,
} from "../packages/contracts/index.js";
import {
  semanticGraphSchema,
  type SemanticGraph,
} from "../packages/semantic-graph/schema.js";

interface Reader {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}
interface Database {
  transaction<T>(callback: (reader: Reader) => Promise<T>): Promise<T>;
}
export interface GraphResearchOptions {
  env?: Record<string, string | undefined>;
  openDatabase?: (path: string) => Promise<Database>;
}
const titles: Record<string, string> = {
  police: "Historical police records",
  osm: "Mapped amenities",
  tfl: "Transport station records",
  tfl_snapshot: "Transport request snapshots",
  naptan: "Transport stop identities",
  ons: "Census area counts",
  priorities: "Published police priorities",
  manifest: "Acquisition manifest",
  "enrichment-police-outcomes": "Historical police outcomes",
  "enrichment-ons-geography": "Statistical area assignments",
  "enrichment-mps-context": "Borough crime context",
};
const areaQuery = z.object({ area: pilotSchema }).strict();
const recordQuery = z
  .object({
    area: pilotSchema,
    dataset: z.string().regex(/^[a-f0-9]{64}$/),
    offset: z.coerce.number().int().min(0).max(200000).default(0),
    limit: z.coerce.number().int().min(1).max(30).default(20),
    month: z
      .string()
      .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .strict();
const envelope = <T>(data: T) => ({
  schemaVersion: "1.0",
  synthetic: false,
  data: { ...data, localResearchOnly: true, publicationAllowed: false },
});
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, max = 150): string | undefined =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const cleanTime = (value: unknown): string | null => {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const cleanUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const cleanHash = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
const month = (value: unknown): string | undefined =>
  typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])(?:$|-)/.test(value)
    ? value.slice(0, 7)
    : undefined;
const labelOf = (dataset: string) => titles[dataset] ?? "Research dataset";

/** Only these dataset fields may enter a browser response. Raw payloads stay in the private store. */
function safeRecord(
  dataset: string,
  raw: Record<string, unknown>,
  observedAt: unknown,
) {
  let label = labelOf(dataset),
    precision = "source_defined_research_scope";
  const parts: string[] = [];
  let coordinates: [number, number] | undefined;
  const add = (name: string, value: unknown) => {
    const safe =
      typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : text(value, 180);
    if (safe) parts.push(`${name}: ${safe}`);
  };
  const setCoordinates = (lat: unknown, lon: unknown) => {
    const a = num(lat),
      b = num(lon);
    if (
      a !== undefined &&
      b !== undefined &&
      a >= -90 &&
      a <= 90 &&
      b >= -180 &&
      b <= 180
    )
      coordinates = [a, b];
  };
  switch (dataset) {
    case "police": {
      label = `${text(raw.category, 100) ?? "Police record"} · ${month(raw.observedMonth) ?? "Month unknown"}`;
      precision = "anonymised_point";
      const location = obj(raw.location);
      setCoordinates(location.latitude, location.longitude);
      add("Category", raw.category);
      add("Month", raw.observedMonth);
      parts.push(
        "Historical police record. The point is approximate. It is not a live warning or police case reference.",
      );
      break;
    }
    case "osm": {
      const tags = obj(raw.tags);
      label = text(tags.name) ?? text(tags.amenity) ?? "Mapped amenity";
      precision = text(raw.coordinateMeaning) ?? "mapped_location";
      const point = obj(raw.coordinates);
      setCoordinates(point.lat, point.lon);
      add("Amenity", tags.amenity);
      add("Mapped access", tags.access);
      add("Mapped wheelchair access", tags.wheelchair);
      parts.push(
        "OSM mapping does not establish help scheme membership or current availability.",
      );
      break;
    }
    case "naptan": {
      const record = obj(raw.record);
      label = text(record.CommonName) ?? "Transport stop";
      add("Stop identity", record.ATCOCode);
      add("Stop type", record.StopType);
      const coordinate = (value: unknown) =>
        typeof value === "string" && value.trim()
          ? Number(value)
          : typeof value === "number"
            ? value
            : undefined;
      setCoordinates(coordinate(record.Latitude), coordinate(record.Longitude));
      precision = "selected_transport_stop";
      parts.push(
        "A stop identity does not confirm current service or an accessible entrance.",
      );
      break;
    }
    case "tfl":
      label = text(raw.commonName) ?? text(raw.name) ?? "Transport record";
      add("Transport identity", raw.id);
      setCoordinates(raw.lat, raw.lon);
      precision = "station_identity";
      parts.push(
        "Retrieved transport identity. Current operation is not confirmed.",
      );
      break;
    case "ons":
      label =
        text(raw.geographyName) ??
        text(raw.geographyCode) ??
        "Census statistical area";
      add("Statistical area", raw.geographyCode);
      add("Usual residents", raw.usualResidents);
      precision = "whole_statistical_area";
      parts.push(
        "Census counts cover the statistical area, not the pilot boundary. They are not a crime rate denominator.",
      );
      break;
    case "enrichment-ons-geography": {
      const area = obj(raw.containingArea),
        population = obj(raw.population);
      label = text(area.name) ?? "Statistical area assignment";
      add("Area code", area.code);
      add("Level", raw.level);
      add("Assignment status", raw.status);
      add("Population scope", population.scope);
      add("Census residents", population.usualResidents);
      precision =
        text(raw.sourcePrecision) ?? "research_anchor_containment_only";
      parts.push(
        "Anchor containment is not an approved pilot boundary. Ambiguity remains unresolved where stated.",
      );
      break;
    }
    case "enrichment-mps-context":
      label = `${text(raw.minorCategory) ?? "Crime category"} · ${month(raw.month) ?? "Month unknown"}`;
      add("Borough", raw.borough);
      add("Major category", raw.majorCategory);
      add("Count", raw.count);
      add("Value status", raw.valueStatus);
      precision = "borough";
      parts.push(
        "Historical borough count. Do not add this count to Police.uk records or classify an individual report.",
      );
      break;
    case "enrichment-police-outcomes": {
      const expected = obj(raw.expectedCrime);
      label = `${text(expected.category) ?? "Police record"} outcomes`;
      add("Source status", raw.status);
      add("Crime month", expected.month);
      const outcomes = Array.isArray(raw.outcomes)
        ? raw.outcomes.slice(0, 8)
        : [];
      for (const outcome of outcomes) {
        const row = obj(outcome);
        add(
          "Dated outcome",
          [text(row.categoryName), month(row.month)]
            .filter(Boolean)
            .join(" · "),
        );
      }
      precision = "historical_source_record";
      parts.push(
        "Outcomes concern the source record only. They do not identify people or establish a cause.",
      );
      break;
    }
    case "priorities":
      label = "Police neighbourhood priority";
      add("Issue published", raw["issue-date"]);
      add("Action published", raw["action-date"]);
      parts.push(
        "The stored source contains issue and action wording. Narrative text stays outside this graph. Completion is not verified.",
      );
      break;
    default:
      parts.push(
        "Source snapshot metadata only. No individual area assignment is inferred.",
      );
  }
  const observedMonth = month(observedAt);
  if (observedMonth) add("Source month", observedMonth);
  return {
    label,
    precision,
    summary: parts.join(" ").slice(0, 1000),
    coordinates,
    months: observedMonth ? [observedMonth] : undefined,
  };
}

function projection(
  area: PilotId,
  dataset: string,
  artifact: Record<string, unknown>,
  rows: Record<string, unknown>[],
): SemanticGraph {
  const areaId = `area:${area}`,
    sourceId = `research-source:${artifact.artifact_id}`;
  const provenance = {
    sourceId: `artifact:${artifact.artifact_id}`,
    sourceFamilyId: dataset,
    sourceUrl: null,
    fetchedAt: null,
    originGroupId: null,
    snapshotSha256: cleanHash(artifact.sha256) ?? null,
  };
  const nodes: SemanticGraph["nodes"] = [
    {
      id: areaId,
      type: "Area",
      label: areas.find((item) => item.id === area)?.name ?? area,
      synthetic: false,
      provenance: null,
      metadata: {
        geographyDescription:
          "Research selection only. The pilot boundary is not approved.",
      },
    },
    {
      id: sourceId,
      type: "Source",
      label: labelOf(dataset),
      synthetic: false,
      provenance,
      metadata: {
        summary:
          "Local research artifact. Source periods can differ. Each record retains its own source URL and retrieval time. Publication remains disabled.",
      },
    },
  ];
  const assertions: SemanticGraph["assertions"] = [];
  for (const row of rows) {
    const raw = obj(row.raw);
    const { label, ...safe } = safeRecord(dataset, raw, row.observed_at);
    const recordId = `research-record:${createHash("sha256").update(`${artifact.artifact_id}/${row.record_key}`).digest("hex")}`;
    const snapshot =
      cleanHash(raw.sourceSnapshot) ??
      cleanHash(raw.sourceSnapshotSha256) ??
      cleanHash(artifact.sha256) ??
      null;
    nodes.push({
      id: recordId,
      type: "DatasetRecord",
      label,
      synthetic: false,
      provenance: {
        ...provenance,
        sourceId: String(row.source_id).slice(0, 1000),
        sourceFamilyId: String(row.source_id).slice(0, 1000),
        sourceUrl: cleanUrl(row.source_url),
        fetchedAt: cleanTime(row.fetched_at),
        snapshotSha256: snapshot,
      },
      metadata: {
        ...safe,
        sourceRecordKey: String(row.record_key).slice(0, 1000),
        status: "acquired",
        geographyDescription:
          dataset === "enrichment-mps-context"
            ? "Whole borough context. Not a pilot count."
            : "Stored research selection. Shared area does not establish a crime relationship.",
      },
    });
    for (const [predicate, target] of [
      ["ISSUED_BY", sourceId],
      ["CONTEXTUAL_AREA_ONLY", areaId],
    ] as const) {
      assertions.push({
        id: `${recordId}:${predicate}`,
        subjectId: recordId,
        objectId: target,
        predicate,
        inferenceType:
          predicate === "ISSUED_BY" ? "source_statement" : "deterministic_join",
        reasonCodes: [
          predicate === "ISSUED_BY"
            ? "stored_source_lineage"
            : "stored_research_area_assignment_only",
        ],
        evidenceRefs: [recordId],
        methodVersion: "1.0",
        synthetic: false,
      });
    }
  }
  return semanticGraphSchema.parse({
    ontologyVersion: "1.0",
    pilotId: area,
    nodes,
    assertions,
    truncated: false,
    limitations: [
      "Local research only. Publication remains disabled.",
      "These links show source lineage and research area context. They do not explain crime causes.",
      "Null area assignments and unreviewed narrative fields are excluded from area record pages.",
    ],
  });
}

export function createGraphResearchRouter(
  options: GraphResearchOptions = {},
): Router {
  const router = Router();
  const env = options.env ?? process.env;
  let database: Promise<Database> | undefined;
  const open =
    options.openDatabase ??
    (async (path: string) => {
      if (!isAbsolute(path) || !(await stat(join(path, "PG_VERSION"))).isFile())
        throw new Error("research_store_missing");
      return new PGlite(path);
    });
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (
      env.VERCEL ||
      env.NODE_ENV === "production" ||
      !env.GRAPH_RESEARCH_DB_PATH ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(
        req.hostname.toLowerCase(),
      )
    )
      return res.status(404).json({ error: "Local research is unavailable." });
    if (!res.locals.sessionId)
      return res
        .status(401)
        .json({ error: "A local demo session is required." });
    next();
  });
  const read = async <T>(operation: (db: Reader) => Promise<T>) => {
    database ??= open(env.GRAPH_RESEARCH_DB_PATH!).catch((error) => {
      database = undefined;
      throw error;
    });
    return (await database).transaction(async (db) => {
      await db.exec("SET TRANSACTION READ ONLY");
      return operation(db);
    });
  };
  router.get("/catalog", async (req, res) => {
    const query = areaQuery.safeParse(req.query);
    if (!query.success)
      return res.status(400).json({ error: "Choose a supported area." });
    try {
      const rows = await read(
        async (db) =>
          (
            await db.query(
              `SELECT a.artifact_id,a.dataset,a.record_count,
        count(r.record_key) AS area_count,
        coalesce(array_agg(DISTINCT r.source_id) FILTER (WHERE r.source_id IS NOT NULL), '{}') AS source_ids,
        coalesce(array_agg(DISTINCT substring(r.observed_at from 1 for 7)) FILTER (WHERE r.observed_at ~ '^20[0-9]{2}-(0[1-9]|1[0-2])($|-)'), '{}') AS months
        FROM research.dataset_artifacts a LEFT JOIN research.dataset_records r
        ON r.artifact_id=a.artifact_id AND r.pilot_id=$1 AND NOT r.publication_allowed AND NOT r.synthetic
        WHERE NOT a.publication_allowed AND NOT a.synthetic
        GROUP BY a.artifact_id,a.dataset,a.record_count ORDER BY a.dataset,a.artifact_id LIMIT 100`,
              [query.data.area],
            )
          ).rows,
      );
      res.json(
        envelope({
          datasets: rows.map((row) => ({
            id: row.artifact_id,
            dataset: row.dataset,
            title: labelOf(String(row.dataset)),
            totalRecords: Number(row.record_count),
            areaRecordCount: Number(row.area_count),
            sourceIds: row.source_ids,
            months: row.months,
            publicationAllowed: false,
          })),
        }),
      );
    } catch {
      res
        .status(503)
        .json({ error: "The local research store is unavailable." });
    }
  });
  router.get("/records", async (req, res) => {
    const query = recordQuery.safeParse(req.query);
    if (!query.success)
      return res.status(400).json({
        error: "Choose an area, dataset, and page of at most 30 records.",
      });
    try {
      const { area, dataset, offset, limit, month: selectedMonth } = query.data;
      const result = await read(async (db) => {
        const artifact = (
          await db.query(
            `SELECT artifact_id,dataset,sha256 FROM research.dataset_artifacts WHERE artifact_id=$1 AND NOT publication_allowed AND NOT synthetic`,
            [dataset],
          )
        ).rows[0];
        if (!artifact) return null;
        const total = Number(
          (
            await db.query(
              `SELECT count(*) AS total FROM research.dataset_records WHERE artifact_id=$1 AND pilot_id=$2 AND NOT publication_allowed AND NOT synthetic AND ($3::text IS NULL OR substring(observed_at from 1 for 7)=$3)`,
              [dataset, area, selectedMonth ?? null],
            )
          ).rows[0].total,
        );
        const rows = (
          await db.query(
            `SELECT record_key,source_id,source_url,fetched_at,observed_at,raw FROM research.dataset_records WHERE artifact_id=$1 AND pilot_id=$2 AND NOT publication_allowed AND NOT synthetic AND ($5::text IS NULL OR substring(observed_at from 1 for 7)=$5) ORDER BY record_key LIMIT $3 OFFSET $4`,
            [dataset, area, limit, offset, selectedMonth ?? null],
          )
        ).rows;
        return {
          graph: projection(area, String(artifact.dataset), artifact, rows),
          total,
          nextOffset:
            offset + rows.length < total ? offset + rows.length : null,
          dataset: {
            id: dataset,
            dataset: artifact.dataset,
            title: labelOf(String(artifact.dataset)),
          },
        };
      });
      if (!result)
        return res
          .status(404)
          .json({ error: "This research dataset is unavailable." });
      res.json(envelope(result));
    } catch {
      res
        .status(503)
        .json({ error: "The local research records are unavailable." });
    }
  });
  return router;
}
