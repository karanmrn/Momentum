import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import pg from "pg";
import { recentUpdatesSnapshotSchema } from "../packages/recent-updates/index.js";
import {
  createRecentUpdatesService,
  type RecentUpdatesStore,
} from "../services/recent-updates.js";

type SqlClient = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
/** Migration must be applied separately with a server-only database role. */
export function createPostgresRecentUpdatesStore(
  connection: string | SqlClient,
): RecentUpdatesStore & { close(): Promise<void> } {
  const owned =
    typeof connection === "string"
      ? new pg.Pool({
          connectionString: connection,
          max: 2,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 10000,
          statement_timeout: 8000,
        })
      : null;
  const sql = owned ?? (connection as SqlClient);
  return {
    async read() {
      const result = await sql.query(
        "SELECT snapshot FROM public.recent_updates_snapshot WHERE id = 'latest'",
      );
      return result.rows[0]?.snapshot ?? null;
    },
    async write(value) {
      const snapshot = recentUpdatesSnapshotSchema.parse(value);
      await sql.query(
        `INSERT INTO public.recent_updates_snapshot AS saved (id, snapshot)
         VALUES ('latest', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET snapshot = (
           SELECT attempt || jsonb_build_object(
             'items', successful->'items',
             'sources', jsonb_build_array(
               (attempt #> '{sources,0}') || jsonb_build_object(
                 'lastSuccessAt', successful #> '{sources,0,lastSuccessAt}'
               )
             ),
             'status', CASE
               WHEN successful #>> '{sources,0,lastSuccessAt}' IS NULL THEN 'unavailable'
               WHEN attempt #>> '{sources,0,status}' = 'success' THEN 'current'
               ELSE 'stale'
             END
           )
           FROM (
             SELECT
               CASE WHEN (EXCLUDED.snapshot->>'checkedAt')::timestamptz >
                              (saved.snapshot->>'checkedAt')::timestamptz
                    THEN EXCLUDED.snapshot ELSE saved.snapshot END AS attempt,
               CASE WHEN COALESCE((EXCLUDED.snapshot #>> '{sources,0,lastSuccessAt}')::timestamptz, '-infinity'::timestamptz) >
                              COALESCE((saved.snapshot #>> '{sources,0,lastSuccessAt}')::timestamptz, '-infinity'::timestamptz)
                    THEN EXCLUDED.snapshot ELSE saved.snapshot END AS successful
           ) AS versions
         )`,
        [JSON.stringify(snapshot)],
      );
    },
    async close() {
      if (owned) await owned.end();
    },
  };
}
export function validRecentUpdatesSecret(
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 16 || secret.length > 256 || /\s/.test(secret))
    return false;
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createRecentUpdatesRouter({
  service,
  cronSecret = () => process.env.CRON_SECRET,
}: {
  service: ReturnType<typeof createRecentUpdatesService>;
  cronSecret?: () => string | undefined;
}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/", async (_req, res) => {
    res.json({
      schemaVersion: "1.0",
      synthetic: false,
      generatedAt: new Date().toISOString(),
      data: await service.read(),
      coverage: [],
    });
  });
  router.get("/refresh", async (req, res) => {
    if (!validRecentUpdatesSecret(req.headers.authorization, cronSecret())) {
      res.status(401).json({
        error: {
          code: "unauthorized",
          message: "Refresh authorization is required.",
        },
      });
      return;
    }
    try {
      const snapshot = await service.refresh();
      res
        .status(
          snapshot.sources.some((source) => source.status === "failed")
            ? 502
            : 200,
        )
        .json({
          checkedAt: snapshot.checkedAt,
          status: snapshot.status,
          itemCount: snapshot.items.length,
        });
    } catch {
      res.status(503).json({
        error: {
          code: "refresh_unavailable",
          message: "The news refresh is unavailable.",
        },
      });
    }
  });
  router.all(["/", "/refresh"], (_req, res) => {
    res
      .set("Allow", "GET")
      .status(405)
      .json({
        error: {
          code: "method_not_allowed",
          message: "Use GET for this endpoint.",
        },
      });
  });
  return router;
}
