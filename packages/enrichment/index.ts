import outcomeSnapshot from "../../research/enrichment/police-outcomes.json";
import onsSnapshot from "../../research/enrichment/ons-geography.json";
import mpsSnapshot from "../../research/enrichment/mps-context.json";
import { policeSelection } from "../camden-evidence/index.js";
import { type PilotId, pilotSchema } from "../contracts/index.js";
import { getDatasetCoverage } from "../datasets/src/coverage.js";
import { getCamdenHelp } from "../../services/data/camden-help.js";
import { policeOutcomeCollectionSchema } from "./police-outcomes.js";
import { onsGeographySchema } from "./ons-geography.js";
import { mpsContextSchema } from "./mps-context.js";
import {
  type EnrichmentEnvelope,
  validateEnrichmentCollection,
} from "./uniform.js";

export const policeOutcomeHistory =
  policeOutcomeCollectionSchema.parse(outcomeSnapshot);
export const onsAreaContext = onsGeographySchema.parse(onsSnapshot);
export const mpsBoroughContext = mpsContextSchema.parse(mpsSnapshot);
const coverageFamilies: Record<string, string> = {
  "police-street": "police-uk",
  "police-priorities": "police-uk",
  "tfl-stations": "tfl",
  "naptan-stops": "dft-naptan",
  "ons-population": "ons-census-2021",
};
export const placeIdentity = {
  camden_town: {
    id: "area:camden_town",
    label: "Camden Town",
    boroughCode: "E09000007",
    borough: "Camden",
  },
  hounslow_town_centre: {
    id: "area:hounslow_town_centre",
    label: "Hounslow town centre",
    boroughCode: "E09000018",
    borough: "Hounslow",
  },
  west_croydon: {
    id: "area:west_croydon",
    label: "West Croydon",
    boroughCode: "E09000008",
    borough: "Croydon",
  },
} as const;

export function envelopeBase(pilotId: PilotId): EnrichmentEnvelope {
  return {
    schemaVersion: "1.0",
    id: "unset",
    recordKind: "dataset_coverage",
    pilotId,
    sourceFamilyId: "unset",
    originGroupId: null,
    sourceRecordId: "unset",
    sourceUrl: null,
    snapshotSha256: null,
    sourceRowIndex: null,
    retrievedAt: null,
    sourcePublishedAt: null,
    observedTime: { precision: "unknown" },
    geography: {
      placeId: placeIdentity[pilotId].id,
      precision: "research_area",
      code: null,
      vintage: null,
      relation: "area_context_only",
    },
    accountBasis: "official_record",
    reviewStatus: "source_published",
    revision: 1,
    supersedesId: null,
    synthetic: false,
    visibility: "public_context",
    alertEligible: false,
    limitations: [],
  };
}

