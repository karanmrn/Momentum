import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import {
  pilotSchema,
  type PilotId,
} from "../../../packages/contracts/index.js";
import { projectOsmSnapshot } from "../../../packages/places/src/projection.js";
import { prioritySchema, priorityEvidence } from "../priorities/index.js";
import { anchors, sourceUrl } from "../police/collect.js";
import {
  assertResearchOnly,
  hashFile,
  jsonLines,
  sourcePath,
  type Artifact,
  type StoredRecord,
} from "./import.js";

const object = z.record(z.unknown());
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.string().datetime({ offset: true });
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const pilots = pilotSchema.options;
const flags = {
  publicationAllowed: z.literal(false),
  synthetic: z.literal(false),
};
const normalizationSchema = z.object({
  ...flags,
  alertEligible: z.literal(false),
  parserVersion: z.literal("police-evidence/1"),
  recordCount: z.number().int().nonnegative().max(200000),
  bytes: z.number().int().nonnegative(),
  sha256: sha,
});
const policeSchema = z
  .object({
    ...flags,
    alertEligible: z.literal(false),
    schemaVersion: z.literal("1.0"),
    id: sha,
    kind: z.literal("historical_police_record"),
    pilotId: pilotSchema,
    sourceFamilyId: z.literal("police-uk"),
    sourceSnapshot: sha,
    sourceRecordKey: z.string().max(100).nullable(),
    apiRecordId: z.number().int().nonnegative().nullable(),
    sourceUrl: z.string().url(),
    fetchedAt: time,
    observedMonth: month,
    spatialPrecision: z.literal("anonymised_point"),
    timePrecision: z.literal("month"),
    location: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
      .strict(),
    category: z.string().max(100),
    locationType: z.enum(["Force", "BTP"]),
    outcomeStatus: object.nullable(),
    queryGeography: z.literal("source_defined_one_mile_research_circle"),
  })
  .strict();
const scopeSchema = z.object({
  area: pilotSchema,
  month,
  sha256: sha,
  fetchedAt: time,
  sourceUrl: z.string().url(),
  recordCount: z.number().int().nonnegative(),
});

