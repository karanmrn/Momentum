import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { pilotSchema } from "../../../packages/contracts/index.js";

export const MAX_FILE_BYTES = 200_000_000;
export const MAX_RECORD_BYTES = 262_144;
export const MAX_RECORDS = 200_000;
export const BATCH_SIZE = 250;
const MAX_BATCH_BYTES = 1_000_000;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z
  .object({
    recordKey: z.string().min(1).max(500),
    pilotId: pilotSchema.nullable(),
    sourceId: z.string().min(1).max(100),
    sourceUrl: z.string().url().max(3000).nullable(),
    fetchedAt: z.string().datetime({ offset: true }).nullable(),
    observedAt: z.string().max(100).nullable(),
    raw: z.record(z.unknown()),
  })
  .strict();
export type StoredRecord = z.infer<typeof recordSchema>;
export interface Artifact {
  dataset: string;
  relativePath: string;
  sha256: string;
  byteCount: number;
  recordCount: number;
  manifest: Record<string, unknown>;
  records(): AsyncIterable<StoredRecord>;
}
export interface StoreClient {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Reject any synthetic or publication-enabled payload before storage. */
export function assertResearchOnly(value: unknown, depth = 0): void {
  if (depth > 30) throw new Error("record_nesting_limit");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (
      (key === "synthetic" ||
        key === "publicationAllowed" ||
        key === "alertEligible") &&
      child === true
    ) {
      throw new Error("non_research_payload");
    }
    assertResearchOnly(child, depth + 1);
  }
}

export async function sourcePath(
  root: string,
  relative: string,
): Promise<string> {
  if (
    !relative ||
    relative.startsWith("/") ||
    relative.split(/[\\/]/).includes("..")
  )
    throw new Error("invalid_source_path");
  const base = await realpath(root);
  const path = await realpath(resolve(base, relative));
  if (!path.startsWith(base + sep)) throw new Error("source_path_escape");
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_FILE_BYTES)
    throw new Error("source_file_limit");
  return path;
}

export async function hashFile(path: string) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    bytes += chunk.length;
    if (bytes > MAX_FILE_BYTES) throw new Error("source_file_limit");
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), bytes };
}

/** Stream bounded lines and verify the exact bytes again after the final record. */
export async function* jsonLines(
  path: string,
  expectedHash: string,
  expectedBytes: number,
): AsyncGenerator<unknown> {
  const hash = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  let pending = "",
    bytes = 0,
    count = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    bytes += chunk.length;
    if (bytes > MAX_FILE_BYTES) throw new Error("source_file_limit");
    hash.update(chunk);
    pending += decoder.write(chunk);
    let end: number;
    while ((end = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (
        !line.trim() ||
        Buffer.byteLength(line) > MAX_RECORD_BYTES ||
        ++count > MAX_RECORDS
      )
        throw new Error("record_limit");
      yield JSON.parse(line);
    }
    if (Buffer.byteLength(pending) > MAX_RECORD_BYTES)
      throw new Error("record_limit");
  }
  pending += decoder.end();
  if (pending) {
    if (
      !pending.trim() ||
      Buffer.byteLength(pending) > MAX_RECORD_BYTES ||
      ++count > MAX_RECORDS
    )
      throw new Error("record_limit");
    yield JSON.parse(pending);
  }
  if (bytes !== expectedBytes || hash.digest("hex") !== expectedHash)
    throw new Error("artifact_changed");
}

export function artifactId(artifact: Artifact) {
  return createHash("sha256")
    .update(`${artifact.dataset}\n${artifact.relativePath}\n${artifact.sha256}`)
    .digest("hex");
}

function validateArtifact(artifact: Artifact) {
  z.string().min(1).max(100).parse(artifact.dataset);
  z.string().min(1).max(500).parse(artifact.relativePath);
  hashSchema.parse(artifact.sha256);
  z.number().int().min(0).max(MAX_FILE_BYTES).parse(artifact.byteCount);
  z.number().int().min(0).max(MAX_RECORDS).parse(artifact.recordCount);
  z.record(z.unknown()).parse(artifact.manifest);
  assertResearchOnly(artifact.manifest);
}

