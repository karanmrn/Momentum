import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import {
  accountIdSchema,
  privateReportInputSchema,
  followInputSchema,
  PrivateAccountError,
  type PrivateReportInput,
  type FollowInput,
} from "./private-accounts-contract.js";
export { PrivateAccountError } from "./private-accounts-contract.js";
interface Sql {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
interface Report extends PrivateReportInput {
  id: string;
  createdAt: string;
}
interface Inbox {
  id: string;
  pilotId: string;
  noticeId: string;
  createdAt: string;
  readAt: string | null;
}
interface Scope {
  pilotId: string;
  role: "moderator" | "partner";
  expiresAt: string;
}
const reportSelect = `SELECT id,pilot_id AS "pilotId",title,description,source_basis AS "sourceBasis",client_request_id AS "clientRequestId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM private_accounts.reports WHERE owner=$1 ORDER BY created_at,id LIMIT 100`;
const inboxSelect = `SELECT id,pilot_id AS "pilotId",notice_id AS "noticeId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",to_char(read_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt" FROM private_accounts.inbox WHERE owner=$1 ORDER BY created_at DESC,id LIMIT 100`;
const scopeSelect = `SELECT pilot_id AS "pilotId",role,to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt" FROM private_accounts.scopes WHERE owner=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY pilot_id,role LIMIT 6`;
async function readFollows(sql: Sql, owner: string): Promise<FollowInput> {
  return (
    (
      await sql.query<FollowInput>(
        `SELECT pilot_ids AS "pilotIds",categories,paused FROM private_accounts.follows WHERE owner=$1`,
        [owner],
      )
    ).rows[0] ?? { pilotIds: [], categories: [], paused: true }
  );
}
export async function createPrivateAccountStore(
  options: { connectionString?: string; path?: string } = {},
) {
  const pool = options.connectionString
    ? new pg.Pool({
        connectionString: options.connectionString,
        max: 3,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      })
    : null;
  const path = options.path ?? ".data/private-accounts";
  if (!pool && !path.startsWith("memory://"))
    await mkdir(dirname(path), { recursive: true });
  const lite = pool ? null : new PGlite(path);
  if (lite) {
    const exists = (
      await lite.query<{ exists: boolean }>(
        "SELECT to_regclass('private_accounts.accounts') IS NOT NULL AS exists",
      )
    ).rows[0]?.exists;
    if (!exists)
      await lite.exec(
        await readFile(
          new URL(
            "../supabase/migrations/20260912160000_private_accounts.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
  }
  async function transaction<T>(
    input: string,
    fn: (sql: Sql, owner: string) => Promise<T>,
  ): Promise<T> {
    const parsed = accountIdSchema.safeParse(input);
    if (!parsed.success)
      throw new PrivateAccountError(
        400,
        "INVALID_ACCOUNT",
        "A verified account UUID is required.",
      );
    const owner = parsed.data.toLowerCase();
    async function run(sql: Sql) {
      await sql.query("SELECT set_config('app.account_id',$1,true)", [owner]);
      await sql.query("SET LOCAL ROLE streetwise_account_app");
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      await sql.query(
        "INSERT INTO private_accounts.accounts(owner) VALUES($1) ON CONFLICT DO NOTHING",
        [owner],
      );
      const account = (
        await sql.query<{ deleted: boolean }>(
          "SELECT deleted_at IS NOT NULL AS deleted FROM private_accounts.accounts WHERE owner=$1",
          [owner],
        )
      ).rows[0];
      if (!account || account.deleted)
        throw new PrivateAccountError(
          410,
          "ACCOUNT_DELETED",
          "Account data was deleted.",
        );
      return fn(sql, owner);
    }
    if (lite) return lite.transaction((tx) => run(tx as Sql));
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client as Sql);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    report(owner: string, input: PrivateReportInput) {
      const parsed = privateReportInputSchema.safeParse(input);
      if (!parsed.success)
        throw new PrivateAccountError(
          400,
          "INVALID_REPORT",
          "Report fields are invalid.",
        );
      return transaction(owner, async (sql, id) => {
        const prior = (
          await sql.query<Report>(
            reportSelect.replace(
              "WHERE owner=$1 ORDER BY created_at,id LIMIT 100",
              "WHERE owner=$1 AND client_request_id=$2",
            ),
            [id, parsed.data.clientRequestId],
          )
        ).rows[0];
        if (prior) {
          if (
            prior.title !== parsed.data.title ||
            prior.description !== parsed.data.description ||
            prior.pilotId !== parsed.data.pilotId ||
            prior.sourceBasis !== parsed.data.sourceBasis
          )
            throw new PrivateAccountError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Request ID was used for different report fields.",
            );
          return prior;
        }
        const count = (
          await sql.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM private_accounts.reports WHERE owner=$1",
            [id],
          )
        ).rows[0]!.count;
        if (count >= 100)
          throw new PrivateAccountError(
            409,
            "REPORT_LIMIT",
            "The private report limit was reached.",
          );
        const report = parsed.data;
        return (
          await sql.query<Report>(
            `INSERT INTO private_accounts.reports(id,owner,pilot_id,title,description,source_basis,client_request_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,pilot_id AS "pilotId",title,description,source_basis AS "sourceBasis",client_request_id AS "clientRequestId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
            [
              randomUUID(),
              id,
              report.pilotId,
              report.title,
              report.description,
              report.sourceBasis,
              report.clientRequestId,
            ],
          )
        ).rows[0]!;
      });
    },
    reports(owner: string) {
      return transaction(
        owner,
        async (sql, id) => (await sql.query<Report>(reportSelect, [id])).rows,
      );
    },
    follows(owner: string) {
      return transaction(owner, readFollows);
    },
    setFollows(owner: string, input: FollowInput) {
      const parsed = followInputSchema.safeParse(input);
      if (!parsed.success)
        throw new PrivateAccountError(
          400,
          "INVALID_FOLLOWS",
          "Follow fields are invalid.",
        );
      return transaction(owner, async (sql, id) => {
        const value = parsed.data;
        await sql.query(
          "INSERT INTO private_accounts.follows(owner,pilot_ids,categories,paused) VALUES($1,$2,$3,$4) ON CONFLICT(owner) DO UPDATE SET pilot_ids=excluded.pilot_ids,categories=excluded.categories,paused=excluded.paused",
          [id, value.pilotIds, value.categories, value.paused],
        );
        return value;
      });
    },
    inbox(owner: string) {
      return transaction(
        owner,
        async (sql, id) => (await sql.query<Inbox>(inboxSelect, [id])).rows,
      );
    },
    markRead(owner: string, input: string) {
      const parsed = accountIdSchema.safeParse(input);
      if (!parsed.success)
        throw new PrivateAccountError(
          400,
          "INVALID_INBOX_ID",
          "Inbox ID is invalid.",
        );
      return transaction(owner, async (sql, id) => {
        const row = (
          await sql.query<Inbox>(
            `UPDATE private_accounts.inbox SET read_at=coalesce(read_at,now()) WHERE owner=$1 AND id=$2 RETURNING id,pilot_id AS "pilotId",notice_id AS "noticeId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",to_char(read_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt"`,
            [id, parsed.data],
          )
        ).rows[0];
        if (!row)
          throw new PrivateAccountError(
            404,
            "INBOX_NOT_FOUND",
            "Inbox item was not found.",
          );
        return row;
      });
    },
    scopes(owner: string) {
      return transaction(
        owner,
        async (sql, id) => (await sql.query<Scope>(scopeSelect, [id])).rows,
      );
    },
    exportData(owner: string) {
      return transaction(owner, async (sql, id) => {
        const inbox = (
          await sql.query<Inbox>(
            inboxSelect.replace("LIMIT 100", "LIMIT 10001"),
            [id],
          )
        ).rows;
        const scopes = (
          await sql.query<{
            pilotId: string;
            role: string;
            expiresAt: string;
            revokedAt: string | null;
          }>(
            `SELECT pilot_id AS "pilotId",role,to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt",to_char(revoked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "revokedAt" FROM private_accounts.scopes WHERE owner=$1 ORDER BY pilot_id,role LIMIT 10001`,
            [id],
          )
        ).rows;
        const reports = (
          await sql.query<Report>(
            reportSelect.replace("LIMIT 100", "LIMIT 10001"),
            [id],
          )
        ).rows;
        if (
          inbox.length > 10000 ||
          scopes.length > 10000 ||
          reports.length > 10000
        )
          throw new PrivateAccountError(
            409,
            "EXPORT_LIMIT",
            "Export exceeds the supported row limit.",
          );
        return { reports, follows: await readFollows(sql, id), inbox, scopes };
      });
    },
    deleteData(owner: string) {
      return transaction(owner, async (sql) => {
        await sql.query("SELECT private_accounts.delete_owned_data()");
        return { deleted: true as const };
      });
    },
    async close() {
      if (lite) await lite.close();
      if (pool) await pool.end();
    },
  };
}
export type PrivateAccountStore = Awaited<
  ReturnType<typeof createPrivateAccountStore>
>;
