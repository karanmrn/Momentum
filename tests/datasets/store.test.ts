import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactId,
  assertResearchOnly,
  hashFile,
  importArtifact,
  inspectArtifact,
  jsonLines,
  MAX_RECORD_BYTES,
  sourcePath,
  type Artifact,
  type StoredRecord,
} from "../../scripts/datasets/store/import.js";
import { tflRecordSource } from "../../scripts/datasets/store/sources.js";
import { researchConnectionString } from "../../scripts/datasets/store/cli.js";

let database: PGlite;
let directory: string;
const record = (recordKey = "one"): StoredRecord => ({
  recordKey,
  pilotId: "camden_town",
  sourceId: "OSM",
  sourceUrl: "https://www.openstreetmap.org/node/1",
  fetchedAt: "2026-09-12T12:00:00Z",
  observedAt: "2026-07",
  raw: {
    sourceRecordKey: recordKey,
    name: "King's library",
    publicationAllowed: false,
    synthetic: false,
  },
});
function artifact(
  rows: StoredRecord[],
  changes: Partial<Artifact> = {},
): Artifact {
  return {
    dataset: "osm",
    relativePath: ".data/datasets/osm/test.json",
    sha256: "a".repeat(64),
    byteCount: 100,
    recordCount: rows.length,
    manifest: { sourceId: "OSM", publicationAllowed: false, synthetic: false },
    async *records() {
      for (const row of rows) yield row;
    },
    ...changes,
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "streetwise-store-"));
  database = new PGlite();
  await database.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260912143718_private_research_datasets.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
afterEach(async () => {
  await database.close();
  await rm(directory, { recursive: true, force: true });
});

