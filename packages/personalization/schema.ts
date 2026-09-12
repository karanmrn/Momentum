import { z } from "zod";
import { categorySchema, pilotSchema } from "../contracts/index.js";
import { followCatalog } from "./catalog.js";
const revision = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER - 1);
const unique = <T>(items: T[]) => new Set(items).size === items.length;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const windowSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(unique),
    start: clock,
    end: clock,
  })
  .strict()
  .refine((w) => w.start !== w.end, "Choose different start and end times.");
export const settingsSchema = z
  .object({
    areas: z.array(pilotSchema).max(3).refine(unique),
    follows: z
      .array(z.string().refine((id) => followCatalog.some((t) => t.id === id)))
      .max(30)
      .refine(unique),
    categories: z.array(categorySchema).max(4).refine(unique),
    access: z
      .array(
        z.enum([
          "step_free",
          "lighting",
          "wayfinding",
          "accessible_facilities",
        ]),
      )
      .max(4)
      .refine(unique),
    transportModes: z
      .array(z.enum(["walking", "bus", "rail", "tube", "tram", "cycling"]))
      .max(6)
      .refine(unique),
    language: z.enum(["en", "fr", "es", "pl", "pa", "hi", "ur", "other"]),
    timeZone: z.literal("Europe/London"),
    travelWindow: windowSchema.nullable(),
    quietHours: windowSchema.nullable(),
    mutedNoticeIds: z.array(z.string().uuid()).max(100).refine(unique),
    paused: z.boolean(),
    inAppEnabled: z.boolean(),
    historicalDigest: z.boolean(),
  })
  .strict();
export const settingsInputSchema = z
  .object({ expectedRevision: revision, settings: settingsSchema })
  .strict();
export const revisionInputSchema = z
  .object({ expectedRevision: revision })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export type TimeWindow = z.infer<typeof windowSchema>;
export const preferenceRecordSchema = z
  .object({ revision, settings: settingsSchema, deleted: z.boolean() })
  .strict();
export type PreferenceRecord = z.infer<typeof preferenceRecordSchema>;
export const deliverySchema = z
  .object({
    id: z.string().min(1).max(160),
    noticeId: z.string().uuid(),
    noticeRevision: revision,
    kind: z.enum(["notice", "correction"]),
    channel: z.literal("in_app"),
    state: z.enum(["queued", "attempted", "delivered", "failed", "suppressed"]),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    nextAttemptAt: z.string().datetime().nullable(),
    attempts: z.number().int().min(0).max(3),
    reason: z.enum([
      "queued",
      "delivered",
      "delivery_failed",
      "retry_exhausted",
      "expired",
      "settings_changed",
      "notice_changed",
      "quiet_hours",
      "paused",
    ]),
    history: z
      .array(
        z
          .object({
            at: z.string().datetime(),
            state: z.enum(["attempted", "failed", "delivered"]),
          })
          .strict(),
      )
      .max(6),
    message: z.string().max(100),
  })
  .strict();
export type Delivery = z.infer<typeof deliverySchema>;
export const personalizationStateSchema = z
  .object({
    version: z.literal("1.0"),
    members: z
      .object({ alex: preferenceRecordSchema, sam: preferenceRecordSchema })
      .strict(),
    outbox: z
      .object({
        alex: z.array(deliverySchema).max(300),
        sam: z.array(deliverySchema).max(300),
      })
      .strict(),
  })
  .strict();
export type PersonalizationState = z.infer<typeof personalizationStateSchema>;
