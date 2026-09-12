import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { request, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createGraphResearchRouter,
  type GraphResearchOptions,
} from "../server/graph-research";
import {
  artifactId,
  importArtifact,
  type Artifact,
  type StoredRecord,
} from "../scripts/datasets/store/import";
import { semanticGraphSchema } from "../packages/semantic-graph/schema";

let database: PGlite;
const servers: Server[] = [];
const ids: Record<string, string> = {};
let origin: string;
async function start(options: GraphResearchOptions, authenticated = true) {
  const app = express();
  if (authenticated)
    app.use((_req, res, next) => {
      res.locals.sessionId = "local-demo-test";
      next();
    });
  app.use("/research", createGraphResearchRouter(options));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/research`;
}
const options = (): GraphResearchOptions => ({
  env: { GRAPH_RESEARCH_DB_PATH: "/local/research", NODE_ENV: "test" },
  openDatabase: async () => database,
});
const rawPolice = {
  category: "burglary",
  observedMonth: "2026-07",
  sourceSnapshot: "b".repeat(64),
  location: { latitude: 51.53, longitude: -0.14 },
  person: "PRIVATE PERSON",
  narrative: "PRIVATE REPORT",
  token: "SECRET TOKEN",
};
const sourceRow = (
  key: string,
  raw: Record<string, unknown>,
  pilotId: StoredRecord["pilotId"] = "camden_town",
): StoredRecord => ({
  recordKey: key,
  pilotId,
  sourceId: "police-uk",
  sourceUrl: "https://data.police.uk/api/crimes-street/all-crime",
  fetchedAt: "2026-09-12T12:00:00Z",
  observedAt: "2026-07",
  raw,
});
async function add(dataset: string, rows: StoredRecord[]) {
  const artifact: Artifact = {
    dataset,
    relativePath: `.data/${dataset}.json`,
    sha256: "a".repeat(64),
    byteCount: 100,
    recordCount: rows.length,
    manifest: { privateNarrative: "MANIFEST SECRET" },
    async *records() {
      yield* rows;
    },
  };
  ids[dataset] = artifactId(artifact);
  await importArtifact(database, artifact);
}
beforeAll(async () => {
  database = new PGlite();
  await database.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260912143718_private_research_datasets.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await add("police", [
    ...Array.from({ length: 35 }, (_, i) =>
      sourceRow(String(i).padStart(2, "0"), rawPolice),
    ),
    sourceRow(
      "hounslow",
      { ...rawPolice, category: "other-area-secret" },
      "hounslow_town_centre",
    ),
    sourceRow(
      "unassigned",
      { ...rawPolice, category: "unassigned-secret" },
      null,
    ),
  ]);
  await add("manifest", []);
  await add("osm", [
    sourceRow("place", {
      tags: {
        amenity: "library",
        name: "Listed library",
        operator: "SECRET PERSON",
      },
      coordinates: { lat: 51.5, lon: -0.1 },
      coordinateMeaning: "mapped_point",
    }),
  ]);
  await add("tfl", [
    sourceRow("station", {
      commonName: "Camden Town",
      id: "940GZZLUCTN",
      lat: 51.5,
      lon: -0.1,
      privateContact: "SECRET PERSON",
    }),
  ]);
  await add("tfl_snapshot", [
    sourceRow(
      "request",
      { payload: { sensitive: "RAW PAYLOAD SECRET" } },
      null,
    ),
  ]);
  await add("naptan", [
    sourceRow("stop", {
      record: {
        ATCOCode: "490000000A",
        CommonName: "Station stop",
        StopType: "BCT",
        Latitude: "51.5",
        Longitude: "-0.1",
        Creation: "SECRET PERSON",
      },
    }),
  ]);
  await add("ons", [
    sourceRow("area", {
      geographyCode: "E01000863",
      usualResidents: 1476,
      householdPerson: "SECRET PERSON",
    }),
  ]);
  await add("priorities", [
    sourceRow("priority", {
      issue: "UNREVIEWED NARRATIVE",
      action: "UNREVIEWED ACTION",
      "issue-date": "2026-07-01T00:00:00",
      "action-date": "2026-08-01T00:00:00",
    }),
  ]);
  await add("enrichment-ons-geography", [
    sourceRow("assignment", {
      containingArea: { name: "Camden 021A", code: "E01000863" },
      level: "LSOA",
      status: "boundary_ambiguous",
      population: { usualResidents: 1476, scope: "whole_statistical_area" },
      boundaryEvidence: [{ rawPath: "PRIVATE PATH" }],
    }),
  ]);
  await add("enrichment-mps-context", [
    sourceRow("count", {
      minorCategory: "THEFT",
      borough: "Camden",
      month: "2026-07",
      count: 50,
      valueStatus: "known",
      sourceSnapshotSha256: "c".repeat(64),
      privateField: "SECRET PERSON",
    }),
  ]);
  await add("enrichment-police-outcomes", [
    sourceRow("outcome", {
      expectedCrime: {
        category: "burglary",
        month: "2026-07",
        persistentId: "PRIVATE IDENTIFIER",
      },
      status: "available",
      outcomes: [
        {
          categoryName: "Under investigation",
          month: "2026-08",
          personId: "SECRET PERSON",
        },
      ],
    }),
  ]);
  origin = await start(options());
});
afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await database.close();
});
const records = (dataset: string, suffix = "") =>
  fetch(`${origin}/records?area=camden_town&dataset=${ids[dataset]}${suffix}`);

describe("local research graph API", () => {
  it("lists all stored artifacts with area counts and no raw manifests", async () => {
    const response = await fetch(`${origin}/catalog?area=camden_town`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data.datasets).toHaveLength(11);
    expect(body.data).toMatchObject({
      localResearchOnly: true,
      publicationAllowed: false,
    });
    expect(
      body.data.datasets.find(
        (row: { dataset: string }) => row.dataset === "police",
      ),
    ).toMatchObject({
      totalRecords: 37,
      areaRecordCount: 35,
      months: ["2026-07"],
      sourceIds: ["police-uk"],
    });
    expect(
      body.data.datasets.find(
        (row: { dataset: string }) => row.dataset === "manifest",
      ).areaRecordCount,
    ).toBe(0);
    expect(JSON.stringify(body)).not.toContain("MANIFEST SECRET");
  });

  it("paginates selected-area police rows with qualified source and no private fields", async () => {
    const response = await records("police", "&limit=30");
    expect(response.status).toBe(200);
    const body = await response.json(),
      data = body.data;
    expect(data.total).toBe(35);
    expect(data.nextOffset).toBe(30);
    const graph = semanticGraphSchema.parse(data.graph);
    expect(graph.nodes).toHaveLength(32);
    expect(graph.assertions).toHaveLength(60);
    const row = graph.nodes.find((node) => node.type === "DatasetRecord")!;
    expect(row.metadata.precision).toBe("anonymised_point");
    expect(row.metadata.sourceRecordKey).toBe("00");
    expect(
      graph.assertions
        .filter((edge) => edge.predicate === "CONTEXTUAL_AREA_ONLY")
        .every((edge) => edge.inferenceType === "deterministic_join"),
    ).toBe(true);
    expect(row.metadata.months).toEqual(["2026-07"]);
    expect(row.provenance?.snapshotSha256).toBe("b".repeat(64));
    expect(
      graph.assertions.every((edge) =>
        ["CONTEXTUAL_AREA_ONLY", "ISSUED_BY"].includes(edge.predicate),
      ),
    ).toBe(true);
    for (const forbidden of [
      "PRIVATE",
      "SECRET",
      "other-area-secret",
      "unassigned-secret",
      '"raw"',
    ])
      expect(JSON.stringify(body)).not.toContain(forbidden);
    const second = (
      await (await records("police", "&limit=30&offset=30")).json()
    ).data;
    expect(
      second.graph.nodes.filter(
        (node: { type: string }) => node.type === "DatasetRecord",
      ),
    ).toHaveLength(5);
    expect(second.nextOffset).toBeNull();
    const firstIds = new Set(
      graph.nodes
        .filter((node) => node.type === "DatasetRecord")
        .map((node) => node.id),
    );
    expect(
      second.graph.nodes
        .filter((node: { type: string }) => node.type === "DatasetRecord")
        .every((node: { id: string }) => !firstIds.has(node.id)),
    ).toBe(true);
  });

  it("projects every supported family through a field allowlist", async () => {
    for (const dataset of [
      "osm",
      "tfl",
      "naptan",
      "ons",
      "priorities",
      "enrichment-ons-geography",
      "enrichment-mps-context",
      "enrichment-police-outcomes",
    ]) {
      const response = await records(dataset);
      expect(response.status, dataset).toBe(200);
      const body = await response.json();
      semanticGraphSchema.parse(body.data.graph);
      const serialized = JSON.stringify(body);
      for (const forbidden of ["SECRET", "PRIVATE", "UNREVIEWED", '"raw"'])
        expect(serialized, dataset).not.toContain(forbidden);
    }
    const osm = (await (await records("osm")).json()).data.graph;
    expect(JSON.stringify(osm)).toContain(
      "does not establish help scheme membership",
    );
    const census = (await (await records("ons")).json()).data.graph;
    expect(JSON.stringify(census)).toContain("not a crime rate denominator");
  });

  it("does not invent a zero coordinate when NaPTAN coordinates are blank", async () => {
    await database.query(
      "UPDATE research.dataset_records SET raw=jsonb_set(jsonb_set(raw,'{record,Latitude}','\" \"'::jsonb),'{record,Longitude}','\"\"'::jsonb) WHERE artifact_id=$1",
      [ids.naptan],
    );
    const body = await (await records("naptan")).json();
    const record = body.data.graph.nodes.find(
      (node: { type: string }) => node.type === "DatasetRecord",
    );
    expect(record.metadata.coordinates).toBeUndefined();
  });

  it("filters both page totals and rows by the validated source month", async () => {
    expect(
      (await (await records("police", "&month=2026-07&limit=1")).json()).data,
    ).toMatchObject({ total: 35, nextOffset: 1 });
    expect(
      (await (await records("police", "&month=2026-08")).json()).data,
    ).toMatchObject({ total: 0, nextOffset: null });
    expect((await records("police", "&month=2026-13")).status).toBe(400);
    expect(
      (await records("police", "&month=2026-07%27%20OR%201=1")).status,
    ).toBe(400);
  });

  it("excludes unassigned source snapshots rather than guessing an area", async () => {
    const body = await (await records("tfl_snapshot")).json();
    expect(body.data.total).toBe(0);
    expect(body.data.graph.assertions).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("RAW PAYLOAD SECRET");
  });

  it("rejects invalid areas, unsafe dataset IDs, excess rows, and excess offsets", async () => {
    for (const path of [
      "/catalog?area=london",
      `/records?area=camden_town&dataset=${ids.police}&limit=31`,
      `/records?area=camden_town&dataset=${ids.police}&offset=200001`,
      "/records?area=camden_town&dataset=%27OR1%3D1",
      `/records?area=camden_town&dataset=${ids.police}&raw=true`,
    ])
      expect((await fetch(origin + path)).status).toBe(400);
    expect(
      (
        await fetch(
          `${origin}/records?area=camden_town&dataset=${"f".repeat(64)}`,
        )
      ).status,
    ).toBe(404);
  });

  it("does not open the database when hosted, production, unconfigured, or unauthenticated", async () => {
    for (const [env, auth, status] of [
      [{ GRAPH_RESEARCH_DB_PATH: "/store", VERCEL: "1" }, true, 404],
      [{ GRAPH_RESEARCH_DB_PATH: "/store", NODE_ENV: "production" }, true, 404],
      [{ NODE_ENV: "test" }, true, 404],
      [{ GRAPH_RESEARCH_DB_PATH: "/store", NODE_ENV: "test" }, false, 401],
    ] as const) {
      const openDatabase = vi.fn(async () => database);
      const url = await start({ env, openDatabase }, auth);
      expect((await fetch(url + "/catalog?area=camden_town")).status).toBe(
        status,
      );
      expect(openDatabase).not.toHaveBeenCalled();
    }
  });

  it("rejects unexpected hosts before opening the research store", async () => {
    const openDatabase = vi.fn(async () => database);
    const url = await start({ ...options(), openDatabase });
    const withHost = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const call = request(
          url + "/catalog?area=camden_town",
          { headers: { Host: host } },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode!));
          },
        );
        call.on("error", reject);
        call.end();
      });
    expect(await withHost("example.com")).toBe(404);
    expect(openDatabase).not.toHaveBeenCalled();
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(await withHost(host)).toBe(200);
    }
  });

  it("permits research association but rejects containment claims for dataset records", async () => {
    const body = await (await records("police", "&limit=1")).json();
    const graph = semanticGraphSchema.parse(body.data.graph);
    const edge = graph.assertions.find(
      (item) => item.predicate === "CONTEXTUAL_AREA_ONLY",
    )!;
    expect(edge.inferenceType).toBe("deterministic_join");
    edge.predicate = "WITHIN_AREA";
    expect(semanticGraphSchema.safeParse(graph).success).toBe(false);
  });

  it("uses read-only transactions and preserves stored publication flags", async () => {
    const statements: string[] = [];
    const url = await start({
      ...options(),
      openDatabase: async () => ({
        transaction: async (callback) =>
          database.transaction(async (tx) =>
            callback({
              query: tx.query.bind(tx),
              exec: async (sql) => {
                statements.push(sql);
                return tx.exec(sql);
              },
            }),
          ),
      }),
    });
    expect((await fetch(url + "/catalog?area=camden_town")).status).toBe(200);
    expect(statements).toEqual(["SET TRANSACTION READ ONLY"]);
    expect(
      (
        await database.query(
          "SELECT count(*) AS total FROM research.dataset_records WHERE publication_allowed OR synthetic",
        )
      ).rows[0],
    ).toEqual({ total: 0 });
  });
});