/** Existing source adapters remain authoritative. These envelopes add a common join surface. */
export function getUniformEnrichment(
  pilotId: PilotId,
  now = new Date(),
): EnrichmentEnvelope[] {
  pilotSchema.parse(pilotId);
  const rows: EnrichmentEnvelope[] = getDatasetCoverage(pilotId)
    .filter((row) => row.sourceUrl && row.fetchedAt)
    .map((row) => ({
      ...envelopeBase(pilotId),
      id: `coverage:${pilotId}:${row.id}`,
      sourceRecordId: row.id,
      sourceFamilyId:
        coverageFamilies[row.id] ?? new URL(row.sourceUrl).hostname,
      sourceUrl: row.sourceUrl,
      retrievedAt: row.fetchedAt,
      limitations: [
        ...row.limitations,
        "This record describes acquisition coverage, not individual events.",
      ],
    }));
  for (const area of onsAreaContext.observations.filter(
    (row) => row.pilotId === pilotId,
  )) {
    if (
      area.status !== "verified_containment" ||
      area.population.status !== "available" ||
      !area.containingArea ||
      !area.population.evidence
    )
      continue;
    rows.push({
      ...envelopeBase(pilotId),
      id: `population:${area.containingArea.code}:2021`,
      recordKind: "area_population",
      sourceFamilyId: "ons-census-2021",
      sourceRecordId: `TS001:${area.containingArea.code}:2021`,
      sourceUrl: area.population.evidence.url,
      snapshotSha256: area.population.evidence.sha256,
      retrievedAt: area.population.evidence.retrievedAt,
      observedTime: { precision: "day", date: area.population.period },
      geography: {
        placeId: `ons:2021:${area.containingArea.code}`,
        precision: "statistical_area",
        code: area.containingArea.code,
        vintage: 2021,
        relation: "anchor_contained",
      },
      limitations: [
        "The research anchor lies inside this statistical area.",
        "This is a whole-area Census resident count, not a pilot or visitor count.",
        "LSOA and MSOA populations overlap. They must not be added.",
        "Boundary and population evidence remain separate in the source observation.",
      ],
    });
  }
  for (const cell of mpsBoroughContext.cells.filter(
    (row) => row.borough === placeIdentity[pilotId].borough,
  ))
    rows.push({
      ...envelopeBase(pilotId),
      id: `mps:${cell.id}`,
      recordKind: "borough_crime_context",
      sourceRecordId: cell.id,
      sourceFamilyId: mpsBoroughContext.source.sourceFamilyId,
      sourceUrl: mpsBoroughContext.source.url,
      snapshotSha256: cell.sourceSnapshotSha256,
      sourceRowIndex: cell.sourceRowIndex,
      retrievedAt: mpsBoroughContext.source.fetchedAt,
      observedTime: { precision: "month", month: cell.month },
      geography: {
        placeId: `borough:${placeIdentity[pilotId].boroughCode}`,
        precision: "borough",
        code: placeIdentity[pilotId].boroughCode,
        vintage: null,
        relation: "area_context_only",
      },
      limitations: mpsBoroughContext.limitations,
    });
  if (pilotId !== "camden_town") return validateEnrichmentCollection(rows);
  for (const selected of policeSelection.records) {
    const raw = selected.raw;
    const base: EnrichmentEnvelope = {
      ...envelopeBase(pilotId),
      id: `police:${raw.persistent_id}`,
      recordKind: "police_record",
      sourceFamilyId: "police-uk",
      sourceRecordId: raw.persistent_id,
      sourceUrl: policeSelection.sourceUrl,
      snapshotSha256: policeSelection.sourceSnapshotSha256,
      sourceRowIndex: selected.sourceRowIndex,
      retrievedAt: policeSelection.sourceFetchedAt,
      observedTime: { precision: "month", month: raw.month },
      geography: {
        placeId: `police-street:${raw.location.street.id}`,
        precision: "anonymised_point",
        code: null,
        vintage: null,
        relation: "source_location",
      },
      limitations: [
        "Recorded month is not an exact incident date.",
        "The map point is anonymised.",
        "The category cannot identify assault subtype or victim gender.",
      ],
    };
    rows.push(base);
    const history = policeOutcomeHistory.results.find(
      (result) => result.expectedCrime.persistentId === raw.persistent_id,
    );
    if (history?.status === "available") {
      for (const outcome of history.outcomes)
        rows.push({
          ...base,
          id: `outcome:${outcome.id}`,
          recordKind: "police_outcome",
          sourceRecordId: outcome.id,
          sourceUrl: history.sourceUrl,
          snapshotSha256: history.sourceSnapshotSha256,
          sourceRowIndex: outcome.sourceIndex,
          retrievedAt: history.fetchedAt,
          observedTime: outcome.month
            ? { precision: "month", month: outcome.month }
            : { precision: "unknown" },
          limitations: [
            "Linked by exact persistent ID, category, and recorded month.",
            "Outcome month does not establish an exact transition date.",
            "No person identifiers are retained.",
          ],
        });
    }
  }
  for (const help of getCamdenHelp(now))
    rows.push({
      ...envelopeBase(pilotId),
      id: `help:${help.id}`,
      recordKind: "help_listing",
      sourceRecordId: help.id,
      sourceFamilyId: "camden-council",
      sourceUrl: help.url,
      retrievedAt: help.checkedAt!,
      geography: {
        placeId: `help:${help.id}`,
        precision: "listed_place",
        code: null,
        vintage: null,
        relation: "listed_location",
      },
      limitations: [
        help.summary,
        help.schedule ?? "Hours unknown.",
        "Current availability is unconfirmed.",
      ],
    });
  return validateEnrichmentCollection(rows);
}

export const sourceReuse = [
  {
    name: "London Maxxing",
    role: "Source directory",
    url: "https://resources.londonmaxxing.com/",
    status: "Use each linked source with its own licence and timestamp.",
  },
  {
    name: "Police.uk",
    role: "Police records and outcomes",
    url: "https://data.police.uk/docs/",
    status: "Historical evidence. Approximate geography and month precision.",
  },
  {
    name: "ONS and Nomis",
    role: "Dated resident context",
    url: "https://www.nomisweb.co.uk/datasets/c2021ts001",
    status: "Statistical areas. No visitor counts or personal danger estimate.",
  },
  {
    name: "TfL",
    role: "Transport identities and notices",
    url: "https://api.tfl.gov.uk/",
    status: "Existing adapter. Service notices cannot verify an incident.",
  },
  {
    name: "OpenStreetMap",
    role: "Places and amenities",
    url: "https://www.openstreetmap.org/copyright",
    status:
      "Existing place adapter. A mapped amenity does not prove current access.",
  },
  {
    name: "FixMyStreet",
    role: "Civic report references",
    url: "https://www.fixmystreet.com/",
    status:
      "Existing official reporting links. An authorised report feed is still needed for ingestion.",
  },
  {
    name: "Councilmaxxing",
    role: "Reusable document tools",
    url: "https://github.com/karanmrn/Councilmaxxing",
    status:
      "Code reuse is not independent source evidence. Private reports must not enter tool logs.",
  },
] as const;
