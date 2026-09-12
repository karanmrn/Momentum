import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { policeOutcomeCollectionSchema } from "../../packages/enrichment/police-outcomes.js";
import { onsGeographySchema } from "../../packages/enrichment/ons-geography.js";
import { mpsContextSchema } from "../../packages/enrichment/mps-context.js";
import {
  sourcePath,
  type Artifact,
  type StoredRecord,
} from "../datasets/store/import.js";

const files = ["police-outcomes", "ons-geography", "mps-context"] as const;
const boroughPilots = {
  Camden: "camden_town",
  Hounslow: "hounslow_town_centre",
  Croydon: "west_croydon",
} as const;

/** Feed these artifacts to the existing private importArtifact API. No public grants or raw community input. */
export async function buildEnrichmentImportPlan(
  root: string,
): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  for (const dataset of files) {
    const relativePath = `research/enrichment/${dataset}.json`;
    const path = await sourcePath(root, relativePath);
    if ((await stat(path)).size > 2_000_000)
      throw new Error("enrichment_file_limit");
    const buffer = await readFile(path);
    if (buffer.byteLength > 2_000_000) throw new Error("enrichment_file_limit");
    const input: unknown = JSON.parse(buffer.toString("utf8"));
    let records: StoredRecord[];
    if (dataset === "police-outcomes") {
      const data = policeOutcomeCollectionSchema.parse(input);
      records = data.results.map((row) => ({
        recordKey: row.expectedCrime.persistentId,
        pilotId: "camden_town",
        sourceId: row.sourceFamilyId,
        sourceUrl: row.sourceUrl,
        fetchedAt: row.fetchedAt,
        observedAt: row.expectedCrime.month,
        raw: { ...row, publicationAllowed: false },
      }));
    } else if (dataset === "ons-geography") {
      const data = onsGeographySchema.parse(input);
      records = data.observations.map((row) => ({
        recordKey: `${row.pilotId}:${row.level}:2021`,
        pilotId: row.pilotId,
        sourceId: "ons-geography-2021",
        sourceUrl: row.boundaryEvidence[0]?.url ?? null,
        fetchedAt: row.checkedAt,
        observedAt: row.population.period,
        raw: { ...row, publicationAllowed: false },
      }));
    } else {
      const data = mpsContextSchema.parse(input);
      records = data.cells.map((row) => ({
        recordKey: row.id,
        pilotId: boroughPilots[row.borough],
        sourceId: data.source.sourceFamilyId,
        sourceUrl: data.source.url,
        fetchedAt: data.source.fetchedAt,
        observedAt: row.month,
        raw: {
          ...row,
          scope: data.scope,
          additiveWithPoliceUk: false,
          incidentClassificationAllowed: false,
          publicationAllowed: false,
          alertEligible: false,
        },
      }));
    }
    artifacts.push({
      dataset: `enrichment-${dataset}`,
      relativePath,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      byteCount: buffer.byteLength,
      recordCount: records.length,
      manifest: {
        schemaVersion: "1.0",
        sourceArtifact: input,
        synthetic: false,
        publicationAllowed: false,
        alertEligible: false,
      },
      async *records() {
        for (const record of records) yield structuredClone(record);
      },
    });
  }
  return artifacts;
}