async function json(root: string, relativePath: string) {
  const path = await sourcePath(root, relativePath);
  const buffer = await readFile(path);
  if (buffer.length > 4_000_000) throw new Error("json_file_limit");
  const value: unknown = JSON.parse(buffer.toString("utf8"));
  assertResearchOnly(value);
  return {
    path,
    relativePath,
    value,
    byteCount: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
type JsonSource = Awaited<ReturnType<typeof json>>;

function jsonArtifact(
  source: JsonSource,
  dataset: string,
  manifest: Record<string, unknown>,
  rows: StoredRecord[],
): Artifact {
  return {
    dataset,
    relativePath: source.relativePath,
    sha256: source.sha256,
    byteCount: source.byteCount,
    recordCount: rows.length,
    manifest: JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>,
    async *records() {
      for (const row of rows) yield row;
      const verified = await hashFile(source.path);
      if (
        verified.sha256 !== source.sha256 ||
        verified.bytes !== source.byteCount
      )
        throw new Error("artifact_changed");
    },
  };
}

function row(
  recordKey: string,
  raw: Record<string, unknown>,
  sourceId: string,
  sourceUrl: string | null,
  fetchedAt: string | null,
  pilotId: PilotId | null = null,
  observedAt: string | null = null,
): StoredRecord {
  return {
    recordKey,
    raw,
    sourceId,
    sourceUrl,
    fetchedAt,
    pilotId,
    observedAt,
  };
}

/** Preserve the actual request URL and retrieval time, including whole-line batch requests. */
export function tflRecordSource(
  kind: "station" | "line",
  id: string,
  requests: { sourceUrl: string; fetchedAt: string }[],
) {
  const matches = requests.filter((request) => {
    const url = new URL(request.sourceUrl);
    if (
      url.origin !== "https://api.tfl.gov.uk" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return false;
    if (kind === "station") return url.pathname === `/StopPoint/${id}`;
    const batch = /^\/Line\/([a-z0-9,-]+)\/Status$/.exec(url.pathname);
    return batch?.[1].split(",").includes(id) ?? false;
  });
  if (matches.length !== 1) throw new Error("tfl_request_mapping_mismatch");
  return {
    sourceUrl: matches[0].sourceUrl,
    fetchedAt: time.parse(matches[0].fetchedAt),
  };
}

async function verifyReference(
  root: string,
  relative: string,
  checksum: string,
  bytes?: number,
) {
  if (!relative.startsWith(".data/datasets/"))
    throw new Error("invalid_evidence_path");
  const result = await hashFile(await sourcePath(root, relative));
  if (
    result.sha256 !== sha.parse(checksum) ||
    (bytes !== undefined && result.bytes !== bytes)
  )
    throw new Error("source_checksum_mismatch");
}

/** Read only the acquired dataset paths and their public manifests. No source requests occur. */
export async function buildImportPlan(root: string): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  const normalization = await json(
    root,
    ".data/datasets/police/.normalization.json",
  );
  const metadata = normalizationSchema.parse(normalization.value);
  const policeManifest = await json(
    root,
    ".data/datasets/police/manifest.json",
  );
  const manifest = z
    .object({
      ...flags,
      scopes: z.array(scopeSchema).max(3600),
      expectedScopes: z.number().int(),
      recordsStored: z.number().int(),
    })
    .parse(policeManifest.value);
  if (
    manifest.scopes.length !== manifest.expectedScopes ||
    manifest.recordsStored !== metadata.recordCount
  )
    throw new Error("police_manifest_mismatch");
  const scopes = new Map(
    manifest.scopes.map((scope) => [`${scope.area}/${scope.month}`, scope]),
  );
  if (scopes.size !== manifest.scopes.length)
    throw new Error("duplicate_scope");
  const relativePath = ".data/datasets/police/evidence.jsonl";
  const path = await sourcePath(root, relativePath);
  const verified = await hashFile(path);
  if (verified.sha256 !== metadata.sha256 || verified.bytes !== metadata.bytes)
    throw new Error("source_checksum_mismatch");
  artifacts.push({
    dataset: "police",
    relativePath,
    sha256: verified.sha256,
    byteCount: verified.bytes,
    recordCount: metadata.recordCount,
    manifest: {
      normalization: normalization.value,
      acquisition: policeManifest.value,
    },
    async *records() {
      const counts = new Map<string, number>();
      for await (const input of jsonLines(
        path,
        verified.sha256,
        verified.bytes,
      )) {
        const data = policeSchema.parse(input);
        const key = `${data.pilotId}/${data.observedMonth}`;
        const scope = scopes.get(key);
        const index = counts.get(key) ?? 0;
        const anchor = anchors.find((area) => area.id === data.pilotId)!;
        const id = createHash("sha256")
          .update(`${data.sourceUrl}\n${data.sourceSnapshot}\n${index}`)
          .digest("hex");
        if (
          !scope ||
          data.sourceSnapshot !== scope.sha256 ||
          data.fetchedAt !== scope.fetchedAt ||
          data.sourceUrl !== scope.sourceUrl ||
          data.sourceUrl !== sourceUrl(anchor, data.observedMonth) ||
          data.id !== id
        )
          throw new Error("police_record_scope_mismatch");
        counts.set(key, index + 1);
        yield row(
          data.id,
          object.parse(input),
          "police-uk",
          data.sourceUrl,
          data.fetchedAt,
          data.pilotId,
          data.observedMonth,
        );
      }
      for (const [key, scope] of scopes)
        if ((counts.get(key) ?? 0) !== scope.recordCount)
          throw new Error("police_scope_count_mismatch");
    },
  });

  const osmStatus = object.parse(
    (await json(root, "research/datasets/osm-status.json")).value,
  );
  const osmScopes = z
    .array(
      z.object({
        area: pilotSchema,
        persistedSha256: sha,
        records: z.number().int().nonnegative(),
      }),
    )
    .parse(osmStatus.scopes);
  for (const pilotId of pilots) {
    const source = await json(root, `.data/datasets/osm/${pilotId}.json`);
    const scope = osmScopes.find((item) => item.area === pilotId);
    const projection = projectOsmSnapshot(source.value, pilotId);
    if (
      !scope ||
      source.sha256 !== scope.persistedSha256 ||
      projection.status === "unavailable" ||
      projection.records.length !== scope.records
    )
      throw new Error("osm_source_mismatch");
    const snapshot = object.parse(source.value);
    const raw = z.array(object).parse(snapshot.records);
    artifacts.push(
      jsonArtifact(
        source,
        "osm",
        { ...snapshot, records: undefined },
        projection.records.map((place, index) =>
          row(
            place.sourceRecordKey,
            raw[index],
            "OSM",
            place.osmUrl,
            place.fetchedAt,
            pilotId,
            place.timestamp,
          ),
        ),
      ),
    );
  }

  const tflManifestSource = await json(
    root,
    "research/datasets/tfl-status.json",
  );
  const tflManifest = object.parse(tflManifestSource.value);
  const live = z
    .object({
      status: z.literal("collected"),
      requests: z
        .array(
          z.object({
            rawPath: z.string(),
            checksum: sha,
            bytes: z.number().int(),
            sourceUrl: z.string().url(),
            fetchedAt: time,
            httpStatus: z.literal(200),
          }),
        )
        .max(100),
    })
    .parse(tflManifest.live);
  for (const request of live.requests) {
    await verifyReference(
      root,
      request.rawPath,
      request.checksum,
      request.bytes,
    );
    const source = await json(root, request.rawPath);
    artifacts.push(
      jsonArtifact(source, "tfl_snapshot", request, [
        row(
          request.rawPath,
          { payload: source.value },
          "TFL-UNIFIED",
          request.sourceUrl,
          request.fetchedAt,
        ),
      ]),
    );
  }
  const selectedTfl = await json(root, ".data/datasets/tfl/selected-tfl.json");
  const tfl = z
    .object({
      ...flags,
      sourceId: z.literal("TFL-UNIFIED"),
      fetchedAt: time,
      stations: z
        .array(z.object({ id: z.string(), pilotId: pilotSchema }).passthrough())
        .max(10),
      lineStatuses: z
        .array(z.object({ id: z.string() }).passthrough())
        .max(100),
    })
    .parse(selectedTfl.value);
  artifacts.push(
    jsonArtifact(
      selectedTfl,
      "tfl",
      {
        parserVersion: "research-tfl/2",
        acquisition: tflManifest,
        selected: { ...tfl, stations: undefined, lineStatuses: undefined },
      },
      [
        ...tfl.stations.map((item) => {
          const source = tflRecordSource("station", item.id, live.requests);
          return row(
            `station/${item.id}`,
            item,
            "TFL-UNIFIED",
            source.sourceUrl,
            source.fetchedAt,
            item.pilotId,
          );
        }),
        ...tfl.lineStatuses.map((item) => {
          const source = tflRecordSource("line", item.id, live.requests);
          return row(
            `line/${item.id}`,
            item,
            "TFL-UNIFIED",
            source.sourceUrl,
            source.fetchedAt,
          );
        }),
      ],
    ),
  );
  const stopsSource = await json(
    root,
    ".data/datasets/tfl/selected-stops.json",
  );
  const stops = z
    .object({
      ...flags,
      sourceUrl: z.string().url(),
      fetchedAt: time,
      records: z
        .array(
          z
            .object({
              pilotId: pilotSchema,
              sourceId: z.literal("DFT-NAPTAN"),
              record: z
                .object({ ATCOCode: z.string().min(1).max(100) })
                .passthrough(),
            })
            .passthrough(),
        )
        .max(100),
    })
    .parse(stopsSource.value);
  artifacts.push(
    jsonArtifact(
      stopsSource,
      "naptan",
      { parserVersion: "research-naptan/2", acquisition: tflManifest },
      stops.records.map((item) =>
        row(
          `${item.pilotId}/${item.record.ATCOCode}`,
          item,
          item.sourceId,
          stops.sourceUrl,
          stops.fetchedAt,
          item.pilotId,
        ),
      ),
    ),
  );

  const onsSource = await json(root, "research/datasets/ons-status.json");
  const ons = z
    .object({
      ...flags,
      fetchedAt: time,
      period: z.string(),
      queryUrl: z.string().url(),
      rowCount: z.number().int(),
      evidence: z
        .array(
          z.object({
            rawPath: z.string(),
            sha256: sha,
            bytes: z.number().int(),
          }),
        )
        .max(10),
      pilots: z
        .array(
          z.object({
            pilotId: pilotSchema,
            counts: z
              .array(
                z
                  .object({
                    geographyCode: z.string().regex(/^E0[12]\d{6}$/),
                    usualResidents: z.number().int().nonnegative(),
                  })
                  .passthrough(),
              )
              .max(10),
          }),
        )
        .length(3),
    })
    .parse(onsSource.value);
  for (const evidence of ons.evidence)
    await verifyReference(
      root,
      evidence.rawPath,
      evidence.sha256,
      evidence.bytes,
    );
  const onsRows = ons.pilots.flatMap((pilot) =>
    pilot.counts.map((count) =>
      row(
        `${pilot.pilotId}/${count.geographyCode}`,
        count,
        "ONS-TS001",
        ons.queryUrl,
        ons.fetchedAt,
        pilot.pilotId,
        ons.period,
      ),
    ),
  );
  if (onsRows.length !== ons.rowCount) throw new Error("ons_count_mismatch");
  artifacts.push(
    jsonArtifact(onsSource, "ons", object.parse(onsSource.value), onsRows),
  );

  const priorityStatus = z
    .object({
      areas: z
        .array(
          z
            .object({
              pilotId: pilotSchema,
              checksum: sha,
              sourceUrl: z.string().url(),
              fetchedAt: time,
              priorityCount: z.number().int(),
            })
            .passthrough(),
        )
        .length(3),
    })
    .parse(
      (await json(root, "research/datasets/priorities-status.json")).value,
    );
  for (const pilotId of pilots) {
    const status = priorityStatus.areas.find(
      (item) => item.pilotId === pilotId,
    );
    if (!status) throw new Error("priority_scope_missing");
    const source = await json(
      root,
      `.data/datasets/priorities/${pilotId}-raw.json`,
    );
    const priorities = z.array(prioritySchema).max(100).parse(source.value);
    if (
      source.sha256 !== status.checksum ||
      priorities.length !== status.priorityCount
    )
      throw new Error("priority_source_mismatch");
    const evidence = priorityEvidence(
      pilotId,
      status.sourceUrl,
      status.fetchedAt,
      priorities,
    );
    artifacts.push(
      jsonArtifact(
        source,
        "priorities",
        { acquisition: status, evidence },
        priorities.map((item, index) =>
          row(
            `${evidence.snapshotId}/${index}`,
            item,
            "police-uk-priorities",
            status.sourceUrl,
            status.fetchedAt,
            pilotId,
            item["issue-date"],
          ),
        ),
      ),
    );
  }

  const manifestDir = resolveManifestDirectory(root);
  const names = (await readdir(manifestDir))
    .filter((name) => /^[a-z0-9-]+\.json$/.test(name))
    .sort();
  if (names.length > 50) throw new Error("manifest_count_limit");
  for (const name of names) {
    const source = await json(root, `research/datasets/${name}`);
    artifacts.push(
      jsonArtifact(source, "manifest", object.parse(source.value), []),
    );
  }
  return artifacts;
}

function resolveManifestDirectory(root: string) {
  return `${root.replace(/\/$/, "")}/research/datasets`;
}
