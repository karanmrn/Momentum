import { createHash } from "node:crypto";
import {
  recentUpdatesSnapshotSchema,
  type RecentUpdatesSnapshot,
} from "../packages/recent-updates/index.js";
import type { PilotId } from "../packages/contracts/index.js";

export const RECENT_UPDATES_FEED =
  "https://feeds.bbci.co.uk/news/england/london/rss.xml";
export const RECENT_UPDATES_MAX_BYTES = 512_000;
export const RECENT_UPDATES_STALE_MS = 36 * 60 * 60 * 1000;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export interface RecentUpdatesStore {
  read(): Promise<unknown | null>;
  write(snapshot: RecentUpdatesSnapshot): Promise<void>;
}
const source = {
  id: "bbc_london" as const,
  name: "BBC News London",
  url: RECENT_UPDATES_FEED,
  kind: "news" as const,
};
export function emptyRecentUpdates(): RecentUpdatesSnapshot {
  return recentUpdatesSnapshotSchema.parse({
    schemaVersion: "1.0",
    checkedAt: null,
    status: "unavailable",
    items: [],
    sources: [
      {
        ...source,
        status: "not_checked",
        lastCheckedAt: null,
        lastSuccessAt: null,
      },
    ],
  });
}
function text(xml: string): string {
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, value: string) => {
      const point = value.toLowerCase().startsWith("x")
        ? parseInt(value.slice(1), 16)
        : Number(value);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, value: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[value]!,
    )
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function field(item: string, tag: string): string {
  const matches = [
    ...item.matchAll(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g"),
    ),
  ];
  return matches.length === 1 ? text(matches[0][1]) : "";
}
function articleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["www.bbc.co.uk", "www.bbc.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/news\/(?:articles\/[a-z0-9]+|[a-z][a-z0-9-]*-\d+)\/?$/.test(
        url.pathname,
      )
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
/** Parse only bounded RSS2 fields from the fixed BBC source; never resolve XML entities or URLs. */
export function parseRecentUpdatesRss(
  xml: string,
  now: Date,
): RecentUpdatesSnapshot["items"] {
  if (
    Buffer.byteLength(xml) > RECENT_UPDATES_MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<rss\b/.test(xml) ||
    !/<\/channel>\s*<\/rss>\s*$/.test(xml)
  )
    throw new Error("Invalid news feed");
  const matches = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)];
  if (
    matches.length > 200 ||
    (xml.match(/<item(?:\s|>)/g) ?? []).length !== matches.length
  )
    throw new Error("Invalid news feed");
  const rows: RecentUpdatesSnapshot["items"] = [];
  const seen = new Set<string>();
  for (const [, item] of matches) {
    const title = field(item, "title");
    const url = articleUrl(field(item, "link"));
    const published = Date.parse(field(item, "pubDate"));
    if (
      !title ||
      title.length > 300 ||
      !url ||
      seen.has(url) ||
      !Number.isFinite(published) ||
      published > now.getTime() ||
      published < now.getTime() - WINDOW_MS
    )
      continue;
    if (
      !/\b(crime|police|murder|kill(?:ed|ing|ings)?|stab(?:bed|bing|bings)?|assault|attack(?:ed|s)?|robber(?:y|ies)|theft|stolen|burglary|harass(?:ment|ed)|violence|violent|safety|unsafe|fire|arson|crash|collision|antisocial|anti-social)\b/i.test(
        title,
      )
    )
      continue;
    const areaIds: PilotId[] = [];
    const boroughs: string[] = [];
    for (const [pattern, area, label] of [
      [/\bhounslow\b/i, "hounslow_town_centre", "Hounslow"],
      [/\bcamden\b/i, "camden_town", "Camden"],
      [/\bcroydon\b/i, "west_croydon", "Croydon"],
    ] as const) {
      if (pattern.test(title)) {
        areaIds.push(area);
        boroughs.push(label);
      }
    }
    seen.add(url);
    rows.push({
      id: createHash("sha256").update(url).digest("hex"),
      sourceId: "bbc_london",
      sourceKind: "news",
      title,
      url,
      publishedAt: new Date(published).toISOString(),
      occurredAt: null,
      areaIds,
      scope: areaIds.length ? "borough" : "london",
      scopeLabel: areaIds.length
        ? `${boroughs.join(", ")} borough mention; exact location unverified`
        : "London coverage; exact location unverified",
    });
  }
  return rows
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
    )
    .slice(0, 50);
}
async function fetchRss(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(RECENT_UPDATES_FEED, {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (
    !response.ok ||
    response.redirected ||
    (response.url && response.url !== RECENT_UPDATES_FEED) ||
    !response.body
  )
    throw new Error("News source unavailable");
  if (
    Number(response.headers.get("content-length")) > RECENT_UPDATES_MAX_BYTES
  ) {
    await response.body.cancel();
    throw new Error("Feed exceeds limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > RECENT_UPDATES_MAX_BYTES)
        throw new Error("Feed exceeds limit");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function createRecentUpdatesService({
  store,
  fetchImpl = fetch,
  now = () => new Date(),
}: {
  store: RecentUpdatesStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}) {
  let pending: Promise<RecentUpdatesSnapshot> | undefined;
  function project(
    snapshot: RecentUpdatesSnapshot,
    at: Date,
  ): RecentUpdatesSnapshot {
    const good = snapshot.sources[0]?.lastSuccessAt;
    const current =
      snapshot.sources[0]?.status === "success" &&
      good &&
      at.getTime() - Date.parse(good) <= RECENT_UPDATES_STALE_MS &&
      Date.parse(good) <= at.getTime();
    return recentUpdatesSnapshotSchema.parse({
      ...snapshot,
      status: current ? "current" : good ? "stale" : "unavailable",
      items: snapshot.items.filter(
        (item) =>
          Date.parse(item.publishedAt) >= at.getTime() - WINDOW_MS &&
          Date.parse(item.publishedAt) <= at.getTime(),
      ),
    });
  }
  async function read() {
    try {
      const saved = await store.read();
      return saved
        ? project(recentUpdatesSnapshotSchema.parse(saved), now())
        : emptyRecentUpdates();
    } catch {
      return emptyRecentUpdates();
    }
  }
  async function refreshOnce() {
    // A storage failure must stop refresh, since stale source state cannot be preserved safely.
    const saved = await store.read();
    const previous = saved
      ? recentUpdatesSnapshotSchema.parse(saved)
      : emptyRecentUpdates();
    const at = now();
    const checkedAt = at.toISOString();
    let next: RecentUpdatesSnapshot;
    try {
      const items = parseRecentUpdatesRss(await fetchRss(fetchImpl), at);
      next = recentUpdatesSnapshotSchema.parse({
        schemaVersion: "1.0",
        checkedAt,
        status: "current",
        items,
        sources: [
          {
            ...source,
            status: "success",
            lastCheckedAt: checkedAt,
            lastSuccessAt: checkedAt,
          },
        ],
      });
    } catch {
      next = recentUpdatesSnapshotSchema.parse({
        ...previous,
        checkedAt,
        sources: [
          {
            ...source,
            status: "failed",
            lastCheckedAt: checkedAt,
            lastSuccessAt: previous.sources[0]?.lastSuccessAt ?? null,
          },
        ],
      });
    }
    next = project(next, at);
    await store.write(next);
    // Another instance may have completed meanwhile. Return the merged stored state.
    const persisted = await store.read();
    if (!persisted) throw new Error("News snapshot persistence unavailable");
    return project(recentUpdatesSnapshotSchema.parse(persisted), now());
  }
  return {
    read,
    refresh() {
      if (!pending)
        pending = refreshOnce().finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
