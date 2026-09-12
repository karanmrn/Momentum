import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { buildEnrichmentImportPlan } from "../../scripts/enrichment/store.js";
import {
  importArtifact,
  type StoreClient,
} from "../../scripts/datasets/store/import.js";

it("stores all real enrichment artifacts privately and skips unchanged imports", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260912143718_private_research_datasets.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const client: StoreClient = {
      query: async (sql, values) => db.query(sql, values),
    };
    const plan = await buildEnrichmentImportPlan(
      new URL("../../", import.meta.url).pathname,
    );
    expect(plan.map((a) => a.recordCount)).toEqual([5, 6, 504]);
    for (const artifact of plan) await importArtifact(client, artifact);
    const count = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM research.dataset_records",
    );
    expect(count.rows[0].count).toBe(515);
    for (const artifact of plan)
      expect(await importArtifact(client, artifact)).toMatchObject({
        skipped: true,
      });
    const flags = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM research.dataset_records WHERE publication_allowed OR synthetic",
    );
    expect(flags.rows[0].count).toBe(0);
  } finally {
    await db.close();
  }
}, 20000);
