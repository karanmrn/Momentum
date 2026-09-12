import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { createDatabase, type DemoDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain/index";
import { createPersonalizationRoutes } from "../../server/personalization";
import {
  readPersonalSettings,
  type PersonalizationHost,
} from "../../packages/personalization";
const now = new Date("2026-09-12T20:00:00Z");
let db: DemoDatabase,
  server: Server,
  base: string,
  sends = 0,
  sequence = 100;
async function session() {
  const id = (++sequence).toString(16).padStart(64, "0");
  await db.create(id);
  return id;
}
async function call(
  id: string | null,
  path = "",
  method = "GET",
  body?: unknown,
) {
  return fetch(`${base}/api/personalization${path}`, {
    method,
    headers: {
      ...(id ? { "x-test-session": id } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function data(response: Response) {
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
beforeAll(async () => {
  db = await createDatabase(() => createDemoState(now), { path: "memory://" });
  const app = express();
  app.use(express.json({ limit: "20kb" }));
  // This identity selector exists only in the test server. Production supplies trusted session locals.
  app.use(async (request, response, next) => {
    const id = request.get("x-test-session");
    if (id && /^[a-f0-9]{64}$/.test(id)) {
      response.locals.sessionId = id;
      response.locals.persona = await db.session(id);
    }
    next();
  });
  app.use(
    "/api/personalization",
    createPersonalizationRoutes(db, {
      now: () => now,
      deliver: () => {
        sends++;
      },
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await db?.close();
});
describe("Private preference API with real transactions", () => {
  it("requires a trusted member session and blocks actor selectors", async () => {
    expect((await call(null)).status).toBe(401);
    const id = await session();
    await db.setPersona(id, "moderator");
    expect((await call(id)).status).toBe(403);
    await db.setPersona(id, "alex");
    expect((await call(id, "?persona=sam")).status).toBe(400);
    expect((await call(id, "/queue", "POST", { persona: "sam" })).status).toBe(
      400,
    );
    expect(
      (await call(id, "/dispatch", "POST", { channel: "push" })).status,
    ).toBe(400);
  });
  it("persists choices and keeps sessions and personas separate", async () => {
    const a = await session(),
      b = await session(),
      initial = await data(await call(a));
    const settings = {
      ...initial.preferences.settings,
      areas: ["camden_town"],
      categories: ["access"],
      language: "pl",
      historicalDigest: true,
    };
    const saved = await data(
      await call(a, "", "PUT", { expectedRevision: 1, settings }),
    );
    expect(saved.preferences.revision).toBe(2);
    expect((await data(await call(a))).preferences.settings.language).toBe(
      "pl",
    );
    expect((await data(await call(b))).preferences.settings.language).toBe(
      "en",
    );
    await db.setPersona(a, "sam");
    expect((await data(await call(a))).preferences.settings.language).toBe(
      "en",
    );
  });
  it("rejects a stale concurrent save instead of losing one change", async () => {
    const id = await session(),
      initial = await data(await call(id));
    const responses = await Promise.all(
      ["fr", "pl"].map((language) =>
        call(id, "", "PUT", {
          expectedRevision: 1,
          settings: { ...initial.preferences.settings, language },
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await data(await call(id))).preferences.revision).toBe(2);
  });
  it("serializes concurrent dispatch requests and delivers a revision once", async () => {
    const id = await session(),
      before = sends;
    const responses = await Promise.all([
      call(id, "/dispatch", "POST", {}),
      call(id, "/dispatch", "POST", {}),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const result = await data(await call(id));
    expect(sends - before).toBe(1);
    expect(result.inbox).toHaveLength(1);
    expect(result.inbox[0].attempts).toBe(1);
  });
  it("rechecks an unsubscribe committed after queue creation", async () => {
    const id = await session(),
      queued = await data(await call(id, "/queue", "POST", {})),
      before = sends;
    await data(
      await call(id, "", "PUT", {
        expectedRevision: 1,
        settings: { ...queued.preferences.settings, inAppEnabled: false },
      }),
    );
    const result = await data(await call(id, "/dispatch", "POST", {}));
    expect(sends).toBe(before);
    expect(result.inbox[0].state).toBe("suppressed");
  });
  it("checks a correction committed while dispatch waits for its transaction", async () => {
    const id = await session();
    await data(await call(id, "/queue", "POST", {}));
    const before = sends;
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve)),
      started = new Promise<void>((resolve) => (entered = resolve));
    const correction = db.mutate(id, async (state) => {
      state.notices[0].revision++;
      state.notices[0].status = "retracted";
      entered();
      await wait;
    });
    await started;
    const pending = call(id, "/dispatch", "POST", {});
    release();
    await correction;
    const result = await data(await pending);
    expect(sends).toBe(before);
    expect(result.inbox[0].state).toBe("suppressed");
    expect(result.inbox[0].currentStatus).toBe("retracted");
  });
  it("exports only the selected member and does not expose reports or session IDs", async () => {
    const id = await session();
    await db.mutate(id, (state) => {
      state.reports[0].description = "PRIVATE_REPORT_SENTINEL";
    });
    const response = await call(id, "/export"),
      text = await response.text();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "momentum-preferences.json",
    );
    expect(text).not.toContain(id);
    expect(text).not.toContain("PRIVATE_REPORT_SENTINEL");
    expect(text).not.toContain("sam");
  });
  it("requires distinct digest consent and never queues historic crime data", async () => {
    const id = await session(),
      initial = await data(await call(id));
    expect(initial.historicalDigest).toEqual([]);
    const saved = await data(
      await call(id, "", "PUT", {
        expectedRevision: 1,
        settings: {
          ...initial.preferences.settings,
          historicalDigest: true,
          categories: [],
        },
      }),
    );
    expect(saved.historicalDigest.length).toBeGreaterThan(0);
    expect(saved.historicalDigest[0].months.length).toBeGreaterThan(0);
    expect((await data(await call(id, "/dispatch", "POST", {}))).inbox).toEqual(
      [],
    );
  });
  it("deletes persisted preferences and delivery data without deleting another persona", async () => {
    const id = await session();
    await data(await call(id, "/dispatch", "POST", {}));
    const removed = await data(
      await call(id, "/delete", "POST", { expectedRevision: 1 }),
    );
    expect(removed.preferences.deleted).toBe(true);
    expect(removed.inbox).toEqual([]);
    expect((await data(await call(id, "/dispatch", "POST", {}))).inbox).toEqual(
      [],
    );
    const stored = (await db.read(id)) as PersonalizationHost;
    expect(readPersonalSettings(stored, "sam").deleted).toBe(false);
  });
  it("removes withdrawn content from current inbox details and muted titles", async () => {
    const id = await session();
    const delivered = await data(await call(id, "/dispatch", "POST", {}));
    expect(delivered.inbox[0].currentNotice.title).toBeTruthy();
    await db.mutate(id, (state) => {
      state.notices[0].status = "retracted";
      state.notices[0].revision++;
      state.notices[0].summary = "WITHDRAWN_SENTINEL";
    });
    const result = await data(await call(id, "/dispatch", "POST", {}));
    expect(
      result.inbox.every(
        (item: { currentNotice: unknown }) => item.currentNotice === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("WITHDRAWN_SENTINEL");
  });
  it("rejects malformed settings and revision bounds without changing stored data", async () => {
    const id = await session(),
      initial = await data(await call(id));
    for (const body of [
      {
        expectedRevision: 1,
        settings: { ...initial.preferences.settings, actor: "sam" },
      },
      {
        expectedRevision: Number.MAX_SAFE_INTEGER,
        settings: initial.preferences.settings,
      },
      {
        expectedRevision: 1,
        settings: {
          ...initial.preferences.settings,
          follows: ["station:unknown"],
        },
      },
    ])
      expect((await call(id, "", "PUT", body)).status).toBe(400);
    expect((await data(await call(id))).preferences.revision).toBe(1);
  });
});
