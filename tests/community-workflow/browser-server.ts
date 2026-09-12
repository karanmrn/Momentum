import express from "express";
import { createServer } from "vite";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { createCommunityWorkflowRoutes } from "../../server/community-workflow.js";
import { createDemoState, DomainError } from "../../packages/domain/index.js";
import {
  personaSchema,
  type DemoState,
  type Persona,
  type Store,
} from "../../packages/contracts/index.js";
const states = new Map<string, { state: DemoState; persona: Persona }>();
const store: Store = {
  read: async (id) => structuredClone(states.get(id)!.state),
  mutate: async (id, operation) => {
    const value = structuredClone(states.get(id)!.state);
    const result = await operation(value);
    states.get(id)!.state = value;
    return result;
  },
};
const app = express();
app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => {
  let id = req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("cwtest="))
    ?.slice(7);
  if (!id || !states.has(id)) {
    id = randomUUID();
    states.set(id, { state: createDemoState(), persona: "alex" });
    res.cookie("cwtest", id, { httpOnly: true, sameSite: "strict" });
  }
  res.locals.sessionId = id;
  res.locals.persona = states.get(id)!.persona;
  res.locals.moderatorAreas = [
    "camden_town",
    "hounslow_town_centre",
    "west_croydon",
  ];
  next();
});
app.get("/api/session", (_req, res) =>
  res.json({ persona: res.locals.persona }),
);
app.post("/api/session", (req, res) => {
  const persona = personaSchema.parse(req.body.persona);
  states.get(res.locals.sessionId)!.persona = persona;
  res.json({ persona });
});
app.use("/api/community-workflow", createCommunityWorkflowRoutes(store));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res
      .status(
        error instanceof DomainError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 500,
      )
      .json({
        schemaVersion: "1.0",
        error: {
          message:
            error instanceof DomainError
              ? error.message
              : "Check the request fields.",
        },
      }),
);
const vite = await createServer({
  server: { middlewareMode: true, hmr: { port: 5198, host: "127.0.0.1" } },
  appType: "custom",
});
app.get("/", async (req, res) =>
  res
    .type("html")
    .send(
      await vite.transformIndexHtml(
        req.originalUrl,
        '<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0"><div id="root"></div><script type="module" src="/tests/community-workflow/browser-entry.tsx"></script></body></html>',
      ),
    ),
);
app.use(vite.middlewares);
const server = app.listen(4198, "127.0.0.1", () =>
  console.log("Community test harness http://127.0.0.1:4198"),
);
process.on("SIGTERM", () => {
  server.close();
  void vite.close();
});
process.on("SIGINT", () => {
  server.close();
  void vite.close();
});
