import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase, type DemoDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain/index";
import type { Report } from "../../packages/contracts";
let db: DemoDatabase, server: Server, base: string;
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test port");
  base = `http://127.0.0.1:${address.port}/api`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});
function browser() {
  let cookie = "";
  return async (path: string, method = "GET", body?: unknown, key?: string) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  };
}
const input = {
  pilotId: "hounslow_town_centre",
  category: "infrastructure",
  title: "Fictional lighting concern",
  description: "Original fictional private account.",
  place: "Broad fictional approach",
  observedAt: "2026-09-12T10:00:00Z",
  synthetic: true,
};
const changes = {
  category: "access",
  title: "Revised fictional access concern",
  description: "Corrected fictional private account.",
  place: "Broad fictional pedestrian area",
  observedAt: "2026-09-12T11:00:00Z",
  synthetic: true,
};
const edit = (revision = 1, fields: unknown = changes) => ({
  action: "edit",
  expectedRevision: revision,
  changes: fields,
});
it("lets an owner correct an unreviewed private report without publishing it", async () => {
  const request = browser();
  const made = await request("/reports", "POST", input, "owner-edit-main");
  expect(made.status).toBe(201);
  const before = made.body.data as Report;
  const response = await request(`/reports/${before.id}`, "PATCH", edit());
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    ...changes,
    id: before.id,
    owner: before.owner,
    pilotId: before.pilotId,
    createdAt: before.createdAt,
    status: "submitted",
    noticeId: null,
    revision: 2,
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    JSON.stringify((await request("/feed?area=hounslow_town_centre")).body),
  ).not.toContain(changes.description);
  const replay = await request("/reports", "POST", input, "owner-edit-main");
  expect(replay.body.data).toEqual(response.body.data);
  expect(JSON.stringify(replay.body)).not.toContain(input.description);
});

it("rejects another owner, another browser, and a moderator", async () => {
  const owner = browser(),
    other = browser();
  const made = await owner("/reports", "POST", input, "owner-edit-isolation");
  const id = made.body.data.id;
  await owner("/session", "POST", { persona: "sam" });
  const denied = await owner(`/reports/${id}`, "PATCH", edit());
  expect(denied.status).toBe(404);
  expect(JSON.stringify(denied.body)).not.toContain(input.description);
  expect((await other(`/reports/${id}`, "PATCH", edit())).status).toBe(404);
  await owner("/session", "POST", { persona: "moderator" });
  expect((await owner(`/reports/${id}`, "PATCH", edit())).status).toBe(403);
  await owner("/session", "POST", { persona: "alex" });
  expect(
    (await owner("/reports")).body.data.find((r: Report) => r.id === id),
  ).toEqual(made.body.data);
});

it("allows only one concurrent edit of the same revision", async () => {
  const request = browser();
  const made = await request(
    "/reports",
    "POST",
    input,
    "owner-edit-concurrent",
  );
  const id = made.body.data.id;
  const attempts = await Promise.all([
    request(`/reports/${id}`, "PATCH", edit()),
    request(
      `/reports/${id}`,
      "PATCH",
      edit(1, { ...changes, description: "Other fictional correction." }),
    ),
  ]);
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = (await request("/reports")).body.data.find(
    (r: Report) => r.id === id,
  );
  expect(current).toEqual(attempts.find((r) => r.status === 200)!.body.data);
  expect((await request(`/reports/${id}`, "PATCH", edit())).status).toBe(409);
});

