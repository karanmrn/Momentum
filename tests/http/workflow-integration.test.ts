import express from "express";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createDemoState } from "../../packages/domain";
import { createWorkflow } from "../../packages/community-workflow";
import { createRoutes } from "../../server/routes";
import type { PilotId, Persona, Store } from "../../packages/contracts";
let server: Server, base: string;
let scopes: PilotId[] = ["camden_town"];
let persona: Persona = "moderator";
const state = createDemoState();
beforeAll(async () => {
  const store: Store = {
    read: async () => structuredClone(state),
    mutate: async (_id, operation) => operation(state),
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.sessionId = "a".repeat(64);
    res.locals.persona = persona;
    res.locals.moderatorAreas = scopes;
    next();
  });
  app.use("/api", createRoutes(store));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
const post = (
  path: string,
  body: unknown,
  key = "scope-review-key",
  method = "POST",
) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
it("checks current moderator area before replaying cached private decisions", async () => {
  const id = "10000000-0000-4000-8000-000000000004";
  const input = {
    expectedRevision: 1,
    action: "approve",
    summary: "Fictional scoped summary approved.",
  };
  expect((await post(`/api/moderation/${id}/decision`, input)).status).toBe(
    200,
  );
  scopes = [];
  const denied = await post(`/api/moderation/${id}/decision`, input);
  expect(denied.status).toBe(404);
  expect(await denied.text()).not.toContain("private community observation");
  expect((await fetch(base + "/api/moderation?area=camden_town")).status).toBe(
    404,
  );
  scopes = ["camden_town"];
  expect(
    (await fetch(base + "/api/moderation?area=hounslow_town_centre")).status,
  ).toBe(404);
});
it("prevents legacy consent bypass and hides private workflow existence from other owners", async () => {
  persona = "alex";
  const receipt = createWorkflow(
    state,
    { persona: "alex", moderatorAreas: [] },
    {
      pilotId: "camden_town",
      category: "access",
      title: "Private-only fictional observation",
      place: "Camden approach",
      observedFrom: new Date(Date.now() - 600000).toISOString(),
      observedTo: new Date(Date.now() - 300000).toISOString(),
      timePrecision: "time_window",
      basis: "firsthand",
      publication: "private_only",
      synthetic: true,
    },
    "private-workflow-key",
  );
  const id = receipt.report.id;
  persona = "sam";
  expect(
    (
      await post(
        `/api/reports/${id}`,
        { expectedRevision: 1, action: "withdraw" },
        "other-key",
        "PATCH",
      )
    ).status,
  ).toBe(404);
  persona = "moderator";
  expect(
    (
      await post(
        `/api/moderation/${id}/decision`,
        {
          expectedRevision: 1,
          action: "approve",
          summary: "This must not bypass private consent.",
        },
        "consent-key",
      )
    ).status,
  ).toBe(409);
  expect(state.reports.find((r) => r.id === id)!.noticeId).toBeNull();
  persona = "alex";
  expect(
    (
      await post(
        `/api/reports/${id}`,
        { expectedRevision: 1, action: "withdraw" },
        "own-key",
        "PATCH",
      )
    ).status,
  ).toBe(409);
});
