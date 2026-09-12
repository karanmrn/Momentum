import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type DemoDatabase } from "../../server/database.js";
import { createDemoState } from "../../packages/domain/index.js";
import { createApp } from "../../server/app.js";
import { readResearchConsent } from "../../server/research-consent.js";
import {
  expireResearchObservations,
  submitResearchObservation,
  createRecruitmentDemo,
} from "../../packages/recruitment/index.js";
import type { Server } from "node:http";
const input = {
  pilotId: "hounslow_town_centre",
  landmarkId: "hounslow_high_street",
  recruitmentEntryId: "hounslow_town_centre_join",
  observedDate: new Date().toISOString().slice(0, 10),
  comfortFactors: ["lighting"],
  behavior: "continued",
  timeWindow: "evening",
  fictional: true,
  consent: {
    version: "research-demo-v1",
    participation: true,
    aggregate: true,
  },
  idempotencyKey: "persistent-answer",
};
let db: DemoDatabase,
  server: Server,
  base: string,
  path: string,
  cookie: string;
async function start() {
  db = await createDatabase(() => createDemoState(new Date()), { path });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("No address");
  base = `http://127.0.0.1:${addr.port}`;
}
async function stop() {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
}
async function call(
  route = "/api/research-consent",
  body?: unknown,
  suppliedCookie = cookie,
) {
  return fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: suppliedCookie ?? "",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeAll(async () => {
  path = join(await mkdtemp(join(tmpdir(), "research-consent-")), "db");
  await start();
  const r = await call("/api/session", undefined, "");
  cookie = r.headers.get("set-cookie")!.split(";")[0];
});
afterAll(async () => {
  await stop();
  await rm(join(path, ".."), { recursive: true, force: true });
});
it("persists consent through process restart, isolates sessions/personas, and scrubs withdrawal", async () => {
  let response = await call("/api/research-consent/observations", input);
  expect(response.status).toBe(200);
  const saved = (await response.json()).data.observations[0];
  expect(saved.purpose).toContain("fictional");
  expect(saved.consentedAt).toBeTruthy();
  await stop();
  await start();
  expect((await (await call()).json()).data.observations[0]).toEqual(saved);
  expect(
    (await (await call("/api/research-consent", undefined, "")).json()).data
      .observations,
  ).toEqual([]);
  await call("/api/session", { persona: "sam" });
  expect((await (await call()).json()).data.observations).toEqual([]);
  expect(
    (
      await call("/api/research-consent/withdraw", {
        id: saved.id,
        expectedRevision: 1,
      })
    ).status,
  ).toBe(404);
  await call("/api/session", { persona: "moderator" });
  expect((await call()).status).toBe(403);
  await call("/api/session", { persona: "alex" });
  expect(
    (
      await call("/api/research-consent/withdraw", {
        id: saved.id,
        expectedRevision: 2,
      })
    ).status,
  ).toBe(409);
  const withdrawn = await call("/api/research-consent/withdraw", {
    id: saved.id,
    expectedRevision: 1,
  });
  expect(withdrawn.status).toBe(200);
  const body = await withdrawn.json();
  expect(body.data.observations[0].status).toBe("withdrawn");
  expect(JSON.stringify(body.data.observations)).not.toContain("lighting");
  await stop();
  await start();
  expect((await (await call()).json()).data.observations[0].status).toBe(
    "withdrawn",
  );
  expect((await call("/api/research-consent/observations", input)).status).toBe(
    409,
  );
  expect(
    (
      await call("/api/research-consent/observations", {
        ...input,
        idempotencyKey: "real",
        fictional: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("/api/research-consent/observations", {
        ...input,
        idempotencyKey: "identity",
        owner: "sam",
      })
    ).status,
  ).toBe(400);
});
it("expires answers at the retention limit and rejects malformed persisted state", () => {
  const now = new Date().toISOString();
  const saved = submitResearchObservation(
    createRecruitmentDemo(),
    "alex",
    input,
    { id: "expiry", now },
  );
  const result = expireResearchObservations(
    saved,
    new Date(Date.parse(now) + 86400000).toISOString(),
  );
  expect(result.observations[0].status).toBe("withdrawn");
  expect(JSON.stringify(result)).not.toContain("lighting");
  expect(() =>
    readResearchConsent({
      ...createDemoState(new Date()),
      researchConsent: {
        observations: [{ fictional: false }],
        submissions: [],
      },
    } as never),
  ).toThrow();
});
