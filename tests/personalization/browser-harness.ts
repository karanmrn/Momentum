// Local-only UI fixture. This entry is never imported by the application server.
import express from "express";
import { randomBytes } from "node:crypto";
import { createServer } from "vite";
import { createDatabase } from "../../server/database";
import { createDemoState } from "../../packages/domain";
import { createPersonalizationRoutes } from "../../server/personalization";
const db = await createDatabase(createDemoState, { path: "memory://" });
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use("/api", async (request, response, next) => {
  try {
    const supplied = /\bpref_test=([a-f0-9]{64})\b/.exec(
      request.headers.cookie ?? "",
    )?.[1];
    let id = supplied;
    if (!id || !(await db.session(id))) {
      id = randomBytes(32).toString("hex");
      await db.create(id);
      response.cookie("pref_test", id, { httpOnly: true, sameSite: "strict" });
    }
    response.locals.sessionId = id;
    response.locals.persona = "alex";
    next();
  } catch (error) {
    next(error);
  }
});
app.use("/api/personalization", createPersonalizationRoutes(db));
const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
app.get("/", async (_request, response) =>
  response
    .type("html")
    .send(
      await vite.transformIndexHtml(
        "/",
        `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Momentum preference fixture</title></head><body><div id="root"></div><script type="module" src="/tests/personalization/browser-entry.tsx"></script></body></html>`,
      ),
    ),
);
app.use(vite.middlewares);
const server = app.listen(4335, "127.0.0.1");
async function close() {
  server.close();
  await vite.close();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
