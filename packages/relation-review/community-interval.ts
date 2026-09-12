import { z } from "zod";
import type { DemoState, Report } from "../contracts/index.js";

const recordSchema = z.object({
  reportId: z.string().uuid(),
  reportRevision: z.number().int().positive().optional(),
  status: z.string(),
  intake: z.object({
    pilotId: z.string(),
    category: z.string(),
    title: z.string(),
    place: z.string(),
    narrative: z.string(),
    observedFrom: z.string().datetime({ offset: true }),
    observedTo: z.string().datetime({ offset: true }),
    timePrecision: z.enum(["approximate_time", "time_window", "day"]),
    synthetic: z.literal(true),
  }),
});
const sidecarSchema = z.object({ records: z.array(z.unknown()).max(100) });

/** A current intake can retain time precision without adding an asset identity. */
export function currentCommunityInterval(
  state: DemoState & { communityWorkflow?: unknown },
  report: Report,
) {
  const parsed = sidecarSchema.safeParse(state.communityWorkflow);
  if (!parsed.success) return null;
  const matches = parsed.data.records.flatMap((value) => {
    const entry = recordSchema.safeParse(value);
    return entry.success && entry.data.reportId === report.id
      ? [entry.data]
      : [];
  });
  if (matches.length !== 1) return null;
  const record = matches[0],
    intake = record.intake;
  if (
    ["withdrawn", "rejected", "resolved", "retracted"].includes(
      record.status,
    ) ||
    (record.reportRevision !== undefined &&
      record.reportRevision !== report.revision) ||
    intake.pilotId !== report.pilotId ||
    intake.category !== report.category ||
    intake.title !== report.title ||
    intake.place !== report.place ||
    intake.observedFrom !== report.observedAt ||
    (intake.narrative || "No optional narrative supplied.") !==
      report.description
  )
    return null;
  const duration =
    Date.parse(intake.observedTo) - Date.parse(intake.observedFrom);
  if (duration < 0 || duration > 31 * 86400000) return null;
  return {
    observedFrom: intake.observedFrom,
    observedTo: intake.observedTo,
    timePrecision: intake.timePrecision,
  };
}
