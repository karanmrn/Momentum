import { z } from "zod";
import { pilotSchema } from "../contracts/index.js";

const timestamp = z.string().datetime();
const bbcUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["www.bbc.co.uk", "www.bbc.com"].includes(url.hostname) &&
      url.pathname.startsWith("/news/")
    );
  }, "Use a BBC News source URL.");
export const recentUpdateSchema = z.object({
  id: z.string().min(1).max(200),
  sourceId: z.literal("bbc_london"),
  sourceKind: z.literal("news"),
  title: z.string().trim().min(1).max(300),
  url: bbcUrl,
  publishedAt: timestamp,
  occurredAt: z.null(),
  areaIds: z.array(pilotSchema).max(3),
  scope: z.enum(["borough", "london"]),
  scopeLabel: z.string().min(1).max(120),
});
export const recentUpdatesSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0"),
  checkedAt: timestamp.nullable(),
  sources: z
    .array(
      z.object({
        id: z.literal("bbc_london"),
        name: z.literal("BBC News London"),
        url: z.literal("https://feeds.bbci.co.uk/news/england/london/rss.xml"),
        status: z.enum(["success", "failed", "not_checked"]),
        lastCheckedAt: timestamp.nullable(),
        lastSuccessAt: timestamp.nullable(),
      }),
    )
    .max(1),
  items: z.array(recentUpdateSchema).max(100),
  status: z.enum(["current", "stale", "unavailable"]),
});
export type RecentUpdate = z.infer<typeof recentUpdateSchema>;
export type RecentUpdatesSnapshot = z.infer<typeof recentUpdatesSnapshotSchema>;
