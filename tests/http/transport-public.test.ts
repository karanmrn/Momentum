import express from "express";
import type { Server } from "node:http";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transport: vi.fn(), cameras: vi.fn() }));
vi.mock("../../services/transport.js", () => ({
  getTransport: mocks.transport,
  getTrafficCameras: mocks.cameras,
}));
import { createPublicRoutes } from "../../server/public.js";
let server: Server, base: string;
beforeAll(async () => {
  server = express()
    .use("/api/public", createPublicRoutes())
    .listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test port");
  base = `http://127.0.0.1:${address.port}/api/public`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
it("serves scoped transport and camera metadata without sessions", async () => {
  for (const [path, mock] of [
    ["transport", mocks.transport],
    ["traffic-cameras", mocks.cameras],
  ] as const) {
    for (const pilotId of [
      "camden_town",
      "hounslow_town_centre",
      "west_croydon",
    ]) {
      mock.mockResolvedValueOnce({
        pilotId,
        status: "unavailable",
        synthetic: false,
      });
      const response = await fetch(`${base}/${path}?area=${pilotId}`);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(body.synthetic).toBe(false);
      expect(body.data.pilotId).toBe(pilotId);
      expect(mock).toHaveBeenLastCalledWith(pilotId);
    }
  }
});
it("rejects unsupported areas and methods before source reads", async () => {
  const count = mocks.transport.mock.calls.length;
  expect((await fetch(`${base}/transport?area=london`)).status).toBe(400);
  expect(
    (await fetch(`${base}/transport?area=camden_town`, { method: "POST" }))
      .status,
  ).toBe(405);
  expect(mocks.transport.mock.calls.length).toBe(count);
});
it("returns a fixed unavailable error when adapter throws", async () => {
  mocks.transport.mockRejectedValueOnce(Error("Private upstream detail"));
  const response = await fetch(`${base}/transport?area=camden_town`);
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe("source_unavailable");
  expect(JSON.stringify(body)).not.toContain("Private upstream detail");
});
