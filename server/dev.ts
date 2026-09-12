import { createServer } from "vite";
import { createDatabase } from "./database";
import { createDemoState } from "../packages/domain/index";
import { createApp } from "./app";
const db = await createDatabase(createDemoState, {
  path: process.env.DEMO_DB_PATH ?? ".data/streetwise",
  connectionString: process.env.DATABASE_URL,
});
const app = createApp(db);
const port = Number(process.env.PORT ?? 4173);
const vite = await createServer({
  server: {
    middlewareMode: true,
    hmr: { port: port + 1000, host: "127.0.0.1" },
    watch: { ignored: ["**/.data/**"] },
  },
  appType: "spa",
});
app.use(vite.middlewares);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Streetwise demonstration: http://127.0.0.1:${port}`),
);
async function close() {
  server.close();
  await vite.close();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
