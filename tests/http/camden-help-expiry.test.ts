import express from "express";
import type { Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createPublicRoutes } from "../../server/public.js";
let server: Server | undefined;
afterEach(async () => {
  vi.useRealTimers();
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
});
it("refreshes public help at the planning boundary and overnight service end", async () => {
  server = express()
    .use("/api/public", createPublicRoutes())
    .listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const a = server.address();
  if (!a || typeof a === "string") throw Error("No test port");
  const url = `http://127.0.0.1:${a.port}/api/public/help?area=camden_town`;
  vi.useFakeTimers({ toFake: ["Date"] });
  async function address(time: string) {
    vi.setSystemTime(new Date(time));
    const r = await fetch(url);
    expect(r.status).toBe(200);
    return (await r.json()).data.find((row: { id: string }) => row.id === "C01")
      .address;
  }
  expect(await address("2026-09-12T02:29:59+01:00")).toContain("station");
  expect(await address("2026-09-12T02:30:00+01:00")).toContain("KOKO");
  expect(await address("2026-09-13T02:29:59+01:00")).toContain("KOKO");
  expect(await address("2026-09-13T02:30:00+01:00")).toContain("station");
});
it("does not extend a listing when source completion crosses its expiry", async () => {
  const services = await import("../../services/index.js");
  const { getCamdenHelp } = await import("../../services/data/camden-help.js");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-13T02:29:59+01:00"));
  const spy = vi.spyOn(services, "getHelp").mockImplementationOnce(async () => {
    const rows = getCamdenHelp();
    vi.setSystemTime(new Date("2026-09-13T02:30:00+01:00"));
    return rows;
  });
  server = express()
    .use("/api/public", createPublicRoutes())
    .listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const a = server.address();
  if (!a || typeof a === "string") throw Error("No port");
  const url = `http://127.0.0.1:${a.port}/api/public/help?area=camden_town`;
  await fetch(url);
  vi.setSystemTime(new Date("2026-09-13T02:30:01+01:00"));
  const response = await fetch(url);
  const rows = (await response.json()).data;
  expect(rows.find((r: { id: string }) => r.id === "C01").address).toContain(
    "station",
  );
  expect(spy).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});
