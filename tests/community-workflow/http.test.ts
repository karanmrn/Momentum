import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createCommunityWorkflowRoutes } from "../../server/community-workflow.js";
import { createDemoState, DomainError } from "../../packages/domain/index.js";
import type { DemoState, Store } from "../../packages/contracts/index.js";

describe("community workflow HTTP boundary", () => {
  let base = "";
  let close: () => Promise<void>;
  beforeAll(async () => {
    const sessions = new Map<string, DemoState>();
    const get = (id: string) => {
      if (!sessions.has(id)) sessions.set(id, createDemoState());
      return sessions.get(id)!;
    };
    const store: Store = {
      read: async (id) => structuredClone(get(id)),
      mutate: async (id, operation) => {
        const draft = structuredClone(get(id));
        const output = await operation(draft);
        sessions.set(id, draft);
        return output;
      },
    };
    const app = express();
    app.use(express.json({ limit: "16kb" }));
    app.use((req, res, next) => {
      if (req.header("X-Test-Session")) {
        res.locals.sessionId = req.header("X-Test-Session");
        res.locals.persona = req.header("X-Test-Persona") ?? "alex";
        res.locals.moderatorAreas = (
          req.header("X-Test-Areas") ?? "camden_town"
        ).split(",");
      }
      next();
    });
    app.use("/api/community-workflow", createCommunityWorkflowRoutes(store));
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        const status =
          error instanceof DomainError
            ? error.status
            : error instanceof ZodError
              ? 400
              : 500;
        res
          .status(status)
          .json({
            schemaVersion: "1.0",
            error: {
              code: error instanceof DomainError ? error.code : "invalid_input",
              message:
                error instanceof DomainError
                  ? error.message
                  : "Invalid request.",
            },
          });
      },
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/community-workflow`;
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });
  afterAll(() => close());
  const input = {
    pilotId: "camden_town",
    category: "access",
    title: "Fictional interval observation",
    place: "Camden approach",
    observedFrom: "2026-09-12T10:00:00Z",
    observedTo: "2026-09-12T12:00:00Z",
    timePrecision: "time_window",
    basis: "other_source",
    sourceDescription: "A fictional notice described the access issue.",
    publication: "reviewed_public",
    synthetic: true,
  };
  const headers = (persona = "alex", session = "session-a") => ({
    "Content-Type": "application/json",
    "X-Test-Session": session,
    "X-Test-Persona": persona,
    "Idempotency-Key": crypto.randomUUID(),
  });
  it("requires a session and strict JSON, then preserves interval and source input", async () => {
    expect((await fetch(base + "?area=camden_town")).status).toBe(401);
    expect(
      (
        await fetch(base + "/reports", {
          method: "POST",
          headers: { ...headers(), "Content-Type": "text/plain" },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(415);
    const created = await fetch(base + "/reports", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const body = await created.json();
    expect(body.data.intake.observedTo).toBe(input.observedTo);
    expect(body.data.intake.narrative).toBe("");
    const second = await fetch(base + "?area=camden_town", {
      headers: headers("sam"),
    });
    expect((await second.json()).data.reports).toEqual([]);
    const otherSession = await fetch(base + "?area=camden_town", {
      headers: headers("alex", "session-b"),
    });
    expect((await otherSession.json()).data.reports).toEqual([]);
  });
  it("rejects forged actor fields, missing keys, other owners and out-of-area moderators", async () => {
    const created = await fetch(base + "/reports", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    const record = (await created.json()).data;
    const route = `${base}/reports/${record.id}`;
    expect(
      (
        await fetch(route, {
          method: "PATCH",
          headers: headers("sam"),
          body: JSON.stringify({ action: "withdraw", expectedRevision: 1 }),
        })
      ).status,
    ).toBe(404);
    const denied = await fetch(route + "/review", {
      method: "POST",
      headers: { ...headers("moderator"), "X-Test-Areas": "west_croydon" },
      body: JSON.stringify({
        expectedRevision: 1,
        action: "approve",
        reason: "Test review reason.",
        publicSummary: "A fictional reviewed access update.",
      }),
    });
    expect(denied.status).toBe(404);
    expect(
      (
        await fetch(base + "/reports", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ...input, owner: "sam" }),
        })
      ).status,
    ).toBe(400);
    const withoutKey: Record<string, string> = headers();
    delete withoutKey["Idempotency-Key"];
    expect(
      (
        await fetch(base + "/reports", {
          method: "POST",
          headers: withoutKey,
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(400);
  });
  it("publish, share, correction and re-review preserve public privacy", async () => {
    const created = await fetch(base + "/reports", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    let record = (await created.json()).data;
    const review = () =>
      fetch(`${base}/reports/${record.id}/review`, {
        method: "POST",
        headers: headers("moderator"),
        body: JSON.stringify({
          expectedRevision: record.revision,
          action: "approve",
          reason: "The private fictional source details were reviewed.",
          publicSummary:
            "A fictional other-source account describes an access issue.",
        }),
      });
    record = (await (await review()).json()).data;
    expect(record.notice.sourceKind).toBe("community_other_source");
    const notice = record.notice.id;
    const shared = await fetch(`${base}/notices/${notice}/share`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    expect(shared.status).toBe(200);
    expect(JSON.stringify(await shared.json())).not.toContain(
      input.sourceDescription,
    );
    const changed = await fetch(`${base}/reports/${record.id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        expectedRevision: record.revision,
        action: "correct",
        changes: { ...input, title: "Fictional corrected observation" },
      }),
    });
    record = (await changed.json()).data;
    expect(record.status).toBe("correction_pending");
    expect(
      (await fetch(`${base}/notices/${notice}`, { headers: headers() })).status,
    ).toBe(404);
    record = (await (await review()).json()).data;
    expect(record.notice.id).not.toBe(notice);
    const publication = await fetch(base + "?area=camden_town", {
      headers: headers("sam"),
    });
    const body = await publication.json();
    expect(JSON.stringify(body.data.published)).not.toContain(
      input.sourceDescription,
    );
    expect(body.data.published.at(-1).basis).toBe("other_source");
  });
});
