import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Mock } from "vitest";
import type { DemoDatabase } from "../../server/database";
import { createApp } from "../../server/app";
import { accountConfig } from "../../server/account";
const directFetch = globalThis.fetch;
const key = "sb_publishable_test_only_12345678901234567890";
const origin = "https://abcdefghijklmnopqrst.supabase.co";
const token = "test.access_token_for_provider_verification";
const uuid = "00000000-0000-4000-8000-000000000001";
let server: Server;
let base: string;
let provider: Mock<typeof fetch>;
let database: Mock<() => Promise<DemoDatabase>>;
const user = (overrides = {}) => ({
  id: uuid,
  role: "authenticated",
  aud: "authenticated",
  email_confirmed_at: "2026-09-12T10:00:00Z",
  is_anonymous: false,
  user_metadata: {
    role: "moderator",
    persona: "moderator",
    private: "never-return-this",
  },
  ...overrides,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
async function start() {
  server = createApp(database).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing test address");
  base = `http://127.0.0.1:${address.port}`;
}
beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMO_ACCESS_CODE", "");
  vi.stubEnv("SUPABASE_URL", origin);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", key);
  database = vi
    .fn<() => Promise<DemoDatabase>>()
    .mockRejectedValue(new Error("No demo storage"));
  provider = vi.fn<typeof fetch>().mockResolvedValue(json(user()));
  vi.stubGlobal("fetch", provider);
});
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const session = (authorization = `Bearer ${token}`) =>
  directFetch(`${base}/api/account/session`, { headers: { authorization } });

describe("account configuration", () => {
  it("exposes only a validated public project and key without demo or database", async () => {
    await start();
    const response = await directFetch(`${base}/api/account/config`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(body.data).toEqual({
      configured: true,
      supabaseUrl: origin,
      publishableKey: key,
    });
    expect(body.synthetic).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expect(database).not.toHaveBeenCalled();
  });
  it.each([
    "sb_secret_should_never_be_exposed",
    "eyJ.service_role.jwt",
    "",
    "sb_publishable_bad",
  ])("does not expose unsupported or privileged keys: %s", async (value) => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", value);
    await start();
    expect(
      (await (await directFetch(`${base}/api/account/config`)).json()).data,
    ).toEqual({ configured: false, supabaseUrl: null, publishableKey: null });
    expect((await session()).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([
    "http://localhost:54321",
    "https://evil.example",
    "https://abcdefghijklmnopqrst.supabase.co/path",
    "https://secret@abcdefghijklmnopqrst.supabase.co",
  ])("rejects unsafe project configuration: %s", (url) => {
    expect(
      accountConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }),
    ).toBeNull();
  });
});

describe("verified account identity", () => {
  it("uses provider identity, ignores user roles, and does not create a demo session", async () => {
    await start();
    const response = await session();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      id: uuid,
      emailConfirmed: true,
      role: "member",
    });
    expect(JSON.stringify(body)).not.toContain("never-return-this");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(database).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledTimes(1);
    const [url, options] = provider.mock.calls[0];
    expect(url).toBe(`${origin}/auth/v1/user`);
    expect(new Headers(options?.headers).get("authorization")).toBe(
      `Bearer ${token}`,
    );
    expect(new Headers(options?.headers).get("apikey")).toBe(key);
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    "",
    "Basic ZGVtbzppbnZpdGU=",
    "Bearer short",
    `Bearer ${"x".repeat(8193)}`,
  ])(
    "rejects missing, demo, and malformed credentials without provider calls",
    async (authorization) => {
      await start();
      expect((await session(authorization)).status).toBe(401);
      expect(provider).not.toHaveBeenCalled();
    },
  );
  it("rejects forged or expired tokens reported by the provider", async () => {
    provider.mockResolvedValue(
      json({ msg: "PRIVATE token detail", code: "bad_jwt" }, 401),
    );
    await start();
    const response = await session();
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("PRIVATE");
  });
  it.each([{ is_anonymous: true }, { email_confirmed_at: null }])(
    "requires a confirmed non-anonymous account",
    async (overrides) => {
      provider.mockResolvedValue(json(user(overrides)));
      await start();
      expect((await session()).status).toBe(403);
    },
  );
  it.each([null, { id: "not-a-uuid" }, { id: uuid, role: "service_role" }])(
    "fails closed on invalid provider identities",
    async (value) => {
      provider.mockResolvedValue(json(value));
      await start();
      expect((await session()).status).toBe(503);
    },
  );
  it("does not mask provider downtime as an invalid password", async () => {
    provider.mockResolvedValue(json({ msg: "internal database failed" }, 500));
    await start();
    const response = await session();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("auth_unavailable");
  });
  it("bounds provider responses and returns safe unavailable errors", async () => {
    provider.mockResolvedValue(
      json(user({ user_metadata: { private: "x".repeat(70000) } })),
    );
    await start();
    const response = await session();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("xxxx");
  });
  it("rejects writes and demo persona escalation", async () => {
    await start();
    const response = await directFetch(`${base}/api/account/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ persona: "moderator" }),
    });
    expect(response.status).toBe(405);
    expect(provider).not.toHaveBeenCalled();
    expect(
      (
        await directFetch(`${base}/api/session`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(503);
  });
  it("revalidates every request rather than caching deleted user identity", async () => {
    provider
      .mockResolvedValueOnce(json(user()))
      .mockResolvedValueOnce(json({ msg: "user deleted" }, 401));
    await start();
    expect((await session()).status).toBe(200);
    expect((await session()).status).toBe(401);
    expect(provider).toHaveBeenCalledTimes(2);
  });
});
