import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type DemoDatabase } from "../../server/database";
import type { DemoState } from "../../packages/contracts/index";
const a = "a".repeat(64),
  b = "b".repeat(64);
const seed = (): DemoState => ({
  schemaVersion: "1.0",
  reports: [],
  notices: [],
  notifications: [],
  idempotency: {},
  preferences: {
    alex: {
      revision: 1,
      areas: ["hounslow_town_centre"],
      categories: ["infrastructure"],
      inAppEnabled: true,
    },
    sam: {
      revision: 1,
      areas: ["west_croydon"],
      categories: ["transport"],
      inAppEnabled: true,
    },
    moderator: {
      revision: 1,
      areas: ["camden_town"],
      categories: ["community"],
      inAppEnabled: false,
    },
  },
});
let db: DemoDatabase | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});
describe("Postgres demonstration isolation", () => {
  it("keeps persona and private state inside one session", async () => {
    db = await createDatabase(seed, { path: "memory://" });
    await db.create(a);
    await db.create(b);
    await db.setPersona(a, "moderator");
    await db.mutate(a, (s) => {
      s.preferences.alex.inAppEnabled = false;
    });
    expect(await db.session(a)).toBe("moderator");
    expect(await db.session(b)).toBe("alex");
    expect((await db.read(b)).preferences.alex.inAppEnabled).toBe(true);
  });
  it("rolls back a failed mutation", async () => {
    db = await createDatabase(seed, { path: "memory://" });
    await db.create(a);
    await expect(
      db.mutate(a, (s) => {
        s.preferences.alex.revision = 9;
        throw new Error("conflict");
      }),
    ).rejects.toThrow();
    expect((await db.read(a)).preferences.alex.revision).toBe(1);
  });
  it("serialises concurrent changes without lost revisions", async () => {
    db = await createDatabase(seed, { path: "memory://" });
    await db.create(a);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        db!.mutate(a, (s) => {
          s.preferences.alex.revision++;
        }),
      ),
    );
    expect((await db.read(a)).preferences.alex.revision).toBe(9);
  });
  it("rejects malformed session selectors", async () => {
    db = await createDatabase(seed, { path: "memory://" });
    await expect(db.read("' OR true")).rejects.toThrow("Invalid session");
  });
  it("removes expired stored content when the database starts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "streetwise-expiry-"));
    try {
      const initial = await createDatabase(seed, { path: dir });
      await initial.create(a);
      await initial.close();
      const admin = new PGlite(dir);
      await admin.query(
        "UPDATE streetwise_demo_sessions SET expires_at=now()-interval '1 minute' WHERE id=$1",
        [a],
      );
      await admin.close();
      const reopened = await createDatabase(seed, { path: dir });
      expect(await reopened.session(a)).toBeNull();
      await reopened.close();
      const verify = new PGlite(dir);
      expect(
        (await verify.query("SELECT id FROM streetwise_demo_sessions")).rows,
      ).toEqual([]);
      await verify.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("enforces row policies for reads, writes, and expired sessions", async () => {
    const pg = new PGlite();
    try {
      await pg.exec(
        await readFile(
          new URL(
            "../../supabase/migrations/001_demo_sessions.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await pg.query(
        "INSERT INTO streetwise_demo_sessions(id,state) VALUES ($1,$2),($3,$2)",
        [a, seed(), b],
      );
      await pg.transaction(async (tx) => {
        await tx.query("SELECT set_config('app.demo_session',$1,true)", [b]);
        await tx.exec("SET LOCAL ROLE streetwise_demo_app");
        expect(
          (await tx.query("SELECT id FROM streetwise_demo_sessions")).rows,
        ).toEqual([{ id: b }]);
        expect(
          (
            await tx.query(
              "UPDATE streetwise_demo_sessions SET persona=$1 WHERE id=$2 RETURNING id",
              ["moderator", a],
            )
          ).rows,
        ).toEqual([]);
      });
      await expect(
        pg.transaction(async (tx) => {
          await tx.query("SELECT set_config('app.demo_session',$1,true)", [a]);
          await tx.exec("SET LOCAL ROLE streetwise_demo_app");
          await tx.query(
            "UPDATE streetwise_demo_sessions SET id=$1 WHERE id=$2",
            ["c".repeat(64), a],
          );
        }),
      ).rejects.toThrow(/row-level security/);
      await pg.query(
        "UPDATE streetwise_demo_sessions SET expires_at=now()-interval '1 minute' WHERE id=$1",
        [b],
      );
      await pg.transaction(async (tx) => {
        await tx.query("SELECT set_config('app.demo_session',$1,true)", [b]);
        await tx.exec("SET LOCAL ROLE streetwise_demo_app");
        expect(
          (await tx.query("SELECT id FROM streetwise_demo_sessions")).rows,
        ).toEqual([]);
      });
    } finally {
      await pg.close();
    }
  });
});
