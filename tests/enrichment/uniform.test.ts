import { describe, expect, it } from "vitest";
import { getUniformEnrichment } from "../../packages/enrichment/index.js";
import { enrichmentEnvelopeSchema, sourceDiversity, validateEnrichmentCollection } from "../../packages/enrichment/uniform.js";
import { communityEnrichmentSchema, createFictionalObservation, projectCommunityMetadata, reviseFictionalObservation, withdrawFictionalObservation } from "../../packages/enrichment/community.js";

describe("uniform source boundaries", () => {
  it("retains five distinct crimes and six separately sourced outcomes", () => {
    const rows = getUniformEnrichment("camden_town");
    expect(rows.filter((row) => row.recordKind === "police_record")).toHaveLength(5);
    expect(rows.filter((row) => row.recordKind === "police_outcome")).toHaveLength(6);
    const police = rows.filter((row) => row.recordKind === "police_record");
    expect(new Set(police.map((row) => row.geography.placeId)).size).toBeLessThan(5);
    expect(new Set(police.map((row) => row.id)).size).toBe(5);
    expect(rows.every((row) => !row.alertEligible)).toBe(true);
  });
  it("rejects invented exact dates and event-level borough statistics", () => {
    const row = getUniformEnrichment("camden_town").find((r) => r.recordKind === "police_record")!;
    expect(() => enrichmentEnvelopeSchema.parse({ ...row, observedTime: { precision: "day", date: "2026-07-10" } })).toThrow();
    expect(() => enrichmentEnvelopeSchema.parse({ ...row, recordKind: "borough_crime_context" })).toThrow();
    expect(() => validateEnrichmentCollection([row,row])).toThrow(/Duplicate/);
  });
  it("does not count repeated source claims as independent confirmation", () => {
    const rows = getUniformEnrichment("camden_town").filter((r) => r.sourceFamilyId === "police-uk");
    expect(sourceDiversity(rows)).toEqual({ sourceFamilies: 1, knownOriginGroups: 0, unknownOrigins: 11, independentlyConfirmed: false });
  });
  it("keeps exact participant fields out of the shared contract", () => {
    const row = createFictionalObservation();
    expect(() => communityEnrichmentSchema.parse({ ...row, participantNames: ["Name"] })).toThrow();
    expect(() => communityEnrichmentSchema.parse({ ...row, evidence: [{kind:"video",offered:true,obtained:false,reviewed:true}] })).toThrow();
  });
  it("uses current corrected time and removes a withdrawn projection", () => {
    const first = createFictionalObservation();
    const time = { precision: "interval" as const, start:"2026-09-10T20:50:00+01:00",end:"2026-09-10T21:00:00+01:00",uncertaintyMinutes:10 };
    const corrected = reviseFictionalObservation(first,time);
    expect(projectCommunityMetadata(corrected)?.observedTime).toEqual(time);
    expect(corrected.metadata.revision).toBe(2);
    expect(corrected.metadata.supersedesId).toBe(`${first.metadata.id}:v1`);
    expect(projectCommunityMetadata(withdrawFictionalObservation(corrected))).toBeNull();
  });
  it("does not publish genuine accounts or fabricate consent", () => {
    const row = createFictionalObservation();
    const genuine = { ...row, metadata: {...row.metadata,synthetic:false,visibility:"private"} };
    expect(projectCommunityMetadata(communityEnrichmentSchema.parse(genuine))).toBeNull();
    expect(() => communityEnrichmentSchema.parse({...genuine,metadata:{...genuine.metadata,visibility:"public_context"}})).toThrow();
    expect(() => communityEnrichmentSchema.parse({...row,consent:{privateReview:false,redactedSummary:true}})).toThrow();
  });
  it("rejects inconsistent times and future accounts", () => {
    const row = createFictionalObservation();
    expect(() => reviseFictionalObservation(row,{precision:"interval",start:"2026-09-11T22:00:00Z",end:"2026-09-11T23:00:00Z",uncertaintyMinutes:0})).toThrow();
    expect(() => communityEnrichmentSchema.parse({...row,accountBasis:"firsthand"})).toThrow();
  });
});
