import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase, type DemoDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain";
import { semanticGraphSchema } from "../../packages/semantic-graph/schema";

let db: DemoDatabase, server: Server, base: string;
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await db?.close();
});

it("serves a bounded source-only graph without a session cookie", async () => {
  const response = await fetch(`${base}/api/public/graph?area=camden_town`);
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  const graph = semanticGraphSchema.parse(body.data);
  expect(body.synthetic).toBe(false);
  expect(graph.nodes.some((node) => node.type === "DatasetCoverage")).toBe(
    true,
  );
  expect(graph.nodes.some((node) => node.type === "PublishedNotice")).toBe(
    false,
  );
  expect(JSON.stringify(graph)).not.toContain("recordCount");
});

it("rejects unbounded traversals and write requests", async () => {
  for (const query of [
    "area=london",
    "area=camden_town&depth=3",
    "area=camden_town&notice=private",
  ]) {
    expect((await fetch(`${base}/api/public/graph?${query}`)).status).toBe(400);
  }
  expect(
    (
      await fetch(`${base}/api/public/graph?area=camden_town`, {
        method: "POST",
      })
    ).status,
  ).toBe(405);
});

it("updates stored assertions after withdrawal and isolates browser sessions", async () => {
  let cookie = "";
  const request = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "semantic-http-report",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    expect(response.status).toBeLessThan(300);
    return (await response.json()).data;
  };
  const report = await request("/api/reports", "POST", {
    pilotId: "camden_town",
    category: "infrastructure",
    title: "Graph test fictional light",
    description: "PRIVATE graph test narrative",
    place: "Fictional approach",
    observedAt: "2026-09-12T10:00:00Z",
    synthetic: true,
  });
  await request("/api/session", "POST", { persona: "moderator" });
  const approved = await request(
    `/api/moderation/${report.id}/decision`,
    "POST",
    {
      expectedRevision: report.revision,
      action: "approve",
      summary: "Fictional lighting summary approved for graph test.",
    },
  );
  const graph = await request("/api/graph?area=camden_town");
  expect(
    graph.nodes.some((node: { id: string }) =>
      node.id.startsWith(`notice:${approved.noticeId}:revision:`),
    ),
  ).toBe(true);
  expect(JSON.stringify(graph)).not.toContain(report.description);
  const other = await fetch(`${base}/api/graph?area=camden_town`).then(
    (response) => response.json(),
  );
  expect(JSON.stringify(other.data)).not.toContain(approved.noticeId);
  await request("/api/session", "POST", { persona: "alex" });
  await request(`/api/reports/${report.id}`, "PATCH", {
    expectedRevision: approved.revision,
    action: "withdraw",
  });
  const withdrawn = await request("/api/graph?area=camden_town");
  expect(JSON.stringify(withdrawn)).not.toContain(approved.noticeId);
});
