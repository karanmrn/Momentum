/**
 * Adapted from PUBMAXX lib/venueTruth.ts at commit e9a412be1.
 * This parser preserves unknown values and accepts only exact OSM tag values.
 * A parsed value records a map claim. It does not confirm current conditions.
 */
export const osmAttributeStates = ["yes", "no", "limited", "unknown"] as const;

export type OsmAttributeState = (typeof osmAttributeStates)[number];

export interface OsmAttribute {
  state: OsmAttributeState;
  rawValue: string | null;
}

/** Preserve the source string. Qualified values remain unknown. */
export function parseOsmAttribute(raw: unknown): OsmAttribute {
  const rawValue = typeof raw === "string" ? raw : null;
  const state =
    rawValue === "yes" || rawValue === "no" || rawValue === "limited"
      ? rawValue
      : "unknown";

  return { state, rawValue };
}