export async function inspectArtifact(artifact: Artifact) {
  validateArtifact(artifact);
  const seen = new Set<string>();
  for await (const raw of artifact.records()) {
    const record = recordSchema.parse(raw);
    assertResearchOnly(record.raw);
    if (
      Buffer.byteLength(JSON.stringify(record)) > MAX_RECORD_BYTES ||
      seen.has(record.recordKey)
    )
      throw new Error("invalid_or_duplicate_record");
    seen.add(record.recordKey);
    if (seen.size > MAX_RECORDS) throw new Error("record_limit");
  }
  if (seen.size !== artifact.recordCount)
    throw new Error("record_count_mismatch");
  return {
    dataset: artifact.dataset,
    records: seen.size,
    bytes: artifact.byteCount,
    sha256: artifact.sha256,
  };
}

/** One artifact commits atomically. Conflicts preserve the existing immutable snapshot. */
export async function importArtifact(client: StoreClient, artifact: Artifact) {
  validateArtifact(artifact);
  const id = artifactId(artifact);
  await client.query("BEGIN");
  try {
    const inserted = await client.query(
      `INSERT INTO research.dataset_artifacts
       (artifact_id,dataset,relative_path,sha256,byte_count,record_count,manifest,publication_allowed,synthetic)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,false,false)
       ON CONFLICT (artifact_id) DO NOTHING RETURNING artifact_id`,
      [
        id,
        artifact.dataset,
        artifact.relativePath,
        artifact.sha256,
        artifact.byteCount,
        artifact.recordCount,
        JSON.stringify(artifact.manifest),
      ],
    );
    if (!inserted.rows.length) {
      const existing = await client.query(
        `SELECT a.dataset,a.relative_path,a.sha256,a.byte_count,a.record_count,a.manifest,
         (SELECT count(*) FROM research.dataset_records r WHERE r.artifact_id=a.artifact_id) AS stored_count
         FROM research.dataset_artifacts a WHERE a.artifact_id=$1`,
        [id],
      );
      const row = existing.rows[0];
      if (
        !row ||
        row.dataset !== artifact.dataset ||
        row.relative_path !== artifact.relativePath ||
        row.sha256 !== artifact.sha256 ||
        Number(row.byte_count) !== artifact.byteCount ||
        Number(row.record_count) !== artifact.recordCount ||
        Number(row.stored_count) !== artifact.recordCount ||
        !isDeepStrictEqual(row.manifest, artifact.manifest)
      )
        throw new Error("stored_artifact_mismatch");
      // Validate the supplied bytes and rows even when the database already contains this artifact.
      await inspectArtifact(artifact);
      await client.query("COMMIT");
      return { artifactId: id, records: artifact.recordCount, skipped: true };
    }
    let batch: StoredRecord[] = [],
      batchBytes = 0,
      count = 0;
    const seen = new Set<string>();
    async function flush() {
      if (!batch.length) return;
      await client.query(
        `INSERT INTO research.dataset_records
         (artifact_id,record_key,pilot_id,source_id,source_url,fetched_at,observed_at,raw,publication_allowed,synthetic)
         SELECT $1,r."recordKey",r."pilotId",r."sourceId",r."sourceUrl",r."fetchedAt"::timestamptz,r."observedAt",r.raw,false,false
         FROM jsonb_to_recordset($2::jsonb) AS r("recordKey" text,"pilotId" text,"sourceId" text,"sourceUrl" text,"fetchedAt" text,"observedAt" text,raw jsonb)`,
        [id, JSON.stringify(batch)],
      );
      batch = [];
      batchBytes = 0;
    }
    for await (const raw of artifact.records()) {
      const record = recordSchema.parse(raw);
      assertResearchOnly(record.raw);
      const size = Buffer.byteLength(JSON.stringify(record));
      if (size > MAX_RECORD_BYTES || seen.has(record.recordKey))
        throw new Error("invalid_or_duplicate_record");
      seen.add(record.recordKey);
      if (++count > MAX_RECORDS) throw new Error("record_limit");
      if (batch.length >= BATCH_SIZE || batchBytes + size > MAX_BATCH_BYTES)
        await flush();
      batch.push(record);
      batchBytes += size;
    }
    await flush();
    if (count !== artifact.recordCount)
      throw new Error("record_count_mismatch");
    await client.query("COMMIT");
    return { artifactId: id, records: count, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
