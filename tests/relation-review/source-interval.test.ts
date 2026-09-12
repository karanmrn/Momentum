import { describe, expect, it } from "vitest";
import { createDemoState, submitReport } from "../../packages/domain/index.js";
import {
  loadRelationExamples,
  generateCandidates,
  decideCandidate,
  readRelationReview,
} from "../../packages/relation-review/index.js";
import { relationPublicationSource } from "../../packages/relation-review/publication.js";
import { currentCommunityInterval } from "../../packages/relation-review/community-interval.js";
const area = "camden_town" as const;

describe("Relation publication source", () => {
  it("keeps a copy's original lineage and other-source basis", () => {
    const state = createDemoState();
    loadRelationExamples(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "load-source-test",
    );
    const original = state.reports.find(
      (row) => row.title === "Fictional lamp report A",
    )!;
    const copy = state.reports.find(
      (row) => row.title === "Fictional copied lamp account",
    )!;
    expect(relationPublicationSource(state, original)).toEqual({
      sourceKind: "community_firsthand",
      sourceFamilyId: "streetwise-fictional-relations",
      originGroupId: `${area}:original-a`,
    });
    expect(relationPublicationSource(state, copy)).toEqual({
      sourceKind: "community_other_source",
      sourceFamilyId: "streetwise-fictional-relations",
      originGroupId: `${area}:original-a`,
    });
    copy.revision++;
    copy.status = "approved_for_summary";
    expect(relationPublicationSource(state, copy)?.sourceKind).toBe(
      "community_other_source",
    );
    copy.description = "Changed fictional report content";
    expect(relationPublicationSource(state, copy)).toBeNull();
  });
  it("rejects withdrawn, wrong-area, duplicate, and detached qualifications", () => {
    const state = createDemoState();
    loadRelationExamples(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "load-source-test",
    );
    const report = state.reports.find(
      (row) => row.title === "Fictional lamp report A",
    )!;
    expect(
      relationPublicationSource(state, { ...report, revision: 99 }),
    ).toBeNull();
    const review = readRelationReview(state);
    review.qualifications[0].originGroupId = "west_croydon:original-a";
    Object.assign(state, { relationReview: review });
    expect(relationPublicationSource(state, report)).toBeNull();
    review.qualifications[0].originGroupId = `${area}:original-a`;
    review.qualifications.push({ ...review.qualifications[0] });
    expect(relationPublicationSource(state, report)).toBeNull();
    report.status = "withdrawn";
    expect(relationPublicationSource(state, report)).toBeNull();
  });
});
function intervals() {
  const state = createDemoState();
  const records = [
    ["10:00", "12:00"],
    ["11:30", "11:45"],
  ].map(([from, to], i) => {
    const observedFrom = `2026-09-12T${from}:00Z`,
      observedTo = `2026-09-12T${to}:00Z`;
    const report = submitReport(state, "alex", {
      pilotId: area,
      category: "infrastructure",
      title: `Fictional interval report ${i}`,
      description: "Fictional observed light issue",
      place: "Approximate Camden approach",
      observedAt: observedFrom,
      synthetic: true,
    });
    return {
      reportId: report.id,
      reportRevision: report.revision,
      status: "submitted",
      intake: {
        pilotId: area,
        category: report.category,
        title: report.title,
        narrative: report.description,
        place: report.place,
        observedFrom,
        observedTo,
        timePrecision: "time_window",
        synthetic: true,
      },
    };
  });
  Object.assign(state, { communityWorkflow: { records } });
  return { state, records };
}
describe("Current community observation intervals", () => {
  it("uses overlapping windows without inventing an asset or allowing operational promotion", () => {
    const { state } = intervals();
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "interval-candidate",
    );
    const candidates = readRelationReview(state).candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reasonCodes).toContain(
      "overlapping_reported_intervals",
    );
    expect(
      candidates[0].participants.every(
        (row) => row.assetId === null && row.timePrecision === "time_window",
      ),
    ).toBe(true);
    expect(() =>
      decideCandidate(
        state,
        "moderator",
        candidates[0].id,
        {
          area,
          expectedRevision: 2,
          action: "approve",
          reason: "Shared rough location",
        },
        "interval-approval",
      ),
    ).toThrow();
  });
  it("rejects stale revisions, changed content, wrong areas, and old report references", () => {
    const { state, records } = intervals();
    const report = state.reports.find((row) => row.id === records[0].reportId)!;
    expect(currentCommunityInterval(state, report)?.timePrecision).toBe(
      "time_window",
    );
    records[0].reportRevision++;
    expect(currentCommunityInterval(state, report)).toBeNull();
    records[0].reportRevision--;
    records[0].intake.title = "An outdated fictional title";
    expect(currentCommunityInterval(state, report)).toBeNull();
    records[0].intake.title = report.title;
    records[0].intake.pilotId = "west_croydon" as typeof area;
    expect(currentCommunityInterval(state, report)).toBeNull();
    records[0].intake.pilotId = area;
    records[0].reportId = "00000000-0000-4000-8000-000000000000";
    expect(currentCommunityInterval(state, report)).toBeNull();
  });
  it("rejects non-overlapping windows even when start times are near", () => {
    const { state, records } = intervals();
    records[0].intake.observedTo = "2026-09-12T10:30:00Z";
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "interval-no-match",
    );
    expect(readRelationReview(state).candidates).toHaveLength(0);
  });
});
