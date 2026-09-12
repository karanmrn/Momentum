import { afterAll, beforeAll, expect, it } from "vitest";
import { createPrivateAccountStore } from "../../server/private-accounts-store.js";
import { followCatalog } from "../../packages/personalization/catalog.js";
import type { Settings } from "../../packages/personalization/schema.js";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
let db: Awaited<ReturnType<typeof createPrivateAccountStore>>;
beforeAll(async () => {
  db = await createPrivateAccountStore({ path: "memory://" });
});
afterAll(async () => db.close());
const basic = {
  pilotIds: ["camden_town" as const],
  categories: ["community" as const],
  paused: false,
};
const settings: Settings = {
  areas: basic.pilotIds,
  categories: basic.categories,
  paused: false,
  follows: [followCatalog[0]!.id],
  access: ["lighting"],
  transportModes: ["walking"],
  language: "fr",
  timeZone: "Europe/London",
  travelWindow: null,
  quietHours: { days: [1, 2, 3], start: "22:00", end: "07:00" },
  mutedNoticeIds: [a],
  inAppEnabled: false,
  historicalDigest: false,
};
it("persists advanced settings, isolates owners, and preserves settings on basic updates", async () => {
  const saved = await db.setFollows(a, {
    ...basic,
    settings,
    expectedRevision: 1,
  });
  expect(saved).toMatchObject({ revision: 2, settings });
  expect((await db.follows(b)).settings).toBeNull();
  await db.setFollows(a, { ...basic, paused: true });
  expect(await db.follows(a)).toMatchObject({
    revision: 3,
    settings: { ...settings, paused: true },
  });
  expect((await db.exportData(a)).follows).toMatchObject({
    settings: { language: "fr", access: ["lighting"] },
  });
});
it("rejects stale and missing revisions without overwriting settings", async () => {
  await expect(
    db.setFollows(a, { ...basic, settings, expectedRevision: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(db.setFollows(a, { ...basic, settings })).rejects.toMatchObject({
    status: 409,
  });
  expect((await db.follows(a)).revision).toBe(3);
});
it("rejects invalid settings and deletes advanced preferences", async () => {
  expect(() =>
    db.setFollows(a, {
      ...basic,
      settings: { ...settings, language: "invalid" } as unknown as Settings,
      expectedRevision: 3,
    }),
  ).toThrow();
  await db.deleteData(a);
  await expect(db.exportData(a)).rejects.toMatchObject({ status: 410 });
  expect((await db.follows(b)).revision).toBe(1);
});

it("serializes concurrent writes and accepts only one matching revision", async () => {
  const owner = "33333333-3333-4333-8333-333333333333";
  const results = await Promise.allSettled([
    db.setFollows(owner, { ...basic, settings, expectedRevision: 1 }),
    db.setFollows(owner, {
      ...basic,
      settings: { ...settings, language: "es" },
      expectedRevision: 1,
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await db.follows(owner)).revision).toBe(2);
});
