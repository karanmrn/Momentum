import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createPrivateAccountStore } from "../../server/private-accounts-store.js";
import {
  privateReportInputSchema,
  followInputSchema,
} from "../../server/private-accounts-contract.js";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const report = {
  clientRequestId: a,
  pilotId: "camden_town" as const,
  title: "Broken pavement",
  description: "A fictional pavement observation.",
  sourceBasis: "firsthand" as const,
};
describe("private account store", () => {
  let store: Awaited<ReturnType<typeof createPrivateAccountStore>>;
  beforeAll(async () => {
    store = await createPrivateAccountStore({ path: "memory://" });
  });
  afterAll(async () => store.close());
  it("rejects owner, role and duplicate preference input", () => {
    expect(
      privateReportInputSchema.safeParse({ ...report, owner: a }).success,
    ).toBe(false);
    expect(
      privateReportInputSchema.safeParse({ ...report, role: "moderator" })
        .success,
    ).toBe(false);
    expect(
      followInputSchema.safeParse({
        pilotIds: ["camden_town", "camden_town"],
        categories: [],
        paused: false,
      }).success,
    ).toBe(false);
  });
  it("isolates reports and rejects non-UUID identities", async () => {
    await expect(store.reports("alex")).rejects.toMatchObject({ status: 400 });
    const row = await store.report(a, report);
    expect(row).toMatchObject(report);
    expect(row).not.toHaveProperty("owner");
    expect(await store.reports(b)).toEqual([]);
    expect(await store.reports(a)).toHaveLength(1);
  });
  it("replays the same request and rejects changed content", async () => {
    const original = (await store.reports(a))[0];
    expect(await store.report(a, report)).toEqual(original);
    await expect(
      store.report(a, { ...report, title: "Changed title" }),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  });
  it("serializes report creation against account deletion", async () => {
    const owner = randomUUID();
    const results = await Promise.allSettled([
      store.report(owner, { ...report, clientRequestId: randomUUID() }),
      store.deleteData(owner),
    ]);
    expect(results[1].status).toBe("fulfilled");
    await expect(store.exportData(owner)).rejects.toMatchObject({
      status: 410,
    });
  });
  it("replaces private follows and exports only owned data", async () => {
    await store.setFollows(a, {
      pilotIds: ["camden_town"],
      categories: ["community"],
      paused: false,
    });
    await store.setFollows(a, {
      pilotIds: ["west_croydon"],
      categories: [],
      paused: true,
    });
    const exported = await store.exportData(a);
    expect(exported.follows.pilotIds).toEqual(["west_croydon"]);
    expect(exported.reports).toHaveLength(1);
    expect(exported.scopes).toEqual([]);
    expect(await store.follows(b)).toEqual({
      pilotIds: [],
      categories: [],
      paused: true,
    });
    await expect(store.markRead(a, b)).rejects.toMatchObject({ status: 404 });
  });
  it("enforces the 100 report bound", async () => {
    for (let i = 0; i < 100; i++)
      await store.report(b, { ...report, clientRequestId: randomUUID() });
    await expect(
      store.report(b, { ...report, clientRequestId: randomUUID() }),
    ).rejects.toMatchObject({
      code: "REPORT_LIMIT",
    });
    expect((await store.exportData(b)).reports).toHaveLength(100);
  });
  it("deletes all owned state and prevents stale token recreation", async () => {
    expect(await store.deleteData(a)).toEqual({ deleted: true });
    await expect(store.reports(a)).rejects.toMatchObject({ status: 410 });
    await expect(store.report(a, report)).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      store.setFollows(a, { pilotIds: [], categories: [], paused: true }),
    ).rejects.toMatchObject({ status: 410 });
    expect(await store.reports(b)).toHaveLength(100);
  });
});
describe("actual PostgreSQL role and RLS boundaries", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260912160000_private_accounts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;",
    );
    await db.query(
      "INSERT INTO private_accounts.accounts(owner) VALUES($1),($2)",
      [a, b],
    );
    await db.query(
      `INSERT INTO private_accounts.reports(id,owner,pilot_id,title,description,source_basis,client_request_id) VALUES($1,$2,'camden_town','Fixture','Private fixture description','firsthand',$1)`,
      [a, a],
    );
    await db.query(
      `INSERT INTO private_accounts.scopes(owner,pilot_id,role,expires_at) VALUES($1,'camden_town','moderator',now()+interval '1 day')`,
      [a],
    );
    await db.query(
      `INSERT INTO private_accounts.inbox(id,owner,pilot_id,notice_id) VALUES($1,$2,'camden_town','public-notice')`,
      [a, a],
    );
  });
  afterAll(async () => db.close());
  async function runtime<T>(owner: string, fn: (tx: any) => Promise<T>) {
    return db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.account_id',$1,true)", [owner]);
      await tx.exec("SET LOCAL ROLE streetwise_account_app");
      return fn(tx);
    });
  }
  it("returns active scopes but exports revoked scope metadata", async () => {
    const path = `.data/account-storage-scope-${randomUUID()}`;
    const storage = await createPrivateAccountStore({ path });
    await storage.reports(a);
    await storage.close();
    const database = new PGlite(path);
    await database.query(
      `INSERT INTO private_accounts.scopes(owner,pilot_id,role,expires_at,revoked_at) VALUES($1,'camden_town','moderator',now()+interval '1 day',NULL),($1,'west_croydon','partner',now()-interval '1 day',now())`,
      [a],
    );
    await database.close();
    const reopened = await createPrivateAccountStore({ path });
    try {
      expect(await reopened.scopes(a)).toHaveLength(1);
      const exported = await reopened.exportData(a);
      expect(exported.scopes).toHaveLength(2);
      expect(exported.scopes[1].revokedAt).not.toBeNull();
    } finally {
      await reopened.close();
    }
  });
  it("blocks browser roles and absent identity", async () => {
    for (const role of ["anon", "authenticated"])
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${role}`);
          await tx.query("SELECT * FROM private_accounts.reports");
        }),
      ).rejects.toThrow(/permission denied/);
    expect(
      await runtime(
        "",
        async (tx) =>
          (await tx.query("SELECT * FROM private_accounts.reports")).rows,
      ),
    ).toEqual([]);
  });
  it("blocks cross-owner reads and writes", async () => {
    expect(
      await runtime(
        b,
        async (tx) =>
          (await tx.query("SELECT * FROM private_accounts.reports")).rows,
      ),
    ).toEqual([]);
    await expect(
      runtime(b, async (tx) =>
        tx.query(
          `INSERT INTO private_accounts.reports(id,owner,pilot_id,title,description,source_basis,client_request_id) VALUES($1,$2,'camden_town','Fixture','Private fixture description','firsthand',$1)`,
          [b, a],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      await runtime(
        b,
        async (tx) =>
          (
            await tx.query(
              "UPDATE private_accounts.inbox SET read_at=now() WHERE id=$1 RETURNING id",
              [a],
            )
          ).rows,
      ),
    ).toEqual([]);
  });
  it("denies runtime scope assignment and inbox narrative injection", async () => {
    await expect(
      runtime(a, async (tx) =>
        tx.query("UPDATE private_accounts.scopes SET role='partner'"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      runtime(a, async (tx) =>
        tx.query(
          "INSERT INTO private_accounts.scopes(owner,pilot_id,role,expires_at) VALUES($1,'west_croydon','partner',now())",
          [a],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      runtime(a, async (tx) =>
        tx.query("UPDATE private_accounts.inbox SET notice_id='changed'"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("deletes scopes and inbox atomically while retaining an immutable tombstone", async () => {
    await runtime(a, async (tx) =>
      tx.query("SELECT private_accounts.delete_owned_data()"),
    );
    for (const table of ["reports", "follows", "inbox", "scopes"])
      expect(
        (
          await db.query(
            `SELECT * FROM private_accounts.${table} WHERE owner=$1`,
            [a],
          )
        ).rows,
      ).toEqual([]);
    expect(
      (
        await db.query(
          "SELECT deleted_at FROM private_accounts.accounts WHERE owner=$1",
          [a],
        )
      ).rows[0],
    ).toHaveProperty("deleted_at");
    await expect(
      runtime(a, async (tx) =>
        tx.query("UPDATE private_accounts.accounts SET deleted_at=NULL"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      runtime(a, async (tx) =>
        tx.query("DELETE FROM private_accounts.accounts"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      runtime(a, async (tx) =>
        tx.query(
          `INSERT INTO private_accounts.reports(id,owner,pilot_id,title,description,source_basis,client_request_id) VALUES($1,$1,'camden_town','Fixture','Private fixture description','firsthand',$1)`,
          [a],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
