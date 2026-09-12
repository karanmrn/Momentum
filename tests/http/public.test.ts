import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sources: vi.fn(),
  help: vi.fn(),
  history: vi.fn(),
  datasets: vi.fn(),
  database: vi.fn(),
}));
vi.mock("../../services/index", () => ({
  getSources: mocks.sources,
  getHelp: mocks.help,
}));
vi.mock("../../packages/history/src/coverage", () => ({
  getHistoricalCoverage: mocks.history,
}));
vi.mock("../../packages/datasets/src/coverage", () => ({
  getDatasetCoverage: mocks.datasets,
}));
vi.mock("../../server/database", () => ({ createDatabase: mocks.database }));
let server: Server, base: string;
const pilots = ["hounslow_town_centre", "camden_town", "west_croydon"];
const authorization =
  "Basic " + Buffer.from("demo:test-only-invitation-code").toString("base64");
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMO_ACCESS_CODE", "test-only-invitation-code");
  mocks.sources.mockImplementation(async (area: string) => [
    {
      id: area,
      title: "Public source",
      summary: "Dated source information.",
      url: "https://example.com",
      status: "available",
      sourceKind: "official_dataset",
      fetchedAt: null,
      publishedAt: null,
      synthetic: false,
      scope: area,
    },
  ]);
  mocks.help.mockImplementation(async (area: string) => [
    {
      id: area,
      pilotId: area,
      name: "Listed help",
      summary: "Availability is unconfirmed.",
      url: "https://example.com",
      availability: "unconfirmed",
      schedule: null,
    },
  ]);
  mocks.history.mockResolvedValue({
    status: "boundary_review_required",
    estimate: null,
    explanation: "Area counts need reviewed boundaries.",
    latestMonth: "2026-07",
    availableMonths: ["2026-07"],
    fetchedAt: null,
    sourceUrl: "https://example.com",
    recordCount: null,
  });
  mocks.datasets.mockImplementation((area: string) => [
    { id: area, status: "not_collected", recordCount: null },
  ]);
  mocks.database.mockRejectedValue(new Error("PRIVATE database detail"));
  const { default: handler } = await import("../../api/index");
  server = express().use(handler).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

it("serves every public endpoint without an invitation, database, or session cookie", async () => {
  vi.stubEnv("DEMO_ACCESS_CODE", "");
  for (const endpoint of [
    "areas",
    "help",
    "sources",
    "history",
    "datasets",
    "feed",
  ]) {
    const response = await fetch(
      `${base}/api/public/${endpoint}?area=camden_town`,
      { headers: { cookie: "streetwise_demo=" + "a".repeat(64) } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    const body = await response.json();
    expect(body.synthetic).toBe(false);
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
    if (endpoint === "feed") {
      expect(body.data).toEqual([]);
      expect(body.coverage[0].status).toBe("not_collected");
    }
  }
  expect(mocks.database).not.toHaveBeenCalled();
});
it("keeps private routes protected and redirects invited demo visitors before database access", async () => {
  for (const path of [
    "/api/reports",
    "/api/session",
    "/api/feed?area=camden_town",
    "/api/health",
    "/api/demo?area=camden_town",
  ]) {
    const response = await fetch(base + path, { redirect: "manual" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  const invited = await fetch(`${base}/api/demo?area=camden_town`, {
    headers: { authorization },
    redirect: "manual",
  });
  expect(invited.status).toBe(303);
  expect(invited.headers.get("location")).toBe("/?demo=1&area=camden_town");
  expect(invited.headers.get("set-cookie")).toBeNull();
  expect(invited.headers.get("cache-control")).toBe("no-store");
  expect(
    (
      await fetch(`${base}/api/demo?area=london`, {
        headers: { authorization },
        redirect: "manual",
      })
    ).status,
  ).toBe(400);
  expect(
    (await fetch(`${base}/api/session`, { headers: { authorization } })).status,
  ).toBe(503);
  expect(mocks.database).not.toHaveBeenCalled();
});
it("rejects public mutations, unknown routes, and invalid pilot selectors without database access", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await fetch(`${base}/api/public/feed?area=camden_town`, {
      method,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect((await fetch(`${base}/api/public/reports`)).status).toBe(404);
  for (const query of [
    "",
    "?area=london",
    "?area=camden_town&area=west_croydon",
  ])
    expect((await fetch(`${base}/api/public/sources${query}`)).status).toBe(
      400,
    );
  const head = await fetch(`${base}/api/public/areas`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect(mocks.database).not.toHaveBeenCalled();
  expect(mocks.sources).not.toHaveBeenCalled();
});
it("returns explicit source failures and caches failures without inventing empty results", async () => {
  mocks.sources.mockRejectedValue(new Error("PRIVATE upstream content"));
  for (let index = 0; index < 2; index++) {
    const response = await fetch(`${base}/api/public/sources?area=camden_town`);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("source_unavailable");
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
  }
  expect(mocks.sources).toHaveBeenCalledTimes(1);
  mocks.history.mockResolvedValue({
    status: "source_unavailable",
    estimate: null,
    explanation: "Publication metadata is unavailable.",
    latestMonth: null,
    availableMonths: [],
    fetchedAt: null,
    sourceUrl: "https://example.com",
    recordCount: null,
  });
  const history = await (
    await fetch(`${base}/api/public/history?area=camden_town`)
  ).json();
  expect(history.data.status).toBe("source_unavailable");
  expect(history.data.recordCount).toBeNull();
  mocks.help.mockRejectedValue(new Error("Directory is unavailable"));
  expect((await fetch(`${base}/api/public/help?area=camden_town`)).status).toBe(
    503,
  );
});
it("shares concurrent reads and caches each of the three validated pilot areas separately", async () => {
  for (let round = 0; round < 2; round++) {
    await Promise.all(
      pilots.flatMap((area) =>
        Array.from({ length: 3 }, async () => {
          const response = await fetch(
            `${base}/api/public/sources?area=${area}`,
          );
          expect(response.status).toBe(200);
          expect((await response.json()).data[0].id).toBe(area);
        }),
      ),
    );
  }
  expect(mocks.sources).toHaveBeenCalledTimes(3);
  expect(mocks.database).not.toHaveBeenCalled();
});
it("defers configured database access until an invited private request and retries failed initialization", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test-only.invalid/example");
  expect((await fetch(`${base}/api/public/areas`)).status).toBe(200);
  expect(mocks.database).not.toHaveBeenCalled();
  for (let index = 0; index < 2; index++) {
    const response = await fetch(`${base}/api/session`, {
      headers: { authorization },
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE");
  }
  expect(mocks.database).toHaveBeenCalledTimes(2);
});
