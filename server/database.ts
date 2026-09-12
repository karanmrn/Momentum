import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import {
  areas,
  pilotSchema,
  type DemoState,
  type Persona,
  type Store,
} from "../packages/contracts/index.js";
import {
  projectSemanticGraph,
  type SemanticGraph,
} from "../packages/semantic-graph/index.js";
import { getDatasetCoverage } from "../packages/datasets/src/coverage.js";
import { readSemanticGraph, replaceSemanticGraph } from "./semantic-store.js";
interface Result<T> {
  rows: T[];
}
interface Sql {
  query<T>(sql: string, params?: unknown[]): Promise<Result<T>>;
}
export interface DemoDatabase extends Store {
  graph(id: string, pilot: unknown): Promise<SemanticGraph>;
  session(id: string): Promise<Persona | null>;
  create(id: string): Promise<void>;
  setPersona(id: string, persona: Persona): Promise<void>;
  close(): Promise<void>;
}
export async function createDatabase(
  seed: () => DemoState,
  options: { path?: string; connectionString?: string } = {},
): Promise<DemoDatabase> {
  const connectionString = options.connectionString;
  const pool = connectionString
    ? new pg.Pool({
        connectionString,
        max: 3,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      })
    : null;
  const dataPath = options.path ?? ".data/streetwise";
  if (!pool && !dataPath.startsWith("memory://"))
    await mkdir(dirname(dataPath), { recursive: true });
  const lite = pool ? null : new PGlite(dataPath);
  if (lite)
    for (const migration of [
      "001_demo_sessions.sql",
      "002_semantic_graph.sql",
      "003_camden_graph.sql",
      "004_reviewed_relations.sql",
    ])
      await lite.exec(
        await readFile(
          new URL(`../supabase/migrations/${migration}`, import.meta.url),
          "utf8",
        ),
      );
  async function pruneExpired() {
    const sql =
      "DELETE FROM public.streetwise_demo_sessions WHERE id IN (SELECT id FROM public.streetwise_demo_sessions WHERE expires_at <= now() ORDER BY expires_at LIMIT 100)";
    if (lite) await lite.query(sql);
    else await pool!.query(sql);
  }
  await pruneExpired();
  async function transaction<T>(
    id: string,
    fn: (sql: Sql) => Promise<T>,
  ): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid session");
    const run = async (sql: Sql) => {
      await sql.query("SELECT set_config('app.demo_session', $1, true)", [id]);
      await sql.query("SET LOCAL ROLE streetwise_demo_app");
      return fn(sql);
    };
    if (lite) return lite.transaction(async (tx) => run(tx as Sql));
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const value = await run(client as Sql);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    async graph(id, pilot) {
      const pilotId = pilotSchema.parse(pilot);
      return transaction(id, async (sql) => {
        const row = (
          await sql.query<{ state: DemoState }>(
            "SELECT state FROM public.streetwise_demo_sessions WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!row) throw new Error("Session unavailable");
        await replaceSemanticGraph(
          sql,
          id,
          areas.map((area) =>
            projectSemanticGraph(
              row.state,
              area.id,
              getDatasetCoverage(area.id),
            ),
          ),
        );
        const graph = await readSemanticGraph(sql, id, pilotId);
        if (!graph) throw new Error("Evidence unavailable");
        return graph;
      });
    },
    async session(id) {
      return transaction(
        id,
        async (sql) =>
          (
            await sql.query<{ persona: Persona }>(
              "SELECT persona FROM public.streetwise_demo_sessions WHERE id=$1",
              [id],
            )
          ).rows[0]?.persona ?? null,
      );
    },
    async create(id) {
      await pruneExpired();
      await transaction(id, async (sql) => {
        await sql.query(
          "INSERT INTO public.streetwise_demo_sessions(id,state) VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING",
          [id, JSON.stringify(seed())],
        );
      });
    },
    async setPersona(id, persona) {
      await transaction(id, async (sql) => {
        await sql.query(
          "UPDATE public.streetwise_demo_sessions SET persona=$2, updated_at=now() WHERE id=$1",
          [id, persona],
        );
      });
    },
    async read(id) {
      return transaction(id, async (sql) => {
        const row = (
          await sql.query<{ state: DemoState }>(
            "SELECT state FROM public.streetwise_demo_sessions WHERE id=$1",
            [id],
          )
        ).rows[0];
        if (!row) throw new Error("Session unavailable");
        return row.state;
      });
    },
    async mutate<T>(id: string, fn: (state: DemoState) => T | Promise<T>) {
      return transaction(id, async (sql) => {
        const row = (
          await sql.query<{ state: DemoState }>(
            "SELECT state FROM public.streetwise_demo_sessions WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!row) throw new Error("Session unavailable");
        const result = await fn(row.state);
        await sql.query(
          "UPDATE public.streetwise_demo_sessions SET state=$2::jsonb, updated_at=now() WHERE id=$1",
          [id, JSON.stringify(row.state)],
        );
        await replaceSemanticGraph(sql, id, []);
        return result;
      });
    },
    async close() {
      if (lite) await lite.close();
      if (pool) await pool.end();
    },
  };
}
