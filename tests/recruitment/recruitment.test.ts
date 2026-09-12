import { describe, expect, it } from "vitest";
import {
  compareResearchCoverage,
  createRecruitmentDemo,
  directoryEntries,
  listRecruitmentDirectory,
  MAX_OBSERVATIONS,
  observationInputSchema,
  observationsForOwner,
  submitResearchObservation,
  withdrawResearchObservation,
  type ResearchObservationInput,
} from "../../packages/recruitment/index.js";
const now = "2026-09-12T18:00:00.000Z";
const input: ResearchObservationInput = {
  pilotId: "hounslow_town_centre",
  landmarkId: "hounslow_high_street",
  recruitmentEntryId: "hounslow_town_centre_join",
  observedDate: "2026-09-12",
  comfortFactors: ["lighting"],
  behavior: "continued",
  timeWindow: "evening",
  fictional: true,
  consent: {
    version: "research-demo-v1",
    participation: true,
    aggregate: true,
  },
  idempotencyKey: "key-1",
};
const submit = () =>
  submitResearchObservation(createRecruitmentDemo(), "alex", input, {
    id: "observation-1",
    now,
  });
describe("fictional research boundaries", () => {
  it("validates consent, geography, dates, bounded structured fields and unknown private fields", () => {
    for (const change of [
      { fictional: false },
      { pilotId: "westminster" },
      { landmarkId: "croydon_interchange" },
      { recruitmentEntryId: "west_croydon_join" },
      { observedDate: "2026-02-30" },
      { comfortFactors: ["lighting", "lighting"] },
      { phone: "private" },
      {
        consent: {
          version: "research-demo-v1",
          participation: false,
          aggregate: true,
        },
      },
    ]) {
      expect(
        observationInputSchema.safeParse({ ...input, ...change }).success,
      ).toBe(false);
    }
    expect(() =>
      submitResearchObservation(
        createRecruitmentDemo(),
        "alex",
        { ...input, observedDate: "2026-09-13" },
        { id: "future", now },
      ),
    ).toThrow();
  });
  it("isolates owners and rejects moderator submissions", () => {
    const state = submit();
    expect(observationsForOwner(state, "sam")).toEqual([]);
    expect(() => observationsForOwner(state, "moderator")).toThrow();
    expect(() =>
      withdrawResearchObservation(
        state,
        "sam",
        { id: "observation-1", expectedRevision: 1 },
        now,
      ),
    ).toThrow();
    expect(() =>
      submitResearchObservation(state, "moderator", input, { id: "x", now }),
    ).toThrow();
  });
  it("does not mutate input state or return aliases", () => {
    const initial = createRecruitmentDemo();
    const next = submitResearchObservation(initial, "alex", input, {
      id: "observation-1",
      now,
    });
    expect(initial.observations).toEqual([]);
    observationsForOwner(next, "alex").pop();
    expect(next.observations).toHaveLength(1);
  });
  it("replays one identical submission and rejects changed input", () => {
    const state = submit();
    expect(
      submitResearchObservation(state, "alex", input, { id: "ignored", now }),
    ).toEqual(state);
    expect(() =>
      submitResearchObservation(
        state,
        "alex",
        { ...input, behavior: "paused" },
        { id: "ignored", now },
      ),
    ).toThrow();
  });
  it("withdraws to a minimal tombstone and prevents replay restoration", () => {
    const state = submit();
    expect(() =>
      withdrawResearchObservation(
        state,
        "alex",
        { id: "observation-1", expectedRevision: 2 },
        now,
      ),
    ).toThrow();
    const next = withdrawResearchObservation(
      state,
      "alex",
      { id: "observation-1", expectedRevision: 1 },
      now,
    );
    expect(next.observations[0]).toEqual({
      id: "observation-1",
      owner: "alex",
      revision: 2,
      status: "withdrawn",
      fictional: true,
      withdrawnAt: now,
    });
    expect(JSON.stringify(next)).not.toContain("lighting");
    expect(JSON.stringify(next)).not.toContain("hounslow");
    expect(() =>
      submitResearchObservation(next, "alex", input, { id: "new-id", now }),
    ).toThrow();
    expect(state.observations[0].status).toBe("active");
  });
  it("suppresses small cohorts and removes withdrawn or non-consenting answers", () => {
    let state = createRecruitmentDemo();
    for (let i = 0; i < 3; i++)
      state = submitResearchObservation(
        state,
        "alex",
        { ...input, idempotencyKey: `key-${i}` },
        { id: `item-${i}`, now },
      );
    expect(compareResearchCoverage(state, now).map((row) => row.count)).toEqual(
      [3, null, null],
    );
    expect(
      compareResearchCoverage(state, now).every(
        (row) => row.comparisonStatus === "insufficient_comparable_data",
      ),
    ).toBe(true);
    state = withdrawResearchObservation(
      state,
      "alex",
      { id: "item-0", expectedRevision: 1 },
      now,
    );
    state = submitResearchObservation(
      state,
      "alex",
      {
        ...input,
        idempotencyKey: "private",
        consent: { ...input.consent, aggregate: false },
      },
      { id: "private", now },
    );
    expect(compareResearchCoverage(state, now).map((row) => row.count)).toEqual(
      [null, null, null],
    );
    expect(
      compareResearchCoverage(state, "2026-09-11T18:00:00.000Z").every(
        (row) => row.count === null,
      ),
    ).toBe(true);
  });
  it("bounds submissions and preserves withdrawal tombstones", () => {
    let state = createRecruitmentDemo();
    for (let i = 0; i < MAX_OBSERVATIONS; i++)
      state = submitResearchObservation(
        state,
        "alex",
        { ...input, idempotencyKey: `key-${i}` },
        { id: `item-${i}`, now },
      );
    state = withdrawResearchObservation(
      state,
      "alex",
      { id: "item-0", expectedRevision: 1 },
      now,
    );
    expect(() =>
      submitResearchObservation(
        state,
        "alex",
        { ...input, idempotencyKey: "overflow" },
        { id: "overflow", now },
      ),
    ).toThrow(/limit/);
  });
  it("retains access kinds without contact URLs and marks fixture expiry", () => {
    expect(directoryEntries).toHaveLength(15);
    const entries = listRecruitmentDirectory("camden_town", now);
    expect(entries.map((item) => item.accessKind)).toEqual([
      "join",
      "request",
      "channel",
      "legacy",
      "gateway",
    ]);
    expect(
      entries.every(
        (item) => item.fictional && item.permissionStatus === "not_requested",
      ),
    ).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/https?:|@|phone/);
    expect(
      listRecruitmentDirectory("camden_town", "2026-11-01T00:00:00.000Z").every(
        (item) => item.freshness === "expired",
      ),
    ).toBe(true);
  });
});
