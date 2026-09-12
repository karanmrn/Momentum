import { describe, expect, it } from "vitest";
import { createDemoState } from "../../packages/domain/index";
import {
  defaultSettings,
  savePersonalSettings,
  readPersonalSettings,
  relevantNotices,
  withinWindow,
  queuePersonalUpdates,
  dispatchPersonalUpdates,
  personalInbox,
  deletePersonalSettings,
  exportPersonalSettings,
  followCatalog,
  type PersonalizationHost,
  type Settings,
  type Contexts,
} from "../../packages/personalization/index";
const now = new Date("2026-09-12T20:00:00Z");
function setup() {
  return createDemoState(now) as PersonalizationHost;
}
function save(
  state: PersonalizationHost,
  settings: Partial<Settings>,
  actor: "alex" | "sam" = "alex",
) {
  const current = readPersonalSettings(state, actor);
  return savePersonalSettings(
    state,
    actor,
    {
      expectedRevision: current.revision,
      settings: { ...current.settings, ...settings },
    },
    now,
  );
}
describe("Explicit time preferences", () => {
  it("uses the window start day for an overnight window", () => {
    const w = { days: [5], start: "22:00", end: "02:00" };
    expect(withinWindow(new Date("2026-09-11T21:00:00Z"), w)).toBe(true);
    expect(withinWindow(new Date("2026-09-12T00:59:00Z"), w)).toBe(true);
    expect(withinWindow(new Date("2026-09-12T01:00:00Z"), w)).toBe(false);
    expect(withinWindow(new Date("2026-09-12T21:00:00Z"), w)).toBe(false);
  });
  it("handles both autumn clock instances and the spring skipped hour", () => {
    const w = { days: [0], start: "01:00", end: "02:00" };
    expect(withinWindow(new Date("2026-10-25T00:30:00Z"), w)).toBe(true);
    expect(withinWindow(new Date("2026-10-25T01:30:00Z"), w)).toBe(true);
    expect(withinWindow(new Date("2026-10-25T02:00:00Z"), w)).toBe(false);
    expect(withinWindow(new Date("2026-03-29T01:30:00Z"), w)).toBe(false);
  });
  it("rejects ambiguous all-day windows, duplicate days, and unsupported time zones", () => {
    const state = setup();
    expect(() =>
      save(state, { quietHours: { days: [0], start: "01:00", end: "01:00" } }),
    ).toThrow();
    expect(() =>
      save(state, {
        quietHours: { days: [0, 0], start: "01:00", end: "02:00" },
      }),
    ).toThrow();
    expect(() => save(state, { timeZone: "UTC" as "Europe/London" })).toThrow();
  });
});
describe("Scope, evidence, and ordering", () => {
  it("isolates persona choices and gives accurate reasons", () => {
    const state = setup();
    expect(
      relevantNotices(state, "alex", now).map((r) => r.notice.pilotId),
    ).toEqual(["hounslow_town_centre"]);
    expect(
      relevantNotices(state, "sam", now).map((r) => r.notice.pilotId),
    ).toEqual(["west_croydon"]);
    save(state, { areas: ["camden_town"], categories: ["access"] });
    expect(relevantNotices(state, "alex", now)[0].reasons).toContain(
      "You follow this area.",
    );
    expect(readPersonalSettings(state, "sam").revision).toBe(1);
    expect(() => readPersonalSettings(state, "moderator")).toThrow("member");
  });
  it("matches a checked station only when the source supplies that reference", () => {
    const state = setup(),
      station = followCatalog.find(
        (t) => t.pilotId === "camden_town" && t.kind === "station",
      )!;
    save(state, { areas: [], follows: [station.id], categories: ["access"] });
    expect(relevantNotices(state, "alex", now)).toEqual([]);
    const notice = state.notices.find((n) => n.pilotId === "camden_town")!;
    const result = relevantNotices(state, "alex", now, {
      [notice.id]: { referenceIds: [station.id] },
    });
    expect(result[0].reasonCodes).toContain("follows_station");
    expect(() => save(state, { follows: ["station:INVENTED"] })).toThrow();
  });
  it("matches exact candidate place labels without pretending candidate zones are reviewed", () => {
    const state = setup();
    save(state, {
      areas: [],
      follows: ["place:hounslow_town_centre:approach"],
    });
    expect(relevantNotices(state, "alex", now)[0].reasons.join(" ")).toContain(
      "candidate location",
    );
    save(state, { follows: ["zone:hounslow_town_centre:centre"] });
    expect(relevantNotices(state, "alex", now)).toEqual([]);
  });
  it("orders explicit source tags without inferring access, language, or vulnerability", () => {
    const state = setup();
    save(state, {
      areas: ["camden_town", "hounslow_town_centre", "west_croydon"],
      categories: ["access", "transport", "infrastructure"],
      access: ["step_free"],
      transportModes: ["rail"],
      language: "fr",
    });
    const camden = state.notices[1];
    const contexts: Contexts = {
      [camden.id]: {
        access: ["step_free"],
        transportModes: ["rail"],
        language: "fr",
      },
    };
    const result = relevantNotices(state, "alex", now, contexts);
    expect(result[0].notice.id).toBe(camden.id);
    expect(result[0].reasonCodes).toEqual(
      expect.arrayContaining([
        "selected_access_updates",
        "selected_transport_mode",
        "preferred_content_language",
      ]),
    );
    expect(
      relevantNotices(state, "alex", now).every(
        (row) => !row.reasonCodes.includes("selected_access_updates"),
      ),
    ).toBe(true);
  });
  it("rejects stale, future, restricted, or insufficient evidence without all-clear claims", () => {
    const state = setup(),
      id = state.notices[0].id;
    expect(
      relevantNotices(state, "alex", now, { [id]: { sourceCurrent: false } }),
    ).toEqual([]);
    expect(
      relevantNotices(state, "alex", now, {
        [id]: { validFrom: "2027-01-01T00:00:00Z" },
      }),
    ).toEqual([]);
    expect(
      relevantNotices(state, "alex", new Date("2026-09-15T20:00:00Z")),
    ).toEqual([]);
    state.notices[0].evidence = [];
    expect(relevantNotices(state, "alex", now)).toEqual([]);
  });
  it("rejects stale writes and never exports another persona or raw reports", () => {
    const state = setup();
    save(state, { language: "pl" });
    expect(() =>
      savePersonalSettings(state, "alex", {
        expectedRevision: 1,
        settings: defaultSettings(state, "alex"),
      }),
    ).toThrow("changed");
    state.reports[0].description = "PRIVATE_REPORT_SENTINEL";
    const exported = JSON.stringify(exportPersonalSettings(state, "alex"));
    expect(exported).not.toContain("PRIVATE_REPORT_SENTINEL");
    expect(exported).not.toContain("sam");
    expect(exported).not.toContain("owner");
  });
});
describe("In-app delivery lifecycle", () => {
  it("deduplicates queue/dispatch and makes no external send", async () => {
    const state = setup();
    queuePersonalUpdates(state, "alex", now);
    queuePersonalUpdates(state, "alex", now);
    let delivered = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      delivered++;
    });
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      delivered++;
    });
    expect(delivered).toBe(1);
    expect(personalInbox(state, "alex")).toHaveLength(1);
    expect(personalInbox(state, "sam")).toEqual([]);
  });
  it("suppresses an unsubscribed update after enqueue", async () => {
    const state = setup();
    queuePersonalUpdates(state, "alex", now);
    save(state, { areas: [], follows: [] });
    let calls = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
    expect(personalInbox(state, "alex")[0].state).toBe("suppressed");
  });
  it("defers quiet-hour delivery and suppresses expiry without resolving a notice", async () => {
    const state = setup();
    save(state, { quietHours: { days: [6], start: "20:00", end: "23:00" } });
    await dispatchPersonalUpdates(state, "alex", now);
    expect(personalInbox(state, "alex")[0].reason).toBe("quiet_hours");
    const end = new Date("2026-09-15T20:00:00Z");
    await dispatchPersonalUpdates(state, "alex", end);
    expect(personalInbox(state, "alex")[0].state).toBe("suppressed");
    expect(state.notices[0].status).toBe("active");
  });
  it("suppresses older revisions and sends corrections to prior recipients after unfollow", async () => {
    const state = setup();
    await dispatchPersonalUpdates(state, "alex", now);
    save(state, { areas: [], categories: [] });
    state.notices[0].status = "retracted";
    state.notices[0].revision = 2;
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 1000),
    );
    const correction = personalInbox(state, "alex").find(
      (i) => i.kind === "correction",
    );
    expect(correction?.state).toBe("delivered");
    expect(correction?.message).not.toContain(state.notices[0].summary);
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 2000),
    );
    expect(personalInbox(state, "alex")).toHaveLength(2);
  });
  it("delivers active corrections once to former recipients without duplicate normal alerts", async () => {
    const state = setup();
    await dispatchPersonalUpdates(state, "alex", now);
    save(state, { areas: [], categories: [] });
    state.notices[0].revision = 2;
    state.notices[0].summary = "Corrected private fixture";
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 1000),
    );
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 2000),
    );
    expect(
      personalInbox(state, "alex").map((i) => [
        i.kind,
        i.noticeRevision,
        i.state,
      ]),
    ).toEqual([
      ["notice", 1, "delivered"],
      ["correction", 2, "delivered"],
    ]);
    expect(JSON.stringify(personalInbox(state, "alex"))).not.toContain(
      "Corrected private fixture",
    );
  });
  it("never delivers an old notice after a retraction before dispatch", async () => {
    const state = setup();
    queuePersonalUpdates(state, "alex", now);
    state.notices[0].status = "retracted";
    state.notices[0].revision = 2;
    let calls = 0;
    await dispatchPersonalUpdates(state, "alex", now, {}, () => {
      calls++;
    });
    expect(calls).toBe(0);
    expect(personalInbox(state, "alex")).toHaveLength(1);
  });
  it("bounds failure attempts, respects retry delay, and retains attempted/failed history", async () => {
    const state = setup();
    const fail = () => {
      throw Error("private provider error must not appear");
    };
    await dispatchPersonalUpdates(state, "alex", now, {}, fail);
    expect(personalInbox(state, "alex")[0].state).toBe("failed");
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 1000),
      {},
      fail,
    );
    expect(personalInbox(state, "alex")[0].attempts).toBe(1);
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 5000),
      {},
      fail,
    );
    await dispatchPersonalUpdates(
      state,
      "alex",
      new Date(now.getTime() + 15000),
      {},
      fail,
    );
    const item = personalInbox(state, "alex")[0];
    expect(item.attempts).toBe(3);
    expect(item.reason).toBe("retry_exhausted");
    expect(item.history).toHaveLength(6);
    expect(JSON.stringify(item)).not.toContain("private provider");
  });
  it("deletion removes only the current member choices and queue, and prevents implicit reseeding", async () => {
    const state = setup();
    await dispatchPersonalUpdates(state, "alex", now);
    save(state, { language: "fr" }, "sam");
    deletePersonalSettings(state, "alex", { expectedRevision: 1 });
    expect(personalInbox(state, "alex")).toEqual([]);
    expect(readPersonalSettings(state, "alex").deleted).toBe(true);
    expect(readPersonalSettings(state, "sam").settings.language).toBe("fr");
    await dispatchPersonalUpdates(state, "alex", now);
    expect(personalInbox(state, "alex")).toEqual([]);
  });
  it("historical digest opt-in never places historical counts in current delivery", () => {
    const state = setup();
    save(state, { historicalDigest: true, areas: [], categories: [] });
    expect(queuePersonalUpdates(state, "alex", now)).toEqual([]);
  });
});
