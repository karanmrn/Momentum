import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  projectSemanticGraph,
  type SemanticGraph,
} from "../../packages/semantic-graph/index.js";
import {
  readSemanticGraph,
  replaceSemanticGraph,
} from "../../server/semantic-store.js";
const a = "a".repeat(64),
  b = "b".repeat(64);
const pilot = "camden_town";
let pg: PGlite;
async function scoped<T>(id: string, fn: (tx: Transaction) => Promise<T>) {
  return pg.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.demo_session',$1,true)", [id]);
    await tx.exec("SET LOCAL ROLE streetwise_demo_app");
    await tx.query(
      "SELECT id FROM streetwise_demo_sessions WHERE id=$1 FOR UPDATE",
      [id],
    );
    return fn(tx);
  });
}
function graph(label = "Approved place"): SemanticGraph {
  const base = projectSemanticGraph(null, pilot, []);
  base.nodes.push({
    id: "place:one",
    type: "Place",
    label,
    synthetic: true,
    provenance: null,
    metadata: {},
  });
  base.assertions.push({
    id: "assertion:one",
    subjectId: "place:one",
    predicate: "WITHIN_AREA",
    objectId: base.nodes[0].id,
    inferenceType: "human_review",
    reasonCodes: ["reviewed_approximate_place"],
    evidenceRefs: ["place:one"],
    methodVersion: "1.0",
    synthetic: true,
  });
  return base;
}
beforeEach(async () => {
  pg = new PGlite();
  for (const name of [
    "001_demo_sessions.sql",
    "002_semantic_graph.sql",
    "003_camden_graph.sql",
  ])
    await pg.exec(
      await readFile(
        new URL(`../../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await pg.query(
    "INSERT INTO streetwise_demo_sessions(id,state) VALUES ($1,$3),($2,$3)",
    [a, b, { schemaVersion: "1.0" }],
  );
});
afterEach(async () => {
  await pg.close();
});
describe("session graph projection storage", () => {
  it("round trips qualified assertions under the nonowner role", async () => {
    const value = graph("O'Brien'); DROP TABLE streetwise_demo_sessions; --");
    await scoped(a, async (tx) => {
      await replaceSemanticGraph(tx, a, [value]);
      expect(await readSemanticGraph(tx, a, pilot)).toEqual(value);
    });
  });
  it("hides other sessions from reads, writes, joins and counts", async () => {
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()]));
    await scoped(b, async (tx) => {
      expect(await readSemanticGraph(tx, a, pilot)).toBeNull();
      expect(
        (
          await tx.query(
            "SELECT count(*)::integer AS total FROM streetwise_semantic_nodes",
          )
        ).rows,
      ).toEqual([{ total: 0 }]);
      expect(
        (
          await tx.query(
            "SELECT n.id FROM streetwise_semantic_nodes n JOIN streetwise_semantic_assertions a ON n.id=a.subject_id",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await tx.query(
            "DELETE FROM streetwise_semantic_snapshots WHERE session_id=$1 RETURNING session_id",
            [a],
          )
        ).rows,
      ).toEqual([]);
    });
    await expect(
      scoped(b, (tx) => replaceSemanticGraph(tx, a, [graph()])),
    ).rejects.toThrow(/row-level security/);
    expect(await scoped(a, (tx) => readSemanticGraph(tx, a, pilot))).toEqual(
      graph(),
    );
  });
  it("replaces corrections and removes withdrawn nodes and relations", async () => {
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()]));
    await scoped(a, (tx) =>
      replaceSemanticGraph(tx, a, [graph("Corrected place")]),
    );
    expect(await scoped(a, (tx) => readSemanticGraph(tx, a, pilot))).toEqual(
      graph("Corrected place"),
    );
    const withdrawn = projectSemanticGraph(null, pilot, []);
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [withdrawn]));
    expect(await scoped(a, (tx) => readSemanticGraph(tx, a, pilot))).toEqual(
      withdrawn,
    );
    expect(
      (
        await pg.query(
          "SELECT id FROM streetwise_semantic_assertions WHERE id='assertion:one'",
        )
      ).rows,
    ).toEqual([]);
  });
  it("rolls back state and graph together after a failed replacement transaction", async () => {
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()]));
    await expect(
      scoped(a, async (tx) => {
        await tx.query(
          "UPDATE streetwise_demo_sessions SET state=state||'{\"changed\":true}'::jsonb WHERE id=$1",
          [a],
        );
        await replaceSemanticGraph(tx, a, [graph("Never committed")]);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await scoped(a, (tx) => readSemanticGraph(tx, a, pilot))).toEqual(
      graph(),
    );
    expect(
      (
        await pg.query<{ state: unknown }>(
          "SELECT state FROM streetwise_demo_sessions WHERE id=$1",
          [a],
        )
      ).rows[0].state,
    ).toEqual({ schemaVersion: "1.0" });
  });
  it("hides expired graphs and cascades deletion", async () => {
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()]));
    await pg.query(
      "UPDATE streetwise_demo_sessions SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [a],
    );
    expect(await scoped(a, (tx) => readSemanticGraph(tx, a, pilot))).toBeNull();
    await expect(
      scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()])),
    ).rejects.toThrow(/row-level security/);
    await pg.query("DELETE FROM streetwise_demo_sessions WHERE id=$1", [a]);
    expect(
      (await pg.query("SELECT id FROM streetwise_semantic_nodes")).rows,
    ).toEqual([]);
    expect(
      (await pg.query("SELECT id FROM streetwise_semantic_assertions")).rows,
    ).toEqual([]);
  });
  it("rejects dangling and wrong-type edges at the database boundary", async () => {
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()]));
    await expect(
      scoped(a, (tx) =>
        tx.query(
          "UPDATE streetwise_semantic_assertions SET object_id='missing',data=jsonb_set(data,'{objectId}','\"missing\"') WHERE session_id=$1",
          [a],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      scoped(a, (tx) =>
        tx.query(
          "UPDATE streetwise_semantic_assertions SET predicate='AFFECTS_PLACE',data=jsonb_set(data,'{predicate}','\"AFFECTS_PLACE\"') WHERE session_id=$1",
          [a],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
  it("rejects malformed and duplicate projections before replacing stored data", async () => {
    await scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph()]));
    await expect(
      scoped(a, (tx) => replaceSemanticGraph(tx, a, [graph(), graph()])),
    ).rejects.toThrow("Duplicate pilot graph");
    await expect(
      scoped(a, (tx) => readSemanticGraph(tx, "' OR true", pilot)),
    ).rejects.toThrow("Invalid session");
    expect(await scoped(a, (tx) => readSemanticGraph(tx, a, pilot))).toEqual(
      graph(),
    );
  });
});
