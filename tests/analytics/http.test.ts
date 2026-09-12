import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase, type DemoDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain";
let db: DemoDatabase, server: Server, origin: string;
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await db.close();
});
async function session() {
  const response = await fetch(`${origin}/api/session`);
  return response.headers.get("set-cookie")!.split(";")[0];
}
function call(path: string, cookie: string, body?: unknown, key?: string) {
  return fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
it("keeps empirical output null and denies extra public slices", async () => {
  const cookie = await session();
  expect(
    (
      await (
        await call("/api/analytics/status?area=camden_town", cookie)
      ).json()
    ).data,
  ).toMatchObject({
    status: "insufficient_comparable_data",
    estimate: null,
    synthetic: false,
  });
  expect(
    (
      await call(
        "/api/analytics/status?area=camden_town&cell=private-cell",
        cookie,
      )
    ).status,
  ).toBe(400);
  expect((await call("/api/analytics?area=camden_town", cookie)).status).toBe(
    403,
  );
});
it("stores private reproducible runs, replays retries, and isolates other sessions", async () => {
  const cookie = await session();
  await call("/api/session", cookie, { persona: "moderator" });
  const input = { area: "camden_town", expectedRevision: 1 };
  const first = await call(
    "/api/analytics/runs",
    cookie,
    input,
    "analysis-run-one",
  );
  expect(first.status).toBe(201);
  const run = (await first.json()).data;
  expect(run.inputs).toHaveLength(2);
  expect(run.result).toMatchObject({
    synthetic: true,
    pValue: null,
    reviewStatus: "unreviewed",
  });
  const replay = (
    await (
      await call("/api/analytics/runs", cookie, input, "analysis-run-one")
    ).json()
  ).data;
  expect(replay.id).toBe(run.id);
  const own = (
    await (await call("/api/analytics?area=camden_town", cookie)).json()
  ).data;
  expect(own.runs).toHaveLength(1);
  const other = await session();
  await call("/api/session", other, { persona: "moderator" });
  expect(
    (await (await call("/api/analytics?area=camden_town", other)).json()).data
      .runs,
  ).toHaveLength(0);
  expect(
    (
      await call(`/api/analytics/runs/${run.id}/review`, other, {
        expectedRevision: 1,
        decision: "approved_demo",
        note: "Reviewed fixture",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(`/api/analytics/runs/${run.id}/review`, cookie, {
        expectedRevision: 1,
        decision: "approved_demo",
        note: "Reviewed fixture",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(`/api/analytics/runs/${run.id}/review`, cookie, {
        expectedRevision: 2,
        decision: "approved_demo",
        note: "Reviewed fictional methods",
      })
    ).status,
  ).toBe(200);
  const after = (
    await (await call("/api/analytics?area=camden_town", cookie)).json()
  ).data;
  expect(after.runs[0].result.reviewStatus).toBe("approved_demo");
});
it("serialises concurrent run creation and rejects caller-supplied empirical series", async () => {
  const cookie = await session();
  await call("/api/session", cookie, { persona: "moderator" });
  const input = { area: "camden_town", expectedRevision: 1 };
  const responses = await Promise.all([
    call("/api/analytics/runs", cookie, input, "race-key-one"),
    call("/api/analytics/runs", cookie, input, "race-key-two"),
  ]);
  expect(responses.map((x) => x.status).sort()).toEqual([201, 409]);
  expect(
    (
      await call(
        "/api/analytics/runs",
        cookie,
        { ...input, synthetic: false, values: [1, 2, 3] },
        "reject-key-one",
      )
    ).status,
  ).toBe(400);
});
