import { createRecentUpdatesService } from "../services/recent-updates.js";
import {
  createPostgresRecentUpdatesStore,
  createRecentUpdatesRouter,
} from "./recent-updates.js";
import { createAccountRoutes } from "./account.js";
import { getDatasetCoverage } from "../packages/datasets/src/coverage.js";
import { getHistoricalCoverage } from "../packages/history/src/coverage.js";
import express from "express";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  areas,
  personaSchema,
  pilotSchema,
  type Envelope,
} from "../packages/contracts/index.js";
import type { DemoDatabase } from "./database.js";
import { createRoutes } from "./routes.js";
import { createSemanticRoutes } from "./semantic.js";
import { createPublicRoutes } from "./public.js";
import { getHelp, getSources } from "../services/index.js";
export function createApp(db: DemoDatabase | (() => Promise<DemoDatabase>)) {
  const database = () =>
    typeof db === "function" ? db() : Promise.resolve(db);
  const store: Pick<DemoDatabase, "read" | "mutate"> = {
    read: async (id) => (await database()).read(id),
    mutate: async (id, operation) => (await database()).mutate(id, operation),
  };
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    });
    next();
  });
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api/account", createAccountRoutes());
  app.use("/api/public/graph", createSemanticRoutes());
  const updatesConnection =
    process.env.RECENT_UPDATES_DATABASE_URL || process.env.DATABASE_URL;
  const updatesStore = updatesConnection
    ? createPostgresRecentUpdatesStore(updatesConnection)
    : {
        async read() {
          throw new Error("Updates storage is unavailable.");
        },
        async write() {
          throw new Error("Updates storage is unavailable.");
        },
      };
  app.use(
    "/api/public/recent-updates",
    createRecentUpdatesRouter({
      service: createRecentUpdatesService({ store: updatesStore }),
    }),
  );
  app.use("/api/public", createPublicRoutes());
  if (process.env.VERCEL) {
    app.use((req, res, next) => {
      const secret = process.env.DEMO_ACCESS_CODE;
      if (!secret || secret.length < 16) {
        res.status(503).send("The invited demonstration is not configured.");
        return;
      }
      const expected = Buffer.from("demo:" + secret);
      const supplied = Buffer.from(
        (req.headers.authorization ?? "").replace(/^Basic /, ""),
        "base64",
      );
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        res
          .set(
            "WWW-Authenticate",
            'Basic realm="Streetwise invited demonstration"',
          )
          .status(401)
          .send("An invitation is required.");
        return;
      }
      next();
    });
  }
  app.get("/api/demo", (request, response) => {
    const area = pilotSchema.safeParse(request.query.area);
    if (!area.success) {
      fail(response, 400, "invalid_input", "Choose a pilot area.");
      return;
    }
    response.redirect(303, `/?demo=1&area=${encodeURIComponent(area.data)}`);
  });
  app.use("/api", express.json({ limit: "8kb" }));
  const sourceCaches = new Map<
    string,
    { until: number; data: Awaited<ReturnType<typeof getSources>> }
  >();
  const sourceRefreshes = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getSources>>>
  >();
  const historyCaches = new Map<
    string,
    { until: number; data: Awaited<ReturnType<typeof getHistoricalCoverage>> }
  >();
  const historyRefreshes = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getHistoricalCoverage>>>
  >();
  const limits = new Map<string, { count: number; until: number }>();
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["sec-fetch-site"] === "cross-site") {
        fail(res, 403, "unauthorised", "This request is not permitted.");
        return;
      }
      const origin = req.headers.origin;
      if (
        origin &&
        origin !==
          `${process.env.VERCEL ? "https" : req.protocol}://${req.get("host")}`
      ) {
        fail(res, 403, "unauthorised", "This request is not permitted.");
        return;
      }
      if (!req.is("application/json")) {
        fail(res, 415, "invalid_input", "Use a JSON request.");
        return;
      }
    }
    const key = req.ip ?? "local";
    const now = Date.now();
    let budget = limits.get(key);
    if (!budget || budget.until < now) {
      budget = { count: 0, until: now + 60000 };
      limits.set(key, budget);
    }
    if (++budget.count > 300) {
      res.set("Retry-After", "60");
      fail(res, 429, "rate_limited", "Please wait before trying again.");
      return;
    }
    if (limits.size > 1000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", mode: "synthetic_demo" }),
  );
  app.use("/api", async (req, res, next) => {
    try {
      const storage = await database();
      const token = (req.headers.cookie ?? "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("streetwise_demo="))
        ?.slice(16);
      let id =
        token && /^[a-f0-9]{64}$/.test(token)
          ? createHash("sha256").update(token).digest("hex")
          : null;
      let persona = id ? await storage.session(id) : null;
      if (!id || !persona) {
        const fresh = randomBytes(32).toString("hex");
        id = createHash("sha256").update(fresh).digest("hex");
        await storage.create(id);
        persona = "alex";
        res.cookie("streetwise_demo", fresh, {
          httpOnly: true,
          sameSite: "strict",
          secure: !!process.env.VERCEL,
          maxAge: 86400000,
          path: "/",
        });
      }
      res.locals.sessionId = id;
      res.locals.persona = persona;
      next();
    } catch {
      fail(
        res,
        503,
        "source_unavailable",
        "The demonstration database is unavailable.",
      );
    }
  });
  app.get("/api/session", (_req, res) =>
    ok(res, {
      persona: res.locals.persona,
      synthetic: true,
      moderatorAreas: areas.map((a) => a.id),
    }),
  );
  app.post("/api/session", async (req, res) => {
    const parsed = personaSchema.safeParse(req.body?.persona);
    if (!parsed.success || Object.keys(req.body).length !== 1) {
      fail(res, 400, "invalid_input", "Choose a demonstration persona.");
      return;
    }
    await (await database()).setPersona(res.locals.sessionId, parsed.data);
    ok(res, {
      persona: parsed.data,
      synthetic: true,
      moderatorAreas: areas.map((a) => a.id),
    });
  });
  app.get("/api/areas", (_req, res) => ok(res, areas));
  app.get("/api/sources", async (req, res) => {
    const area = pilotSchema.safeParse(req.query.area);
    if (!area.success) {
      fail(res, 400, "invalid_input", "Choose a pilot area.");
      return;
    }
    const cached = sourceCaches.get(area.data);
    if (cached && cached.until > Date.now()) {
      ok(res, cached.data, false);
      return;
    }
    let refresh = sourceRefreshes.get(area.data);
    if (!refresh) {
      refresh = getSources(area.data)
        .then((data) => {
          sourceCaches.set(area.data, {
            data,
            until:
              Date.now() +
              (data.some((source) => source.status === "unavailable")
                ? 60000
                : 300000),
          });
          return data;
        })
        .finally(() => sourceRefreshes.delete(area.data));
      sourceRefreshes.set(area.data, refresh);
    }
    ok(res, await refresh, false);
  });
  app.get("/api/help", async (req, res) => {
    const area = pilotSchema.safeParse(req.query.area);
    if (!area.success) {
      fail(res, 400, "invalid_input", "Choose a pilot area.");
      return;
    }
    ok(res, await getHelp(area.data), false);
  });
  app.get("/api/history", async (req, res) => {
    const area = pilotSchema.safeParse(req.query.area);
    if (!area.success) {
      fail(res, 400, "invalid_input", "Choose a pilot area.");
      return;
    }
    const cached = historyCaches.get(area.data);
    if (cached && cached.until > Date.now()) {
      ok(res, cached.data, false);
      return;
    }
    let refresh = historyRefreshes.get(area.data);
    if (!refresh) {
      refresh = getHistoricalCoverage(area.data)
        .then((data) => {
          historyCaches.set(area.data, {
            data,
            until:
              Date.now() +
              (data.status === "source_unavailable" ? 60000 : 300000),
          });
          return data;
        })
        .finally(() => historyRefreshes.delete(area.data));
      historyRefreshes.set(area.data, refresh);
    }
    ok(res, await refresh, false);
  });
  app.get("/api/datasets", (req, res) => {
    const area = pilotSchema.safeParse(req.query.area);
    if (!area.success) {
      fail(res, 400, "invalid_input", "Choose a pilot area.");
      return;
    }
    ok(res, getDatasetCoverage(area.data), false);
  });
  app.use(
    "/api/graph",
    createSemanticRoutes({
      graph: async (id, pilot) => (await database()).graph(id, pilot),
    }),
  );
  app.use("/api", createRoutes(store));
  app.use("/api", (_req, res) =>
    fail(res, 404, "not_found", "This item is not available."),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const e = error as { type?: string };
      if (e.type === "entity.too.large") {
        fail(res, 413, "invalid_input", "This request is too large.");
        return;
      }
      if (error instanceof SyntaxError) {
        fail(res, 400, "invalid_input", "Use valid JSON.");
        return;
      }
      fail(res, 500, "internal_error", "This action could not be completed.");
    },
  );
  return app;
}
function ok<T>(res: express.Response, data: T, synthetic = true) {
  const body: Envelope<T> = {
    schemaVersion: "1.0",
    synthetic,
    generatedAt: new Date().toISOString(),
    data,
    coverage: [],
  };
  res.json(body);
}
function fail(
  res: express.Response,
  status: number,
  code: string,
  message: string,
) {
  res.status(status).json({
    schemaVersion: "1.0",
    error: { code, message },
    requestId: randomUUID(),
  });
}
