import { describe, expect, it, vi } from "vitest";
import express from "express";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import {
  createRecentUpdatesService,
  emptyRecentUpdates,
  parseRecentUpdatesRss,
  RECENT_UPDATES_FEED,
  RECENT_UPDATES_MAX_BYTES,
  type RecentUpdatesStore,
} from "../services/recent-updates.js";
import {
  createPostgresRecentUpdatesStore,
  createRecentUpdatesRouter,
  validRecentUpdatesSecret,
} from "../server/recent-updates.js";
import type { RecentUpdatesSnapshot } from "../packages/recent-updates/index.js";
const NOW = new Date("2026-09-12T16:00:00Z");
const ARTICLE_URL = "https://www.bbc.co.uk/news/articles/abc123";
const entry = (
  title = "Police investigate Camden assault",
  url = ARTICLE_URL,
  date = NOW.toUTCString(),
) =>
  `<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`;
const rss = (items = entry()) =>
  `<rss version="2.0"><channel>${items}</channel></rss>`;
function memory() {
  let saved: unknown = null;
  const store: RecentUpdatesStore = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (value) => {
      saved = value;
    }),
  };
  return store;
}

describe("recent news feed", () => {
  it("retains publication date, unknown event date and broad borough mapping", () => {
    const [item] = parseRecentUpdatesRss(rss(), NOW);
    expect(item).toMatchObject({
      title: "Police investigate Camden assault",
      publishedAt: NOW.toISOString(),
      occurredAt: null,
      areaIds: ["camden_town"],
      scope: "borough",
      sourceKind: "news",
    });
    expect(item.scopeLabel).toContain("exact location unverified");
  });
  it("keeps city coverage separate and discards unrelated headlines", () => {
    const items = parseRecentUpdatesRss(
      rss(
        entry("Police investigate attack in east London") +
          entry("Best London theatre tickets", `${ARTICLE_URL}b`),
      ),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].areaIds).toEqual([]);
    expect(items[0].scope).toBe("london");
  });
  it.each([
    "yesterday",
    "Thu, 01 Jan 1970 00:00:00 GMT",
    "Sun, 13 Sep 2026 00:00:00 GMT",
  ])("rejects unknown, old and future dates: %s", (date) => {
    expect(
      parseRecentUpdatesRss(rss(entry(undefined, undefined, date)), NOW),
    ).toEqual([]);
  });
  it.each([
    "http://www.bbc.co.uk/news/articles/a",
    "https://www.bbc.co.uk.evil.test/news/articles/a",
    "https://127.0.0.1/news/articles/a",
    "https://user@www.bbc.co.uk/news/articles/a",
    "https://www.bbc.co.uk:444/news/articles/a",
    "https://www.bbc.co.uk/redirect?q=abc",
  ])("rejects unsupported article URL %s", (url) => {
    expect(parseRecentUpdatesRss(rss(entry(undefined, url)), NOW)).toEqual([]);
  });
  it("deduplicates tracking variants and preserves text, never markup", () => {
    const items = parseRecentUpdatesRss(
      rss(
        entry(
          "Police &amp; council report &lt;script&gt;bad&lt;/script&gt;",
          `${ARTICLE_URL}?tracking=1`,
        ) + entry(undefined, `${ARTICLE_URL}?tracking=2`),
      ),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe(ARTICLE_URL);
    expect(items[0].title).toBe("Police & council report bad");
  });
  it.each([
    "<rss><channel><item></channel></rss>",
    "<!DOCTYPE rss><rss><channel></channel></rss>",
    "<html>Sorry</html>",
    "<rss><channel><item>",
  ])("fails invalid XML subset", (xml) => {
    expect(() => parseRecentUpdatesRss(xml, NOW)).toThrow();
  });
  it("bounds source and result sizes", () => {
    expect(() =>
      parseRecentUpdatesRss(rss("x".repeat(RECENT_UPDATES_MAX_BYTES)), NOW),
    ).toThrow();
    expect(() =>
      parseRecentUpdatesRss(rss(entry().repeat(201)), NOW),
    ).toThrow();
    expect(
      parseRecentUpdatesRss(
        rss(
          Array.from({ length: 60 }, (_, i) =>
            entry(undefined, `${ARTICLE_URL}${i}`),
          ).join(""),
        ),
        NOW,
      ),
    ).toHaveLength(50);
  });
  it("reports failed refresh while retaining last success and older valid headlines", async () => {
    const store = memory();
    let fails = false;
    let at = NOW;
    const fetchImpl = vi.fn(async () => {
      if (fails) throw new Error("secret detail");
      return new Response(rss());
    });
    const service = createRecentUpdatesService({
      store,
      fetchImpl,
      now: () => at,
    });
    expect((await service.refresh()).status).toBe("current");
    fails = true;
    at = new Date(NOW.getTime() + 86400000);
    const failed = await service.refresh();
    expect(failed.status).toBe("stale");
    expect(failed.items).toHaveLength(1);
    expect(failed.sources[0]).toMatchObject({
      status: "failed",
      lastSuccessAt: NOW.toISOString(),
      lastCheckedAt: at.toISOString(),
    });
    expect(JSON.stringify(failed)).not.toContain("secret detail");
    at = new Date(NOW.getTime() + 31 * 86400000);
    expect((await service.read()).items).toEqual([]);
  });
  it("marks an aged successful refresh stale and validates stored state", async () => {
    const store = memory();
    let at = NOW;
    const service = createRecentUpdatesService({
      store,
      fetchImpl: async () => new Response(rss()),
      now: () => at,
    });
    await service.refresh();
    at = new Date(NOW.getTime() + 37 * 3600000);
    expect((await service.read()).status).toBe("stale");
    const bad = createRecentUpdatesService({
      store: { read: async () => ({ items: [] }), write: async () => {} },
    });
    expect((await bad.read()).status).toBe("unavailable");
  });
  it("does not fetch when persistence is unavailable", async () => {
    const fetchImpl = vi.fn();
    const service = createRecentUpdatesService({
      store: {
        read: async () => {
          throw Error("storage");
        },
        write: async () => {},
      },
      fetchImpl,
    });
    expect((await service.read()).status).toBe("unavailable");
    await expect(service.refresh()).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    () =>
      new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1/" },
      }),
    () => new Response("x".repeat(RECENT_UPDATES_MAX_BYTES + 1)),
    () =>
      new Response("", {
        headers: { "content-length": String(RECENT_UPDATES_MAX_BYTES + 1) },
      }),
    () => {
      throw new DOMException("Timeout", "TimeoutError");
    },
  ])("fails closed on redirects, limits and timeout", async (make) => {
    const fetchImpl = vi.fn(async () => make());
    const result = await createRecentUpdatesService({
      store: memory(),
      fetchImpl,
      now: () => NOW,
    }).refresh();
    expect(result.status).toBe("unavailable");
    expect(result.sources[0].status).toBe("failed");
    expect(fetchImpl).toHaveBeenCalledWith(
      RECENT_UPDATES_FEED,
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("coalesces concurrent refresh calls", async () => {
    const fetchImpl = vi.fn(async () => new Response(rss()));
    const service = createRecentUpdatesService({
      store: memory(),
      fetchImpl,
      now: () => NOW,
    });
    await Promise.all([service.refresh(), service.refresh()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("news refresh routes and persistence", () => {
  it("compares an exact bounded Bearer credential", () => {
    const secret = "abcdefghijklmnop";
    expect(validRecentUpdatesSecret(`Bearer ${secret}`, secret)).toBe(true);
    for (const header of [
      undefined,
      secret,
      `bearer ${secret}`,
      `Bearer ${secret} `,
    ])
      expect(validRecentUpdatesSecret(header, secret)).toBe(false);
    expect(validRecentUpdatesSecret("Bearer undefined", undefined)).toBe(false);
    expect(validRecentUpdatesSecret("Bearer abc", "abc")).toBe(false);
  });
  it("authenticates before refresh and never writes through a public read", async () => {
    const store = memory();
    const fetchImpl = vi.fn(async () => new Response(rss()));
    const app = express().use(
      createRecentUpdatesRouter({
        service: createRecentUpdatesService({
          store,
          fetchImpl,
          now: () => NOW,
        }),
        cronSecret: () => "abcdefghijklmnop",
      }),
    );
    const server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw Error("address");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect((await fetch(`${base}/refresh`)).status).toBe(401);
      expect(store.read).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await fetch(base)).status).toBe(200);
      expect(store.write).not.toHaveBeenCalled();
      expect(
        (
          await fetch(`${base}/refresh`, {
            method: "POST",
            headers: { authorization: "Bearer abcdefghijklmnop" },
          })
        ).status,
      ).toBe(405);
      expect(
        (
          await fetch(`${base}/refresh`, {
            headers: { authorization: "Bearer abcdefghijklmnop" },
          })
        ).status,
      ).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("preserves a newer snapshot when an older job finishes late", async () => {
    const database = new PGlite();
    try {
      await database.exec(
        "CREATE TABLE public.recent_updates_snapshot(id text PRIMARY KEY, snapshot jsonb NOT NULL)",
      );
      const store = createPostgresRecentUpdatesStore({
        query: async (sql, values) => database.query(sql, values),
      });
      const newer = { ...emptyRecentUpdates(), checkedAt: NOW.toISOString() };
      await store.write(newer);
      await store.write({ ...newer, checkedAt: "2026-09-11T16:00:00.000Z" });
      expect(await store.read()).toEqual(newer);
    } finally {
      await database.close();
    }
  });
  it.each(["success-first", "failure-first"])(
    "merges independent refreshes when %s completes",
    async (order) => {
      const database = new PGlite();
      try {
        await database.exec(
          "CREATE TABLE public.recent_updates_snapshot(id text PRIMARY KEY, snapshot jsonb NOT NULL)",
        );
        const store = createPostgresRecentUpdatesStore({
          query: async (sql, values) => database.query(sql, values),
        });
        const oldTime = new Date(NOW.getTime() - 86400000);
        const latestTime = new Date(NOW.getTime() + 60000);
        await createRecentUpdatesService({
          store,
          now: () => oldTime,
          fetchImpl: async () =>
            new Response(
              rss(
                entry(
                  "Police investigate old report",
                  `${ARTICLE_URL}old`,
                  oldTime.toUTCString(),
                ),
              ),
            ),
        }).refresh();
        let finishSuccess!: (response: Response) => void;
        let finishFailure!: (error: Error) => void;
        let startedSuccess!: () => void;
        let startedFailure!: () => void;
        const successStarted = new Promise<void>((resolve) => {
          startedSuccess = resolve;
        });
        const failureStarted = new Promise<void>((resolve) => {
          startedFailure = resolve;
        });
        const success = createRecentUpdatesService({
          store,
          now: () => NOW,
          fetchImpl: async () => {
            startedSuccess();
            return new Promise<Response>((resolve) => {
              finishSuccess = resolve;
            });
          },
        });
        const failure = createRecentUpdatesService({
          store,
          now: () => latestTime,
          fetchImpl: async () => {
            startedFailure();
            return new Promise<Response>((_resolve, reject) => {
              finishFailure = reject;
            });
          },
        });
        const goodResult = success.refresh();
        await successStarted;
        const badResult = failure.refresh();
        await failureStarted;
        let finalResult: RecentUpdatesSnapshot;
        if (order === "success-first") {
          finishSuccess(new Response(rss()));
          await goodResult;
          finishFailure(new Error("source unavailable"));
          finalResult = await badResult;
        } else {
          finishFailure(new Error("source unavailable"));
          await badResult;
          finishSuccess(new Response(rss()));
          finalResult = await goodResult;
        }
        const persisted = await store.read();
        expect(persisted).toEqual(finalResult);
        expect(finalResult).toMatchObject({
          status: "stale",
          checkedAt: latestTime.toISOString(),
          sources: [
            {
              status: "failed",
              lastCheckedAt: latestTime.toISOString(),
              lastSuccessAt: NOW.toISOString(),
            },
          ],
        });
        expect(finalResult.items).toHaveLength(1);
        expect(finalResult.items[0].title).toBe(
          "Police investigate Camden assault",
        );
      } finally {
        await database.close();
      }
    },
  );
  it("uses parameterized monotonic snapshot writes", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [],
    }));
    const store = createPostgresRecentUpdatesStore({ query });
    const value: RecentUpdatesSnapshot = {
      ...emptyRecentUpdates(),
      checkedAt: NOW.toISOString(),
    };
    await store.write(value);
    expect(query.mock.calls[0][0]).toContain("$1::jsonb");
    expect(query.mock.calls[0][0]).toContain("AS successful");
    expect(await store.read()).toBeNull();
    await store.close();
  });
});

describe("recent news storage RLS", () => {
  it("rejects browser roles and the table owner, but permits the runtime member", async () => {
    const database = new PGlite();
    try {
      await database.exec(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN NOBYPASSRLS;
        CREATE ROLE news_test_owner NOLOGIN NOBYPASSRLS;
        CREATE ROLE news_test_member NOLOGIN NOBYPASSRLS;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      `);
      await database.exec(
        await readFile(
          new URL(
            "../supabase/migrations/20260912144528_recent_updates_snapshot.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await database.exec(
        "GRANT streetwise_updates_runtime TO news_test_member; ALTER TABLE public.recent_updates_snapshot OWNER TO news_test_owner",
      );
      for (const role of ["anon", "authenticated", "service_role"]) {
        await database.exec(`SET ROLE ${role}`);
        await expect(
          database.query("SELECT * FROM public.recent_updates_snapshot"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          database.query(
            "INSERT INTO public.recent_updates_snapshot VALUES ('latest', $1)",
            [
              JSON.stringify({
                ...emptyRecentUpdates(),
                checkedAt: NOW.toISOString(),
              }),
            ],
          ),
        ).rejects.toThrow(/permission denied/);
        await database.exec("RESET ROLE");
      }
      await database.exec("SET ROLE news_test_member");
      const store = createPostgresRecentUpdatesStore({
        query: async (sql, values) => database.query(sql, values),
      });
      for (const malformed of [
        {},
        { schemaVersion: "1.0" },
        { checkedAt: NOW.toISOString() },
        { schemaVersion: null, checkedAt: NOW.toISOString() },
        { schemaVersion: "1.0", checkedAt: null },
      ]) {
        await expect(
          database.query(
            "INSERT INTO public.recent_updates_snapshot VALUES ('latest', $1)",
            [JSON.stringify(malformed)],
          ),
        ).rejects.toThrow(/check constraint/);
      }
      const first = {
        ...emptyRecentUpdates(),
        checkedAt: "2026-09-11T16:00:00.000Z",
      };
      const next = { ...first, checkedAt: NOW.toISOString() };
      await store.write(first);
      await store.write(next);
      expect(await store.read()).toEqual(next);
      await expect(
        database.query(
          "INSERT INTO public.recent_updates_snapshot VALUES ('other', $1)",
          [JSON.stringify(next)],
        ),
      ).rejects.toThrow();
      await expect(
        database.query("DELETE FROM public.recent_updates_snapshot"),
      ).rejects.toThrow(/permission denied/);
      await database.exec("RESET ROLE; SET ROLE news_test_owner");
      expect(
        (await database.query("SELECT * FROM public.recent_updates_snapshot"))
          .rows,
      ).toEqual([]);
      await expect(
        database.query(
          "INSERT INTO public.recent_updates_snapshot VALUES ('latest', $1)",
          [JSON.stringify(next)],
        ),
      ).rejects.toThrow(/row-level security/);
      await database.exec("RESET ROLE");
    } finally {
      await database.close();
    }
  });
});
