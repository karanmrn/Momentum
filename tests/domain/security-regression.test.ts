import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase, type DemoDatabase } from "../../server/database";
import {
  createDemoState,
  withdrawReport,
  dispatchNotifications,
  findPublicNotice,
  replayOrRecord,
  fingerprint,
  submitReport,
  decideReport,
} from "../../packages/domain/index";
import { reportInputSchema } from "../../packages/contracts/index";
let db: DemoDatabase, server: Server, base: string;
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No address");
  base = `http://127.0.0.1:${address.port}/api`;
});

it("keeps the replay ledger bounded when every report slot is used", () => {
  const state = createDemoState();
  const submission = reportInputSchema.parse(input);
  for (let index = 0; index < 95; index++) {
    replayOrRecord(
      state,
      `report:alex:capacity-${index}`,
      fingerprint(submission),
      () => submitReport(state, "alex", submission),
    );
  }
  const firstId = state.reports[5].id;
  for (let area = 0; area < 3; area++) {
    for (let revision = 1; revision <= 34; revision++) {
      const decision = {
        expectedRevision: revision,
        action: "resolve" as const,
        summary: "Fictional operational correction.",
      };
      replayOrRecord(
        state,
        `moderation:${area}:${revision}`,
        fingerprint(decision),
        () =>
          decideReport(state, "moderator", state.reports[area].id, decision),
      );
    }
  }
  expect(Object.keys(state.idempotency)).toHaveLength(100);
  expect(
    Object.keys(state.idempotency).filter((key) => key.startsWith("report:")),
  ).toHaveLength(95);
  expect(
    replayOrRecord(
      state,
      "report:alex:capacity-0",
      fingerprint(submission),
      () => submitReport(state, "alex", submission),
    ).id,
  ).toBe(firstId);
  expect(state.reports).toHaveLength(100);
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});
function browser() {
  let cookie = "";
  return async (path: string, method = "GET", body?: unknown, key?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        cookie,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = res.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return { status: res.status, body: await res.json() };
  };
}
const input = {
  pilotId: "hounslow_town_centre",
  category: "infrastructure",
  title: "Fictional lighting observation",
  description: "Fictional private account for review.",
  place: "Fictional pedestrian approach",
  observedAt: "2026-09-12T10:00:00Z",
  synthetic: true,
};
it("withdraws and scrubs a report after its notice reaches the revision cap", async () => {
  const request = browser();
  await request("/session");
  await request("/session", "POST", { persona: "moderator" });
  const id = "10000000-0000-4000-8000-000000000001";
  for (let revision = 1; revision < 50; revision++) {
    const result = await request(
      `/moderation/${id}/decision`,
      "POST",
      {
        expectedRevision: revision,
        action: "resolve",
        summary: "Fictional operational correction.",
      },
      `cap-${revision}`.padEnd(8, "x"),
    );
    expect(result.status).toBe(200);
  }
  await request("/session", "POST", { persona: "alex" });
  const result = await request(`/reports/${id}`, "PATCH", {
    expectedRevision: 50,
    action: "withdraw",
  });
  expect(result.status).toBe(200);
  expect(result.body.data.status).toBe("withdrawn");
  const reports = await request("/reports");
  expect(
    reports.body.data.find((r: { id: string }) => r.id === id).description,
  ).toBe("[withdrawn]");
  const notice = await request(`/notices/20000000-0000-4000-8000-000000000001`);
  expect(notice.body.data.status).toBe("retracted");
  expect(notice.body.data.evidence).toEqual([]);
});
it("retains report creation keys after more than 100 later moderation mutations", async () => {
  const request = browser();
  await request("/session");
  const first = await request("/reports", "POST", input, "original-report-key");
  expect(first.status).toBe(201);
  await request("/session", "POST", { persona: "moderator" });
  for (let area = 1; area <= 3; area++)
    for (let revision = 1; revision <= 34; revision++) {
      const id = `10000000-0000-4000-8000-${String(area).padStart(12, "0")}`;
      const result = await request(
        `/moderation/${id}/decision`,
        "POST",
        {
          expectedRevision: revision,
          action: "resolve",
          summary: "Fictional operational correction.",
        },
        `churn-${area}-${revision}`,
      );
      expect(result.status).toBe(200);
    }
  await request("/session", "POST", { persona: "alex" });
  const replay = await request(
    "/reports",
    "POST",
    input,
    "original-report-key",
  );
  expect(replay.status).toBe(201);
  expect(replay.body.data.id).toBe(first.body.data.id);
  const reports = await request("/reports");
  const duplicates = reports.body.data.filter(
    (r: { title: string }) => r.title === input.title,
  );
  expect(duplicates).toHaveLength(1);
  expect(
    (
      await request(
        "/reports",
        "POST",
        { ...input, title: "Changed fictional observation" },
        "original-report-key",
      )
    ).status,
  ).toBe(409);
});
it("passes cross-browser isolation and concurrent submission replay checks", async () => {
  const first = browser(),
    second = browser();
  await first("/session");
  await second("/session");
  const submissions = await Promise.all(
    Array.from({ length: 8 }, () =>
      first("/reports", "POST", input, "concurrent-report-key"),
    ),
  );
  expect(submissions.every((x) => x.status === 201)).toBe(true);
  expect(new Set(submissions.map((x) => x.body.data.id)).size).toBe(1);
  const report = submissions[0].body.data;
  const reports = await second("/reports");
  expect(
    reports.body.data.some((r: { id: string }) => r.id === report.id),
  ).toBe(false);
  expect(
    (
      await second(`/reports/${report.id}`, "PATCH", {
        expectedRevision: 1,
        action: "withdraw",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await first(
        `/moderation/${report.id}/decision`,
        "POST",
        {
          expectedRevision: 1,
          action: "approve",
          summary: "Fictional approved summary.",
        },
        "nonmoderator-key",
      )
    ).status,
  ).toBe(403);
  await first("/session", "POST", { persona: "moderator" });
  const approved = await first(
    `/moderation/${report.id}/decision`,
    "POST",
    {
      expectedRevision: 1,
      action: "approve",
      summary: "Fictional approved summary.",
    },
    "moderator-key",
  );
  expect(approved.status).toBe(200);
  expect((await second(`/notices/${approved.body.data.noticeId}`)).status).toBe(
    404,
  );
  expect(
    (await second(`/notices/${approved.body.data.noticeId}/evidence`)).status,
  ).toBe(404);
});
it("passes hosted invitation, secure cookie, CSRF, and malformed-input checks", async () => {
  const priorVercel = process.env.VERCEL,
    priorCode = process.env.DEMO_ACCESS_CODE;
  process.env.VERCEL = "1";
  process.env.DEMO_ACCESS_CODE = "test-only-invitation-code";
  const hosted = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => hosted.once("listening", r));
  const addr = hosted.address();
  if (!addr || typeof addr === "string") throw Error("No address");
  const host = `127.0.0.1:${addr.port}`,
    url = `http://${host}/api/session`;
  const authorization =
    "Basic " + Buffer.from("demo:test-only-invitation-code").toString("base64");
  try {
    const denied = await fetch(url);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Basic");
    expect(denied.headers.get("set-cookie")).toBeNull();
    const valid = await fetch(url, { headers: { authorization } });
    expect(valid.status).toBe(200);
    const issued = valid.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict"])
      expect(issued).toContain(flag);
    expect(valid.headers.get("cache-control")).toBe("no-store");
    const cookie = issued.split(";")[0];
    const options = {
      method: "POST",
      headers: {
        authorization,
        cookie,
        "Content-Type": "application/json",
        origin: `https://${host}`,
      },
      body: JSON.stringify({ persona: "sam" }),
    };
    expect((await fetch(url, options)).status).toBe(200);
    expect(
      (
        await fetch(url, {
          ...options,
          headers: { ...options.headers, origin: "https://untrusted.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(url, {
          ...options,
          headers: { ...options.headers, "sec-fetch-site": "cross-site" },
        })
      ).status,
    ).toBe(403);
    expect((await fetch(url, { ...options, body: "{bad json" })).status).toBe(
      400,
    );
    expect(
      (
        await fetch(url, {
          ...options,
          body: JSON.stringify({ persona: "sam", padding: "x".repeat(9000) }),
        })
      ).status,
    ).toBe(413);
    const rotated = await fetch(url, {
      headers: { authorization, cookie: "streetwise_demo=" + "0".repeat(64) },
    });
    expect(rotated.status).toBe(200);
    expect(rotated.headers.get("set-cookie")).not.toContain(
      "streetwise_demo=" + "0".repeat(64),
    );
    delete process.env.DEMO_ACCESS_CODE;
    expect((await fetch(url, { headers: { authorization } })).status).toBe(503);
  } finally {
    await new Promise<void>((r) => hosted.close(() => r()));
    if (priorVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = priorVercel;
    if (priorCode === undefined) delete process.env.DEMO_ACCESS_CODE;
    else process.env.DEMO_ACCESS_CODE = priorCode;
  }
});
it("redacts at full inbox capacity and preserves final correction delivery for both recipients", () => {
  const state = createDemoState();
  const report = state.reports[0];
  const notice = state.notices.find((n) => n.id === report.noticeId)!;
  const description = report.description;
  report.revision = 50;
  notice.revision = 50;
  state.idempotency["report:alex:retained-creation"] = {
    fingerprint: "a".repeat(64),
    result: structuredClone(report),
  };
  state.notifications.push({
    ...state.notifications[0],
    id: "sam-delivered",
    recipient: "sam",
  });
  state.notifications.push({
    ...state.notifications[0],
    id: "old-queued-correction",
    kind: "correction",
    state: "queued",
    revision: 49,
  });
  while (state.notifications.length < 300)
    state.notifications.push({
      ...state.notifications[1],
      id: `capacity-${state.notifications.length}`,
      kind: "correction",
    });
  const withdrawn = withdrawReport(state, "alex", report.id, 50);
  expect(withdrawn.status).toBe("withdrawn");
  expect(JSON.stringify(state)).not.toContain(description);
  expect(findPublicNotice(state, notice.id).evidence).toEqual([]);
  expect(notice.revision).toBe(51);
  expect(state.notifications).toHaveLength(300);
  const corrections = state.notifications.filter(
    (n) =>
      n.noticeId === notice.id && n.kind === "correction" && n.revision === 51,
  );
  expect(corrections.map((n) => n.recipient).sort()).toEqual(["alex", "sam"]);
  expect(corrections.every((n) => n.state === "queued")).toBe(true);
  expect(
    state.notifications.find((n) => n.id === "old-queued-correction")?.state,
  ).toBe("suppressed");
  expect(
    dispatchNotifications(state, "alex").find(
      (n) => n.noticeId === notice.id && n.revision === 51,
    )?.state,
  ).toBe("delivered");
  state.preferences.sam.inAppEnabled = false;
  expect(
    dispatchNotifications(state, "sam").find(
      (n) => n.noticeId === notice.id && n.revision === 51,
    )?.state,
  ).toBe("suppressed");
  const before = structuredClone(state);
  expect(withdrawReport(state, "alex", report.id, withdrawn.revision)).toEqual(
    withdrawn,
  );
  expect(state).toEqual(before);
});
