import { describe, expect, it } from "vitest";
import { getUniformEnrichment } from "../../packages/enrichment/index.js";
import {
  enrichmentEnvelopeSchema,
  sourceDiversity,
  validateEnrichmentCollection,
} from "../../packages/enrichment/uniform.js";
import {
  communityEnrichmentSchema,
  createFictionalObservation,
  projectCommunityMetadata,
  reviseFictionalObservation,
  withdrawFictionalObservation,
} from "../../packages/enrichment/community.js";

describe("uniform source boundaries", () => {
  it("retains five distinct crimes and six separately sourced outcomes", () => {
    const rows = getUniformEnrichment("camden_town");
    expect(
      rows.filter((row) => row.recordKind === "police_record"),
    ).toHaveLength(5);
    expect(
      rows.filter((row) => row.recordKind === "police_outcome"),
    ).toHaveLength(6);
    const police = rows.filter((row) => row.recordKind === "police_record");
    expect(
      new Set(police.map((row) => row.geography.placeId)).size,
    ).toBeLessThan(5);
    expect(new Set(police.map((row) => row.id)).size).toBe(5);
    expect(rows.every((row) => !row.alertEligible)).toBe(true);
  });
  it("rejects invented exact dates and event-level borough statistics", () => {
    const row = getUniformEnrichment("camden_town").find(
      (r) => r.recordKind === "police_record",
    )!;
    expect(() =>
      enrichmentEnvelopeSchema.parse({
        ...row,
        observedTime: { precision: "day", date: "2026-07-10" },
      }),
    ).toThrow();
    expect(() =>
      enrichmentEnvelopeSchema.parse({
        ...row,
        recordKind: "borough_crime_context",
      }),
    ).toThrow();
    expect(() => validateEnrichmentCollection([row, row])).toThrow(/Duplicate/);
  });
  it("does not count repeated source claims as independent confirmation", () => {
    const rows = getUniformEnrichment("camden_town").filter(
      (r) =>
        r.recordKind === "police_record" || r.recordKind === "police_outcome",
    );
    expect(sourceDiversity(rows)).toEqual({
      sourceFamilies: 1,
      knownOriginGroups: 0,
      unknownOrigins: 11,
      independentlyConfirmed: false,
    });
  });
  it("exports borough scope and withholds the ambiguous LSOA population", () => {
    const rows = getUniformEnrichment("west_croydon");
    expect(
      rows
        .filter((row) => row.recordKind === "area_population")
        .map((row) => row.geography.code),
    ).toEqual(["E02000213"]);
    const counts = rows.filter(
      (row) => row.recordKind === "borough_crime_context",
    );
    expect(counts).toHaveLength(168);
    expect(
      counts.every(
        (row) =>
          row.geography.code === "E09000008" &&
          row.geography.relation === "area_context_only",
      ),
    ).toBe(true);
  });
  it("keeps exact participant fields out of the shared contract", () => {
    const row = createFictionalObservation();
    expect(() =>
      communityEnrichmentSchema.parse({ ...row, participantNames: ["Name"] }),
    ).toThrow();
    expect(() =>
      communityEnrichmentSchema.parse({
        ...row,
        evidence: [
          { kind: "video", offered: true, obtained: false, reviewed: true },
        ],
      }),
    ).toThrow();
  });
  it("uses current corrected time and removes a withdrawn projection", () => {
    const first = createFictionalObservation();
    const time = {
      precision: "interval" as const,
      start: "2026-09-10T20:50:00+01:00",
      end: "2026-09-10T21:00:00+01:00",
      uncertaintyMinutes: 10,
    };
    const corrected = reviseFictionalObservation(first, time);
    expect(projectCommunityMetadata(corrected)?.observedTime).toEqual(time);
    expect(corrected.metadata.revision).toBe(2);
    expect(corrected.metadata.supersedesId).toBe(`${first.metadata.id}:v1`);
    expect(
      projectCommunityMetadata(withdrawFictionalObservation(corrected)),
    ).toBeNull();
  });
  it("does not publish genuine accounts or fabricate consent", () => {
    const row = createFictionalObservation();
    const genuine = {
      ...row,
      metadata: { ...row.metadata, synthetic: false, visibility: "private" },
    };
    expect(
      projectCommunityMetadata(communityEnrichmentSchema.parse(genuine)),
    ).toBeNull();
    expect(
      sourceDiversity([communityEnrichmentSchema.parse(genuine).metadata])
        .sourceFamilies,
    ).toBe(0);
    expect(() =>
      communityEnrichmentSchema.parse({
        ...genuine,
        metadata: { ...genuine.metadata, visibility: "public_context" },
      }),
    ).toThrow();
    expect(() =>
      communityEnrichmentSchema.parse({
        ...row,
        consent: { privateReview: false, redactedSummary: true },
      }),
    ).toThrow();
  });
  it("rejects inconsistent times and future accounts", () => {
    const row = createFictionalObservation();
    expect(() =>
      reviseFictionalObservation(row, {
        precision: "interval",
        start: "2026-09-11T22:00:00Z",
        end: "2026-09-11T23:00:00Z",
        uncertaintyMinutes: 0,
      }),
    ).toThrow();
    expect(() =>
      communityEnrichmentSchema.parse({ ...row, accountBasis: "firsthand" }),
    ).toThrow();
    expect(() =>
      reviseFictionalObservation(row, { precision: "day", date: "2099-01-01" }),
    ).toThrow();
    expect(() =>
      reviseFictionalObservation(row, { precision: "month", month: "2099-01" }),
    ).toThrow();
  });
  it("validates revision chains and excludes withdrawn prior revisions from diversity", () => {
    const row = getUniformEnrichment("camden_town")[0];
    expect(() =>
      enrichmentEnvelopeSchema.parse({
        ...row,
        revision: 2,
        supersedesId: null,
      }),
    ).toThrow();
    expect(() =>
      enrichmentEnvelopeSchema.parse({
        ...row,
        revision: 2,
        supersedesId: "unrelated:v1",
      }),
    ).toThrow();
    const withdrawn = {
      ...row,
      revision: 2,
      supersedesId: `${row.id}:v1`,
      reviewStatus: "withdrawn" as const,
    };
    expect(sourceDiversity([withdrawn, row])).toEqual({
      sourceFamilies: 0,
      knownOriginGroups: 0,
      unknownOrigins: 0,
      independentlyConfirmed: false,
    });
  });
  it("compares partial dates in London time across UTC midnight", () => {
    const row = createFictionalObservation();
    const observedTime = { precision: "day" as const, date: "2026-09-11" };
    expect(() =>
      communityEnrichmentSchema.parse({
        ...row,
        submittedAt: "2026-09-10T23:30:00Z",
        observedTime,
        metadata: { ...row.metadata, observedTime },
      }),
    ).not.toThrow();
    const monthTime = { precision: "month" as const, month: "2026-10" };
    expect(() =>
      communityEnrichmentSchema.parse({
        ...row,
        submittedAt: "2026-09-30T23:30:00Z",
        observedTime: monthTime,
        metadata: { ...row.metadata, observedTime: monthTime },
      }),
    ).not.toThrow();
  });
});
