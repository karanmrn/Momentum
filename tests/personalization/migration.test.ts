import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDemoState } from "../../packages/domain";
import {
  readPersonalSettings,
  savePersonalSettings,
  personalInbox,
  dispatchPersonalUpdates,
  deletePersonalSettings,
  type PersonalizationHost,
} from "../../packages/personalization";
const now = new Date("2026-09-12T20:00:00Z");
const fresh = () => createDemoState(now) as PersonalizationHost;
function activate(
  state: PersonalizationHost,
  changes: Record<string, unknown> = {},
) {
  const current = readPersonalSettings(state, "alex");
  savePersonalSettings(
    state,
    "alex",
    {
      expectedRevision: current.revision,
      settings: { ...current.settings, ...changes },
    },
    now,
  );
}
describe("Legacy inbox activation", () => {
  it("preserves delivered receipts, recipient isolation, known time, and no invented attempts", async () => {
    const state = fresh(),
      old = state.notifications.find((n) => n.recipient === "alex")!;
    old.message = "PRIVATE_LEGACY_CONTENT_SENTINEL";
    const original = structuredClone(state.notifications);
    activate(state);
    const item = personalInbox(state, "alex")[0];
    expect(item.id).toBe(`${old.noticeId}:${old.revision}:${old.kind}:in_app`);
    expect(item.state).toBe("delivered");
    expect(item.createdAt).toBe(old.createdAt);
    expect(item.attempts).toBe(0);
    expect(item.history).toEqual([]);
    expect(JSON.stringify(personalInbox(state, "alex"))).not.toContain(
      "PRIVATE_LEGACY_CONTENT_SENTINEL",
    );
    expect(personalInbox(state, "sam")[0].noticeId).not.toBe(old.noticeId);
    let sends = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      sends++;
    });
    expect(sends).toBe(0);
    expect(state.notifications).toEqual(original);
  });
  it("delivers a later correction to a migrated prior recipient after unfollow", async () => {
    const state = fresh(),
      id = state.notifications.find((n) => n.recipient === "alex")!.noticeId;
    activate(state, { areas: [], categories: [] });
    const notice = state.notices.find((n) => n.id === id)!;
    notice.revision++;
    notice.status = "retracted";
    await dispatchPersonalUpdates(state, "alex", now);
    expect(
      personalInbox(state, "alex").map((n) => [
        n.kind,
        n.noticeRevision,
        n.state,
      ]),
    ).toEqual([
      ["notice", 1, "delivered"],
      ["correction", 2, "delivered"],
    ]);
    await dispatchPersonalUpdates(state, "alex", now);
    activate(state, { areas: [], categories: [] });
    expect(personalInbox(state, "alex")).toHaveLength(2);
  });
  it("deduplicates stable event keys and never reopens a delivered event", async () => {
    const state = fresh(),
      receipt = state.notifications[0];
    state.notifications.push(
      { ...receipt, id: randomUUID(), state: "queued" },
      { ...receipt, id: randomUUID(), state: "delivered" },
    );
    activate(state);
    expect(personalInbox(state, "alex")).toHaveLength(1);
    expect(personalInbox(state, "alex")[0].state).toBe("delivered");
    let calls = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
  it("keeps queued source expiry and suppresses stale source data at dispatch", async () => {
    const state = fresh(),
      receipt = state.notifications[0];
    receipt.state = "queued";
    const notice = state.notices.find((n) => n.id === receipt.noticeId)!;
    notice.observedAt = "2026-09-01T12:00:00Z";
    const pending = personalInbox(state, "alex")[0];
    expect(pending.expiresAt).toBe("2026-09-03T12:00:00.000Z");
    let calls = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
    expect(personalInbox(state, "alex")[0].state).toBe("suppressed");
  });
  it("checks current settings and revisions for migrated queue entries", async () => {
    const state = fresh();
    state.notifications[0].state = "queued";
    activate(state, { inAppEnabled: false });
    let calls = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
    const revised = fresh();
    revised.notifications[0].state = "queued";
    const id = revised.notifications[0].noticeId;
    revised.notices.find((n) => n.id === id)!.status = "retracted";
    revised.notices.find((n) => n.id === id)!.revision++;
    await dispatchPersonalUpdates(revised, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
    expect(personalInbox(revised, "alex")[0].reason).toBe("notice_changed");
  });
  it("retains missing-source terminal receipts and suppresses missing-source queued delivery", () => {
    const state = fresh(),
      receipt = state.notifications[0];
    state.notices = state.notices.filter((n) => n.id !== receipt.noticeId);
    activate(state);
    const terminal = personalInbox(state, "alex")[0];
    expect(terminal.state).toBe("delivered");
    expect(terminal.createdAt).toBe(receipt.createdAt);
    expect(terminal.expiresAt).toBe(receipt.createdAt);
    const pending = fresh();
    pending.notifications[0].state = "queued";
    pending.notices = [];
    expect(personalInbox(pending, "alex")[0].state).toBe("suppressed");
  });
  it("does not restart attempts when legacy failure history is unavailable", async () => {
    const state = fresh();
    state.notifications[0].state = "failed";
    activate(state);
    let calls = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
    expect(personalInbox(state, "alex")[0].state).toBe("suppressed");
  });
  it("does not import old receipts again after explicit deletion", async () => {
    const state = fresh();
    activate(state);
    deletePersonalSettings(state, "alex", { expectedRevision: 2 });
    await dispatchPersonalUpdates(state, "alex", now);
    expect(personalInbox(state, "alex")).toEqual([]);
    expect(readPersonalSettings(state, "alex").deleted).toBe(true);
  });
  it("fails before changing data if distinct legacy receipts exceed the bounded inbox", () => {
    const state = fresh(),
      receipt = state.notifications[0];
    state.notifications = Array.from({ length: 301 }, (_, i) => ({
      ...receipt,
      id: randomUUID(),
      revision: i + 1,
    }));
    expect(() => activate(state)).toThrow("migration limit");
    expect(state.personalization).toBeUndefined();
    expect(state.notifications).toHaveLength(301);
  });
});
