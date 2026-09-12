import express from "express";
import type { Server } from "node:http";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createDatabase, type DemoDatabase } from "../../server/database.js";
import { createRelationReviewRoutes } from "../../server/relation-review.js";
import { createDemoState } from "../../packages/domain/index.js";
let db: DemoDatabase,
  server: Server,
  base: string,
  reads = 0;
const a = "a".repeat(64),
  b = "b".repeat(64);
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  await db.create(a);
  await db.create(b);
  const app = express();
  app.use(express.json({ limit: "8kb" }));
  // Test-only authentication fixture. Production supplies locals from verified session middleware.
  app.use((request, response, next) => {
    const token = request.header("test-session");
    if (token === "moderator-a") {
      response.locals.sessionId = a;
      response.locals.persona = "moderator";
    }
    if (token === "moderator-b") {
      response.locals.sessionId = b;
      response.locals.persona = "moderator";
    }
    if (token === "member-a") {
      response.locals.sessionId = a;
      response.locals.persona = "alex";
    }
    next();
  });
  app.use(
    "/api/relation-review",
    createRelationReviewRoutes({
      read: async (id) => {
        reads++;
        return db.read(id);
      },
      mutate: (id, fn) => db.mutate(id, fn),
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await db?.close();
});
async function req(
  token: string,
  path = "?area=camden_town",
  body?: unknown,
  key = "http-command-key",
  extra: Record<string, string> = {},
) {
  const response = await fetch(`${base}/api/relation-review${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "test-session": token,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
    cache: response.headers.get("cache-control"),
  };
}
it("denies member and missing sessions before private reads or candidate existence checks", async () => {
  const before = reads;
  for (const actor of ["member-a", "missing"]) {
    const response = await req(actor);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.data)).not.toContain(
      "Fictional Camden observation",
    );
    expect(
      (
        await req(
          actor,
          "/candidates/candidate:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/decision",
          {
            area: "camden_town",
            expectedRevision: 1,
            action: "approve",
            reason: "role spoof",
            moderator: true,
          },
        )
      ).status,
    ).toBe(403);
  }
  expect(reads).toBe(before);
});
it("persists actions, isolates sessions, serializes races and rejects malformed or cross-origin mutations", async () => {
  const input = { area: "camden_town", expectedRevision: 1 };
  const seeded = await req("moderator-a", "/examples", input, "examples-first");
  expect(seeded.status).toBe(200);
  expect(seeded.cache).toBe("no-store");
  const replay = await req("moderator-a", "/examples", input, "examples-first");
  expect(replay.data.data.reports).toHaveLength(
    seeded.data.data.reports.length,
  );
  expect(replay.data.data.revision).toBe(2);
  const peer = await req("moderator-b");
  expect(peer.data.data.revision).toBe(1);
  expect(peer.data.data.examplesLoaded).toBe(false);
  const race = await Promise.all([
    req(
      "moderator-a",
      "/generate",
      { area: "camden_town", expectedRevision: 2 },
      "generate-a",
    ),
    req(
      "moderator-a",
      "/generate",
      { area: "camden_town", expectedRevision: 2 },
      "generate-b",
    ),
  ]);
  expect(race.map((response) => response.status).sort()).toEqual([200, 409]);
  const view = (await req("moderator-a")).data.data;
  expect(view.candidates).toHaveLength(3);
  const candidate = view.candidates.find(
    (row: { independence: string }) => row.independence === "unknown",
  );
  const wrong = await req(
    "moderator-a",
    `/candidates/${candidate.id}/decision`,
    {
      area: "west_croydon",
      expectedRevision: 3,
      action: "reject",
      reason: "Wrong area",
    },
    "wrong-area-key",
  );
  expect(wrong.status).toBe(404);
  expect(
    (
      await req(
        "moderator-a",
        "/generate",
        {
          area: "camden_town",
          expectedRevision: 3,
          sourceKind: "official_dataset",
        },
        "malformed-key",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await req(
        "moderator-a",
        "/generate",
        { area: "camden_town", expectedRevision: 3 },
        "cross-key",
        { Origin: "https://evil.example" },
      )
    ).status,
  ).toBe(403);
  const approved = await req(
    "moderator-a",
    `/candidates/${candidate.id}/decision`,
    {
      area: "camden_town",
      expectedRevision: 3,
      action: "approve",
      reason: "Fictional exact asset interval reviewed.",
    },
    "approve-relation",
  );
  expect(approved.status).toBe(200);
  expect(
    approved.data.data.candidates.find(
      (row: { id: string }) => row.id === candidate.id,
    ).status,
  ).toBe("approved");
  const repeated = await req(
    "moderator-a",
    `/candidates/${candidate.id}/decision`,
    {
      area: "camden_town",
      expectedRevision: 3,
      action: "approve",
      reason: "Fictional exact asset interval reviewed.",
    },
    "approve-relation",
  );
  expect(repeated.status).toBe(200);
  expect(repeated.data.data.revision).toBe(4);
});
it("rejects a supplied source record ID as a community participant", async () => {
  const current = (await req("moderator-a")).data.data;
  expect(
    (
      await req(
        "moderator-a",
        "/clusters/merge",
        {
          area: "camden_town",
          expectedRevision: current.revision,
          reportIds: ["police:123", "police:456"],
          reason: "Unsupported source pair",
        },
        "police-pair-key",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await req(
        "moderator-a",
        "/clusters/merge",
        {
          area: "camden_town",
          expectedRevision: current.revision,
          reportIds: [
            "30000000-0000-4000-8000-000000000001",
            "30000000-0000-4000-8000-000000000002",
          ],
          reason: "Missing private reports",
        },
        "missing-pair-key",
      )
    ).status,
  ).toBe(404);
  expect((await req("moderator-a")).data.data.revision).toBe(current.revision);
});
