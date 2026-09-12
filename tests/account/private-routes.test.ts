import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { requireAccount } from "../../server/account.js";
import { createPrivateAccountRoutes } from "../../server/private-account-routes.js";
import { createPrivateAccountStore } from "../../server/private-accounts-store.js";
const fetchHttp = globalThis.fetch;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let db: Awaited<ReturnType<typeof createPrivateAccountStore>>;
let server: Server;
let base: string;
let provider: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("VERCEL", "");
  db = await createPrivateAccountStore({ path: "memory://" });
  provider = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const token = new Headers(init?.headers).get("authorization") ?? "";
    if (token.includes("invalid"))
      return new Response(JSON.stringify({ message: "Invalid token" }), {
        status: 401,
      });
    return new Response(
      JSON.stringify({
        id: token.includes("bob") ? bob : alice,
        role: "authenticated",
        aud: "authenticated",
        email_confirmed_at: "2026-09-12T12:00:00Z",
        user_metadata: { role: "moderator", owner: bob },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", provider);
  const app = express();
  app.use(
    "/api/account/data",
    createPrivateAccountRoutes(
      requireAccount({
        supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
        publishableKey: "sb_publishable_testing_1234567890123456",
      }),
      async () => db,
    ),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("address");
  base = `http://127.0.0.1:${address.port}/api/account/data`;
});
afterEach(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await db?.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function request(
  path: string,
  method = "GET",
  body?: unknown,
  who = "alice",
  headers: Record<string, string> = {},
) {
  return fetchHttp(base + path, {
    method,
    headers: {
      authorization: `Bearer ${who}_confirmed_test_token_123456789`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const follows = {
  pilotIds: ["camden_town"],
  categories: ["community"],
  paused: false,
};
describe("verified private account routes", () => {
  it("rejects missing and rejected provider credentials", async () => {
    expect((await fetchHttp(base + "/follows")).status).toBe(401);
    expect(
      (await request("/follows", "GET", undefined, "invalid")).status,
    ).toBe(401);
  });
  it("persists only the verified owner and ignores role metadata", async () => {
    expect((await request("/follows", "PUT", follows)).status).toBe(200);
    const own = await request("/follows");
    expect(own.headers.get("cache-control")).toBe("no-store");
    expect(own.headers.has("set-cookie")).toBe(false);
    expect((await own.json()).data).toEqual({
      ...follows,
      revision: 2,
      settings: null,
    });
    expect(
      (await (await request("/follows", "GET", undefined, "bob")).json()).data
        .pilotIds,
    ).toEqual([]);
    expect((await (await request("/scopes")).json()).data).toEqual([]);
    expect(
      (await request("/follows", "PUT", { ...follows, owner: bob })).status,
    ).toBe(400);
  });
  it("blocks cross-origin writes and leaves intake closed", async () => {
    expect(
      (
        await request("/follows", "PUT", follows, "alice", {
          origin: "https://attacker.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/reports", "POST", {
          pilotId: "camden_town",
          title: "Original test",
          description: "Original fictional route test",
          sourceBasis: "firsthand",
        })
      ).status,
    ).toBe(403);
    expect((await (await request("/reports")).json()).data).toEqual([]);
  });
  it("exports only owned data and deletion prevents stale-token reuse", async () => {
    await request("/follows", "PUT", follows);
    const exported = await (await request("/export")).json();
    expect(exported.data.follows).toEqual({
      ...follows,
      revision: 2,
      settings: null,
    });
    expect(exported.data.reports).toEqual([]);
    expect((await request("/", "DELETE", { confirmation: "yes" })).status).toBe(
      400,
    );
    expect(
      (await request("/", "DELETE", { confirmation: "DELETE MY ACCOUNT DATA" }))
        .status,
    ).toBe(200);
    expect((await request("/follows")).status).toBe(410);
    expect((await request("/follows", "PUT", follows)).status).toBe(410);
    expect((await request("/follows", "GET", undefined, "bob")).status).toBe(
      200,
    );
  });
  it("bounds JSON and validates inbox IDs and actions", async () => {
    expect(
      (await request("/inbox/not-an-id", "PATCH", { read: true })).status,
    ).toBe(400);
    expect(
      (await request("/inbox/" + bob, "PATCH", { read: false })).status,
    ).toBe(400);
    expect(
      (await request("/follows", "PUT", { value: "x".repeat(9000) })).status,
    ).toBe(413);
  });
});
