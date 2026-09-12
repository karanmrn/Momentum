import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDatabase } from "../../server/database.js";
import { createDemoState } from "../../packages/domain/index.js";

it("stores and reads the complete demo graph with enrichment under session RLS", async () => {
  const db = await createDatabase(createDemoState, { path: "memory://" });
  const session = "e".repeat(64);
  try {
    await db.create(session);
    for (const area of [
      "hounslow_town_centre",
      "camden_town",
      "west_croydon",
    ] as const) {
      const graph = await db.graph(session, area);
      expect(
        graph.nodes.some((node) => node.type === "HistoricalAggregate"),
      ).toBe(true);
      expect(
        graph.nodes.some((node) => node.type === "AvailabilityAssertion"),
      ).toBe(true);
      expect(
        graph.assertions.some((edge) => edge.predicate === "EXTRACTED_FROM"),
      ).toBe(true);
      expect(graph.truncated).toBe(false);
    }
    await expect(db.graph("f".repeat(64), "camden_town")).rejects.toThrow(
      "Session unavailable",
    );
  } finally {
    await db.close();
  }
}, 30000);

it("reopens a persistent enriched graph without replaying older constraints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "momentum-graph-"));
  const path = join(directory, "database");
  const session = "c".repeat(64);
  try {
    const initial = await createDatabase(createDemoState, { path });
    try {
      await initial.create(session);
      await initial.graph(session, "camden_town");
    } finally {
      await initial.close();
    }
    // Simulate a populated database created by the pre-ledger loader.
    const legacy = new PGlite(path);
    await legacy.exec("DROP TABLE public.streetwise_local_migrations");
    await legacy.close();
    const reopened = await createDatabase(createDemoState, { path });
    try {
      const graph = await reopened.graph(session, "camden_town");
      expect(graph.nodes.some((node) => node.type === "PoliceOutcome")).toBe(
        true,
      );
    } finally {
      await reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

it("upgrades a populated older local database without a migration ledger", async () => {
  const directory = await mkdtemp(join(tmpdir(), "momentum-legacy-graph-"));
  const path = join(directory, "database");
  const session = "b".repeat(64);
  try {
    const legacy = new PGlite(path);
    try {
      for (const migration of [
        "001_demo_sessions.sql",
        "002_semantic_graph.sql",
        "003_camden_graph.sql",
        "004_reviewed_relations.sql",
      ])
        await legacy.exec(
          await readFile(
            new URL(`../../supabase/migrations/${migration}`, import.meta.url),
            "utf8",
          ),
        );
      await legacy.query(
        "INSERT INTO public.streetwise_demo_sessions(id,state) VALUES ($1,$2::jsonb)",
        [session, JSON.stringify(createDemoState())],
      );
      await legacy.query(
        "INSERT INTO public.streetwise_semantic_snapshots(session_id,pilot_id,metadata) VALUES ($1,'camden_town',$2::jsonb)",
        [
          session,
          JSON.stringify({
            ontologyVersion: "1.0",
            pilotId: "camden_town",
            limitations: [],
            truncated: false,
          }),
        ],
      );
      await legacy.query(
        "INSERT INTO public.streetwise_semantic_nodes(session_id,pilot_id,id,node_type,ordinal,data) VALUES ($1,'camden_town','area:camden_town','Area',0,$2::jsonb)",
        [
          session,
          JSON.stringify({
            id: "area:camden_town",
            type: "Area",
            label: "Camden",
            synthetic: false,
            provenance: null,
            metadata: {},
          }),
        ],
      );
    } finally {
      await legacy.close();
    }
    const upgraded = await createDatabase(createDemoState, { path });
    try {
      const graph = await upgraded.graph(session, "camden_town");
      expect(graph.nodes.some((node) => node.type === "PoliceOutcome")).toBe(
        true,
      );
    } finally {
      await upgraded.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