describe("private dataset import", () => {
  it("binds transport records to the actual batch or station request and retrieval time", () => {
    const requests = [
      {
        sourceUrl: "https://api.tfl.gov.uk/Line/northern,mildmay/Status",
        fetchedAt: "2026-09-12T12:00:00Z",
      },
      {
        sourceUrl: "https://api.tfl.gov.uk/StopPoint/940GZZLUCTN",
        fetchedAt: "2026-09-12T11:59:00Z",
      },
    ];
    expect(tflRecordSource("line", "mildmay", requests)).toEqual(requests[0]);
    expect(tflRecordSource("station", "940GZZLUCTN", requests)).toEqual(
      requests[1],
    );
    expect(() => tflRecordSource("line", "north", requests)).toThrow(
      "tfl_request_mapping_mismatch",
    );
    expect(() =>
      tflRecordSource("line", "northern", [...requests, requests[0]]),
    ).toThrow("tfl_request_mapping_mismatch");
    expect(() =>
      tflRecordSource("line", "northern", [
        {
          ...requests[0],
          sourceUrl: "https://unrelated.test/Line/northern/Status",
        },
      ]),
    ).toThrow("tfl_request_mapping_mismatch");
  });

  it("rejects connection URL parameters that can override TLS verification", () => {
    const base =
      "postgresql://ingest:example-password@db.example.test/research";
    expect(researchConnectionString(base)).toBe(base);
    for (const option of [
      "sslmode=disable",
      "sslmode=no-verify",
      "sslmode=require",
      "sslcert=local.pem",
      "ssl=false",
      "uselibpqcompat=true",
    ]) {
      expect(() => researchConnectionString(`${base}?${option}`)).toThrow(
        "database_tls_override",
      );
    }
    expect(() => researchConnectionString("https://db.example.test/")).toThrow(
      "invalid_database_protocol",
    );
  });
  it("stores source identity, original precision and text through parameters", async () => {
    const value = artifact([
      record("key'); DROP TABLE research.dataset_records; --"),
    ]);
    await importArtifact(database, value);
    const result = await database.query(
      "SELECT record_key,observed_at,raw,publication_allowed,synthetic FROM research.dataset_records",
    );
    expect(result.rows[0]).toMatchObject({
      record_key: "key'); DROP TABLE research.dataset_records; --",
      observed_at: "2026-07",
      raw: { name: "King's library" },
      publication_allowed: false,
      synthetic: false,
    });
  });

  it("skips a repeated exact artifact and preserves a changed snapshot separately", async () => {
    const first = artifact([record()]);
    expect((await importArtifact(database, first)).skipped).toBe(false);
    expect((await importArtifact(database, first)).skipped).toBe(true);
    expect(
      (await importArtifact(database, { ...first, sha256: "b".repeat(64) }))
        .skipped,
    ).toBe(false);
    expect(
      (
        await database.query(
          "SELECT count(*) AS count FROM research.dataset_records",
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });

  it("rejects conflicting metadata or incomplete stored records on retry", async () => {
    const first = artifact([record()]);
    await importArtifact(database, first);
    await expect(
      importArtifact(database, {
        ...first,
        manifest: { ...first.manifest, revised: true },
      }),
    ).rejects.toThrow("stored_artifact_mismatch");
    await database.query(
      "DELETE FROM research.dataset_records WHERE artifact_id=$1",
      [artifactId(first)],
    );
    await expect(importArtifact(database, first)).rejects.toThrow(
      "stored_artifact_mismatch",
    );
  });

  it("rolls back rows already flushed when a later duplicate appears", async () => {
    const rows = Array.from({ length: 251 }, (_, index) =>
      record(`record-${index}`),
    );
    rows.push(record("record-0"));
    await expect(importArtifact(database, artifact(rows))).rejects.toThrow(
      "invalid_or_duplicate_record",
    );
    expect(
      (
        await database.query(
          "SELECT count(*) AS count FROM research.dataset_records",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await database.query(
          "SELECT count(*) AS count FROM research.dataset_artifacts",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("rolls back a count mismatch and retains valid empty artifacts", async () => {
    await expect(
      importArtifact(database, artifact([record()], { recordCount: 2 })),
    ).rejects.toThrow("record_count_mismatch");
    const empty = artifact([]);
    expect((await importArtifact(database, empty)).records).toBe(0);
    expect((await importArtifact(database, empty)).skipped).toBe(true);
  });

  it("rejects synthetic or publication-enabled nested payloads", async () => {
    for (const key of ["synthetic", "publicationAllowed", "alertEligible"]) {
      const item = { ...record(), raw: { nested: [{ [key]: true }] } };
      await expect(importArtifact(database, artifact([item]))).rejects.toThrow(
        "non_research_payload",
      );
    }
    expect(() =>
      assertResearchOnly({ records: [{ synthetic: true }] }),
    ).toThrow();
    expect(
      (
        await database.query(
          "SELECT count(*) AS count FROM research.dataset_artifacts",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("rejects unsupported pilots and oversized source records", async () => {
    await expect(
      importArtifact(
        database,
        artifact([
          { ...record(), pilotId: "london" } as unknown as StoredRecord,
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      importArtifact(
        database,
        artifact([
          { ...record(), raw: { text: "x".repeat(MAX_RECORD_BYTES) } },
        ]),
      ),
    ).rejects.toThrow("invalid_or_duplicate_record");
  });

  it("dry inspection checks counts and duplicates without database writes", async () => {
    expect(await inspectArtifact(artifact([record()]))).toMatchObject({
      records: 1,
      dataset: "osm",
    });
    await expect(
      inspectArtifact(artifact([record(), record()])),
    ).rejects.toThrow("invalid_or_duplicate_record");
    expect(
      (
        await database.query(
          "SELECT count(*) AS count FROM research.dataset_artifacts",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("streams multibyte JSON and preserves the exact input checksum", async () => {
    const path = join(directory, "rows.jsonl");
    const values = [{ name: "é".repeat(40_000) }, { id: 2 }];
    const bytes = values.map((value) => JSON.stringify(value)).join("\n");
    await writeFile(path, bytes);
    const fingerprint = await hashFile(path);
    expect(fingerprint.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    const rows = [];
    for await (const item of jsonLines(
      path,
      fingerprint.sha256,
      fingerprint.bytes,
    ))
      rows.push(item);
    expect(rows).toEqual(values);
  });

  it("rolls back when bytes change after the artifact hash was recorded", async () => {
    const path = join(directory, "rows.jsonl");
    await writeFile(path, JSON.stringify(record()) + "\n");
    const original = await hashFile(path);
    await writeFile(path, JSON.stringify(record("changed")) + "\n");
    const value = artifact([record()], {
      async *records() {
        for await (const item of jsonLines(
          path,
          original.sha256,
          original.bytes,
        ))
          yield item as StoredRecord;
      },
    });
    await expect(importArtifact(database, value)).rejects.toThrow(
      "artifact_changed",
    );
    expect(
      (
        await database.query(
          "SELECT count(*) AS count FROM research.dataset_artifacts",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it("rejects blank or oversized lines and paths outside the selected repository", async () => {
    for (const content of [
      "\n",
      JSON.stringify({ text: "x".repeat(MAX_RECORD_BYTES) }),
    ]) {
      const path = join(directory, "invalid.jsonl");
      await writeFile(path, content);
      const fingerprint = await hashFile(path);
      await expect(
        (async () => {
          for await (const _item of jsonLines(
            path,
            fingerprint.sha256,
            fingerprint.bytes,
          )) {
            /* Consume the full stream. */
          }
        })(),
      ).rejects.toThrow("record_limit");
    }
    const outside = join(tmpdir(), `outside-${Date.now()}.json`);
    await writeFile(outside, "{}");
    try {
      await symlink(outside, join(directory, "outside.json"));
      await expect(sourcePath(directory, "outside.json")).rejects.toThrow(
        "source_path_escape",
      );
      await expect(sourcePath(directory, "../outside.json")).rejects.toThrow(
        "invalid_source_path",
      );
    } finally {
      await rm(outside);
    }
  });
});