it("keeps submitted graph data unchanged, then approves only the revised report", async () => {
  const request = browser();
  const made = await request("/reports", "POST", input, "owner-edit-approval");
  const id = made.body.data.id;
  const beforeGraph = (await request("/graph?area=hounslow_town_centre")).body
    .data;
  const revised = await request(`/reports/${id}`, "PATCH", edit());
  expect(revised.status).toBe(200);
  const afterGraph = (await request("/graph?area=hounslow_town_centre")).body
    .data;
  expect(afterGraph.nodes).toEqual(beforeGraph.nodes);
  expect(afterGraph.assertions).toEqual(beforeGraph.assertions);
  expect(JSON.stringify(afterGraph)).not.toContain(changes.description);
  await request("/session", "POST", { persona: "moderator" });
  const queued = (
    await request("/moderation?area=hounslow_town_centre")
  ).body.data.find((r: Report) => r.id === id);
  expect(queued).toEqual(revised.body.data);
  const stale = await request(
    `/moderation/${id}/decision`,
    "POST",
    {
      action: "approve",
      expectedRevision: 1,
      summary: "Reviewed fictional access update.",
    },
    "owner-edit-approve-old",
  );
  expect(stale.status).toBe(409);
  const approved = await request(
    `/moderation/${id}/decision`,
    "POST",
    {
      action: "approve",
      expectedRevision: 2,
      summary: "Reviewed fictional access update.",
    },
    "owner-edit-approve-new",
  );
  expect(approved.status).toBe(200);
  const published = (await request(`/notices/${approved.body.data.noticeId}`))
    .body.data;
  expect(published).toMatchObject({
    category: changes.category,
    place: changes.place,
    observedAt: changes.observedAt,
    summary: "Reviewed fictional access update.",
  });
  expect(JSON.stringify(published)).not.toContain(changes.description);
  await request("/session", "POST", { persona: "alex" });
  expect(
    (
      await request(
        `/reports/${id}`,
        "PATCH",
        edit(approved.body.data.revision),
      )
    ).status,
  ).toBe(409);
  expect((await request(`/notices/${published.id}`)).body.data).toEqual(
    published,
  );
  // Existing withdrawal remains available after review and redacts replay responses.
  const withdrawn = await request(`/reports/${id}`, "PATCH", {
    action: "withdraw",
    expectedRevision: approved.body.data.revision,
  });
  expect(withdrawn.status).toBe(200);
  expect(
    (
      await request(
        `/reports/${id}`,
        "PATCH",
        edit(withdrawn.body.data.revision),
      )
    ).status,
  ).toBe(409);
  const replay = await request(
    "/reports",
    "POST",
    input,
    "owner-edit-approval",
  );
  expect(replay.body.data.status).toBe("withdrawn");
  expect(replay.body.data.description).toBe("[withdrawn]");
});

it("does not restore rejected reports", async () => {
  const request = browser();
  const made = await request("/reports", "POST", input, "owner-edit-rejected");
  const id = made.body.data.id;
  await request("/session", "POST", { persona: "moderator" });
  const rejected = await request(
    `/moderation/${id}/decision`,
    "POST",
    {
      action: "reject",
      expectedRevision: 1,
      summary: "Fictional submission does not meet review requirements.",
    },
    "owner-edit-reject",
  );
  await request("/session", "POST", { persona: "alex" });
  expect(
    (
      await request(
        `/reports/${id}`,
        "PATCH",
        edit(rejected.body.data.revision),
      )
    ).status,
  ).toBe(409);
  expect(
    (await request("/reports")).body.data.find((r: Report) => r.id === id),
  ).toEqual(rejected.body.data);
});

it.each([
  { ...changes, owner: "sam" },
  { ...changes, pilotId: "camden_town" },
  { ...changes, status: "approved_for_summary" },
  { ...changes, id: "00000000-0000-4000-8000-000000000000" },
  { ...changes, noticeId: "00000000-0000-4000-8000-000000000000" },
  { ...changes, synthetic: false },
  { ...changes, title: "x" },
  { ...changes, description: "x".repeat(601) },
  { ...changes, observedAt: "not a date" },
  { ...changes, description: "Email fictional@example.com about this." },
])(
  "rejects immutable, unsafe, and invalid changes without modifying the report",
  async (fields) => {
    const request = browser();
    const made = await request("/reports", "POST", input, "owner-edit-invalid");
    const id = made.body.data.id;
    expect(
      (await request(`/reports/${id}`, "PATCH", edit(1, fields))).status,
    ).toBe(400);
    expect(
      (await request("/reports")).body.data.find((r: Report) => r.id === id),
    ).toEqual(made.body.data);
  },
);

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
  "rejects invalid revision values",
  async (revision) => {
    const request = browser();
    const made = await request(
      "/reports",
      "POST",
      input,
      "owner-edit-revision",
    );
    expect(
      (await request(`/reports/${made.body.data.id}`, "PATCH", edit(revision)))
        .status,
    ).toBe(400);
  },
);
