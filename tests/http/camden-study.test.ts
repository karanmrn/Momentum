import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase, type DemoDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain";

let db: DemoDatabase, server: Server, base: string;
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await db?.close();
});
function client() {
  let cookie = "";
  return async (
    path: string,
    method = "GET",
    body?: unknown,
    key = "camden-test-report",
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return {
      status: response.status,
      body: await response.json(),
      cache: response.headers.get("cache-control"),
    };
  };
}
it("persists study revision, rejects stale changes, and isolates sessions", async () => {
  const a = client(),
    b = client();
  const initial = await a("/api/camden/examples");
  expect(initial.status).toBe(200);
  expect(initial.cache).toBe("no-store");
  const changed = await a("/api/camden/examples/CAM-01", "PATCH", {
    expectedRevision: 1,
    state: "corrected",
  });
  expect(changed.status).toBe(200);
  expect(changed.body.data.revision).toBe(2);
  expect((await a("/api/camden/examples")).body.data.examples["CAM-01"]).toBe(
    "corrected",
  );
  expect((await b("/api/camden/examples")).body.data.examples["CAM-01"]).toBe(
    "original",
  );
  expect(
    (
      await a("/api/camden/examples/CAM-02", "PATCH", {
        expectedRevision: 1,
        state: "withdrawn",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await a("/api/camden/examples/CAM-99", "PATCH", {
        expectedRevision: 2,
        state: "corrected",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await a("/api/camden/examples/CAM-02", "PATCH", {
        expectedRevision: 2,
        state: "corrected",
        userId: "other",
      })
    ).status,
  ).toBe(400);
});
it("updates stored study nodes and Graphify export without altering real police sources", async () => {
  const a = client();
  const original = await a("/api/graph?area=camden_town");
  expect(original.status).toBe(200);
  const sourceNodes = original.body.data.nodes.filter(
    (n: { synthetic: boolean }) => !n.synthetic,
  );
  expect(
    sourceNodes.filter((n: { type: string }) => n.type === "PoliceRecord"),
  ).toHaveLength(5);
  await a("/api/camden/examples/CAM-01", "PATCH", {
    expectedRevision: 1,
    state: "withdrawn",
  });
  const next = await a("/api/graph?area=camden_town");
  expect(next.status).toBe(200);
  expect(
    next.body.data.nodes.filter((n: { synthetic: boolean }) => !n.synthetic),
  ).toEqual(sourceNodes);
  expect(
    next.body.data.nodes.some(
      (n: { id: string }) => n.id === "fictional:CAM-01",
    ),
  ).toBe(false);
  const exported = await a("/api/graph/export?area=camden_town");
  expect(exported.status).toBe(200);
  expect(JSON.stringify(exported.body)).not.toContain('"confidence"');
  expect(JSON.stringify(exported.body)).not.toContain(
    '"id":"fictional:CAM-01"',
  );
  const publicExport = await a("/api/public/graph/export?area=camden_town");
  expect(publicExport.status).toBe(200);
  expect(JSON.stringify(publicExport.body)).not.toContain("fictional:CAM-");
});
it("takes a Camden example through private report, review, graph, and withdrawal", async () => {
  const a = client();
  const input = { expectedRevision: 1 };
  const report = await a("/api/camden/examples/CAM-05/report", "POST", input);
  expect(report.status).toBe(201);
  const saved = report.body.data;
  expect(saved.status).toBe("submitted");
  expect(saved.synthetic).toBe(true);
  const replay = await a("/api/camden/examples/CAM-05/report", "POST", input);
  expect(replay.body.data.id).toBe(saved.id);
  expect(
    (await a("/api/reports")).body.data.filter(
      (r: { id: string }) => r.id === saved.id,
    ),
  ).toHaveLength(1);
  expect(
    JSON.stringify((await a("/api/graph?area=camden_town")).body.data),
  ).not.toContain(saved.id);
  await a("/api/session", "POST", { persona: "sam" });
  expect(
    (await a("/api/reports")).body.data.some(
      (r: { id: string }) => r.id === saved.id,
    ),
  ).toBe(false);
  await a("/api/session", "POST", { persona: "moderator" });
  expect(
    (await a("/api/camden/examples/CAM-02/report", "POST", input)).status,
  ).toBe(400);
  const reviewed = await a(
    `/api/moderation/${saved.id}/decision`,
    "POST",
    {
      expectedRevision: saved.revision,
      action: "approve",
      summary:
        "Fictional Camden lighting summary. Current lamp condition is unknown.",
    },
    "camden-test-review",
  );
  expect(reviewed.status).toBe(200);
  expect(
    JSON.stringify((await a("/api/graph?area=camden_town")).body.data),
  ).toContain(reviewed.body.data.noticeId);
  await a("/api/session", "POST", { persona: "alex" });
  expect(
    (
      await a(`/api/reports/${saved.id}`, "PATCH", {
        action: "withdraw",
        expectedRevision: reviewed.body.data.revision,
      })
    ).status,
  ).toBe(200);
  expect(
    JSON.stringify((await a("/api/graph?area=camden_town")).body.data),
  ).not.toContain(reviewed.body.data.noticeId);
  await a("/api/camden/examples/CAM-02", "PATCH", {
    expectedRevision: 1,
    state: "withdrawn",
  });
  expect(
    (
      await a(
        "/api/camden/examples/CAM-02/report",
        "POST",
        { expectedRevision: 2 },
        "withdrawn-example",
      )
    ).status,
  ).toBe(409);
});
it("retains Camden report creation keys when review keys reach the cache limit", async () => {
  const a = client();
  let firstId = "";
  for (let i = 0; i < 51; i++) {
    await a("/api/session", "POST", { persona: "alex" });
    const created = await a(
      "/api/camden/examples/CAM-01/report",
      "POST",
      { expectedRevision: 1 },
      `pressure-create-${i}`,
    );
    expect(created.status).toBe(201);
    if (i === 0) firstId = created.body.data.id;
    await a("/api/session", "POST", { persona: "moderator" });
    const rejected = await a(
      `/api/moderation/${created.body.data.id}/decision`,
      "POST",
      {
        expectedRevision: 1,
        action: "reject",
        summary: "Fictional report rejected for this test.",
      },
      `pressure-decision-${i}`,
    );
    expect(rejected.status).toBe(200);
  }
  await a("/api/session", "POST", { persona: "alex" });
  const replay = await a(
    "/api/camden/examples/CAM-01/report",
    "POST",
    { expectedRevision: 1 },
    "pressure-create-0",
  );
  expect(replay.status).toBe(201);
  expect(replay.body.data.id).toBe(firstId);
});
