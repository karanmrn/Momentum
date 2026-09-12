import { createHash } from "node:crypto";
import type { DemoState, Report } from "../contracts/index.js";
import type { RelationReviewState } from "./schema.js";

type State = DemoState & { relationReview?: RelationReviewState };
export function relationReportContentHash(report: Report): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        report.category,
        report.title,
        report.description,
        report.place,
        report.observedAt,
      ]),
    )
    .digest("hex");
}

/** Returns source lineage only for an unchanged, current fictional fixture. */
export function relationPublicationSource(
  state: State,
  report: Report,
): {
  sourceKind: "community_firsthand" | "community_other_source";
  sourceFamilyId: "streetwise-fictional-relations";
  originGroupId: string;
} | null {
  const current = state.reports.find((row) => row.id === report.id);
  if (
    !current ||
    current.synthetic !== true ||
    !["submitted", "approved_for_summary"].includes(current.status) ||
    current.revision !== report.revision ||
    current.pilotId !== report.pilotId ||
    relationReportContentHash(current) !== relationReportContentHash(report)
  )
    return null;
  const rows =
    state.relationReview?.qualifications.filter(
      (row) => row.reportId === current.id,
    ) ?? [];
  if (rows.length !== 1) return null;
  const qualification = rows[0];
  if (
    qualification.contentHash !== relationReportContentHash(current) ||
    qualification.sourceFamilyId !== "streetwise-fictional-relations" ||
    !["community_firsthand", "community_other_source"].includes(
      qualification.sourceKind,
    ) ||
    !qualification.originGroupId?.startsWith(`${current.pilotId}:`) ||
    !qualification.assetId.startsWith(`fictional-asset:${current.pilotId}:`)
  )
    return null;
  return {
    sourceKind: qualification.sourceKind,
    sourceFamilyId: qualification.sourceFamilyId,
    originGroupId: qualification.originGroupId,
  };
}
