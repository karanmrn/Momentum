import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase, type DemoDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain/index";
import type {
  Notice,
  Notification,
  Report,
} from "../../packages/contracts/index";
let db: DemoDatabase, server: Server, base: string;
beforeAll(async () => {
  db = await createDatabase(createDemoState, { path: "memory://" });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("No test port");
  base = `http://127.0.0.1:${addr.port}/api`;
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
        "Content-Type": "application/json",
        Cookie: cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    const json = await response.json();
    return { status: response.status, headers: response.headers, ...json };
  };
}
const input = {
  pilotId: "hounslow_town_centre",
  category: "infrastructure",
  title: "Fictional lighting concern",
  description: "PRIVATE SYNTHETIC NARRATIVE for the review queue only.",
  place: "Fictional High Street approach",
  observedAt: "2026-09-12T10:00:00Z",
  synthetic: true,
};
describe("HTTP report-to-correction journey", () => {
  it("publishes only reviewed text and carries correction to the previous recipient", async () => {
    const request = browser();
    await request("/session");
    const create = await request(
      "/reports",
      "POST",
      input,
      "journey-report-key",
    );
    expect(create.status).toBeLessThan(300);
    const report = create.data as Report;
    const replay = await request(
      "/reports",
      "POST",
      input,
      "journey-report-key",
    );
    expect(replay.data.id).toBe(report.id);
    expect(
      JSON.stringify((await request("/feed?area=hounslow_town_centre")).data),
    ).not.toContain(input.description);
    await request("/session", "POST", { persona: "sam" });
    expect(
      (await request("/reports")).data.map((r: Report) => r.id),
    ).not.toContain(report.id);
    const denied = await request(`/reports/${report.id}`, "PATCH", {
      expectedRevision: report.revision,
      action: "withdraw",
    });
    expect([403, 404]).toContain(denied.status);
    await request("/session", "POST", { persona: "moderator" });
    const approve = await request(
      `/moderation/${report.id}/decision`,
      "POST",
      {
        expectedRevision: report.revision,
        action: "approve",
        summary:
          "A fictional lighting concern is awaiting review by the simulated operator.",
      },
      "journey-approve-key",
    );
    expect(approve.status).toBeLessThan(300);
    const feed = (await request("/feed?area=hounslow_town_centre"))
      .data as Notice[];
    const notice = feed.find((n) => n.id === approve.data.noticeId)!;
    expect(notice).toBeDefined();
    expect(JSON.stringify(notice)).not.toContain(input.description);
    const graph = await request(`/notices/${notice.id}/evidence`);
    expect(graph.data.nodes.length).toBeGreaterThan(1);
    expect(JSON.stringify(graph)).not.toContain(input.description);
    await request("/session", "POST", { persona: "alex" });
    await request("/me/notifications/dispatch", "POST", {});
    const inbox = (await request("/me/notifications")).data as Notification[];
    expect(
      inbox.some((n) => n.noticeId === notice.id && n.state === "delivered"),
    ).toBe(true);
    await request("/session", "POST", { persona: "moderator" });
    const reviewed = (
      (await request("/moderation?area=hounslow_town_centre")).data as Report[]
    ).find((r) => r.id === report.id)!;
    const retract = await request(
      `/moderation/${report.id}/decision`,
      "POST",
      {
        expectedRevision: reviewed.revision,
        action: "retract",
        summary: "The fictional notice has been withdrawn.",
      },
      "journey-retract-key",
    );
    expect(retract.status).toBeLessThan(300);
    const latest = (await request(`/notices/${notice.id}`)).data as Notice;
    expect(latest.status).toBe("retracted");
    expect(latest.revision).toBeGreaterThan(notice.revision);
    await request("/session", "POST", { persona: "alex" });
    expect(
      ((await request("/me/feed")).data as Notice[]).some(
        (n) => n.id === notice.id,
      ),
    ).toBe(false);
    await request("/me/notifications/dispatch", "POST", {});
    expect(
      ((await request("/me/notifications")).data as Notification[]).some(
        (n) => n.noticeId === notice.id && n.kind === "correction",
      ),
    ).toBe(true);
  });
  it("does not reveal another browser session report to its moderator", async () => {
    const one = browser(),
      two = browser();
    await one("/session");
    await two("/session");
    const made = await one("/reports", "POST", input, "session-one-report");
    await two("/session", "POST", { persona: "moderator" });
    const list = await two("/moderation?area=hounslow_town_centre");
    expect(list.data.map((r: Report) => r.id)).not.toContain(made.data.id);
    const denied = await two(
      `/moderation/${made.data.id}/decision`,
      "POST",
      {
        expectedRevision: 1,
        action: "approve",
        summary: "This must never be published.",
      },
      "cross-session-key",
    );
    expect([403, 404]).toContain(denied.status);
  });
  it("rejects real intake, role spoofing, invalid area, and cross-site writes", async () => {
    const request = browser();
    await request("/session");
    expect(
      (
        await request(
          "/reports",
          "POST",
          { ...input, synthetic: false },
          "real-report",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/reports",
          "POST",
          { ...input, moderator: true },
          "spoof-report",
        )
      ).status,
    ).toBe(400);
    expect((await request("/feed?area=london")).status).toBe(400);
    const cross = await fetch(base + "/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.invalid",
      },
      body: JSON.stringify({ persona: "moderator" }),
    });
    expect(cross.status).toBe(403);
    const session = await request("/session");
    expect(session.headers.get("cache-control")).toBe("no-store");
  });
});
