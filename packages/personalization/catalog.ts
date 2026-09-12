import { z } from "zod";
import data from "../../research/datasets/tfl-status.json" with { type: "json" };
import { areas, pilotSchema, type PilotId } from "../contracts/index.js";

export interface FollowTarget {
  id: string;
  label: string;
  pilotId: PilotId;
  kind: "station" | "place" | "zone";
  review: "source_identity_checked" | "candidate_boundary_unreviewed";
  sourceUrl: string | null;
}
const stations = z
  .array(
    z.object({
      id: z.string().regex(/^[A-Z0-9]{3,30}$/),
      name: z.string().min(1).max(300),
      pilotId: pilotSchema,
      identityMatch: z.literal("verified_tfl_search_and_detail"),
    }),
  )
  .max(20)
  .parse(data.live.stations);
export const followCatalog: FollowTarget[] = [
  ...stations.map((s) => ({
    id: `station:${s.id}`,
    label: s.name,
    pilotId: s.pilotId,
    kind: "station" as const,
    review: "source_identity_checked" as const,
    sourceUrl: `https://api.tfl.gov.uk/StopPoint/${s.id}`,
  })),
  ...areas.flatMap((area) => [
    {
      id: `place:${area.id}:approach`,
      label: area.place,
      pilotId: area.id,
      kind: "place" as const,
      review: "candidate_boundary_unreviewed" as const,
      sourceUrl: null,
    },
    {
      id: `zone:${area.id}:centre`,
      label: `${area.name} candidate zone`,
      pilotId: area.id,
      kind: "zone" as const,
      review: "candidate_boundary_unreviewed" as const,
      sourceUrl: null,
    },
  ]),
];
/** Exact fixture labels only. A common area never establishes station or zone membership. */
export function referenceIdsForPlace(
  pilotId: PilotId,
  place: string,
): string[] {
  const value = place.trim().toLocaleLowerCase("en-GB");
  return followCatalog
    .filter(
      (target) =>
        target.pilotId === pilotId &&
        target.kind === "place" &&
        target.label.toLocaleLowerCase("en-GB") === value,
    )
    .map((target) => target.id);
}
