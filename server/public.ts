import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import {
  areas,
  pilotSchema,
  type Envelope,
  type PilotId,
} from "../packages/contracts/index.js";
import { getHelp, getSources } from "../services/index.js";
import { getHistoricalCoverage } from "../packages/history/src/coverage.js";
import { getDatasetCoverage } from "../packages/datasets/src/coverage.js";

/** Cache only validated pilot IDs. Each cache and pending map has at most three entries. */
function areaCache<T>(
  read: (area: PilotId) => T | Promise<T>,
  ttl: (data: T) => number = () => 300000,
) {
  const cache = new Map<
    PilotId,
    { until: number; data: T } | { until: number; failed: true }
  >();
  const pending = new Map<PilotId, Promise<T>>();
  return async (area: PilotId): Promise<T> => {
    const saved = cache.get(area);
    if (saved && saved.until > Date.now()) {
      if ("failed" in saved) throw new Error("Source unavailable");
      return saved.data;
    }
    let refresh = pending.get(area);
    if (!refresh) {
      refresh = Promise.resolve()
        .then(() => read(area))
        .then((data) => {
          cache.set(area, { data, until: Date.now() + ttl(data) });
          return data;
        })
        .catch(() => {
          cache.set(area, { failed: true, until: Date.now() + 60000 });
          throw new Error("Source unavailable");
        })
        .finally(() => pending.delete(area));
      pending.set(area, refresh);
    }
    return refresh;
  };
}

export function createPublicRoutes(): Router {
  const router = Router();
  const sources = areaCache(getSources, (data) =>
    data.some((source) => source.status === "unavailable") ? 60000 : 300000,
  );
  const help = areaCache(getHelp);
  const history = areaCache(getHistoricalCoverage, (data) =>
    data.status === "source_unavailable" ? 60000 : 300000,
  );
  const datasets = areaCache(getDatasetCoverage);
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.set("Allow", "GET, HEAD");
      fail(
        response,
        405,
        "method_not_allowed",
        "Public information is read-only.",
      );
      return;
    }
    next();
  });
  router.get("/areas", (_request, response) => ok(response, areas));
  const readers = { sources, help, history, datasets };
  for (const [path, read] of Object.entries(readers)) {
    router.get(`/${path}`, async (request, response) => {
      const area = pilotSchema.safeParse(request.query.area);
      if (!area.success) {
        fail(response, 400, "invalid_input", "Choose a pilot area.");
        return;
      }
      try {
        ok(response, await read(area.data));
      } catch {
        fail(
          response,
          503,
          "source_unavailable",
          "This public source is unavailable.",
        );
      }
    });
  }
  router.get("/feed", (request, response) => {
    if (!pilotSchema.safeParse(request.query.area).success) {
      fail(response, 400, "invalid_input", "Choose a pilot area.");
      return;
    }
    ok(
      response,
      [],
      [
        {
          sourceId: "community",
          status: "not_collected",
          periodStart: null,
          periodEnd: null,
        },
      ],
    );
  });
  router.use((_request, response) =>
    fail(response, 404, "not_found", "This public item is not available."),
  );
  return router;
}

function ok<T>(
  response: Response,
  data: T,
  coverage: Envelope<T>["coverage"] = [],
) {
  const body: Envelope<T> = {
    schemaVersion: "1.0",
    synthetic: false,
    generatedAt: new Date().toISOString(),
    data,
    coverage,
  };
  response.json(body);
}
function fail(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  response
    .status(status)
    .json({
      schemaVersion: "1.0",
      error: { code, message },
      requestId: randomUUID(),
    });
}
