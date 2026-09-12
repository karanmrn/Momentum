import {
  pilotSchema,
  type HelpCard,
  type PilotId,
  type SourceCard,
} from "../../packages/contracts/index.js";

// Exa retrieval time. The source pages did not provide publication timestamps.
const retrievedAt = "2026-09-12T12:08:48Z";
const hounslowAsb =
  "https://www.hounslow.gov.uk/community-safety/anti-social-behaviour-1";
const hounslowUrgent =
  "https://www.hounslow.gov.uk/customer-services/hours-emergencies";
const hounslowLighting =
  "https://hounslowhighways.org/street-lighting/street-light-services/";
const croydonLighting =
  "https://www.croydon.gov.uk/streets-roads-and-transport/street-maintenance-repairs-and-improvements/street-lighting/street-lighting-maintenance-and-services";
const croydonSupport =
  "https://www.croydon.gov.uk/community-and-safety/support-groups-and-advice/domestic-abuse/domestic-abuse-and-sexual-violence";

type LocalSource = Pick<
  SourceCard,
  "id" | "title" | "summary" | "url" | "scope" | "sourceKind"
>;
const sources: Record<PilotId, LocalSource[]> = {
  hounslow_town_centre: [
    {
      id: "hounslow-civic-lighting",
      title: "Hounslow lighting reports",
      summary:
        "Hounslow Highways maintains lighting on publicly maintained roads. Housing estates and private roads have separate reporting routes. Check ownership before reporting. This page does not show current faults.",
      url: hounslowLighting,
      scope:
        "Hounslow borough service; each town-centre road needs an ownership check.",
      sourceKind: "official_operator",
    },
    {
      id: "hounslow-civic-asb",
      title: "Hounslow antisocial behaviour reports",
      summary:
        "The council separates street issues, noise, and council housing reports. Its Safer Communities team handles other antisocial behaviour concerns. Use the council page to choose the reporting route.",
      url: hounslowAsb,
      scope:
        "Hounslow borough reporting service; no town-centre incident feed.",
      sourceKind: "council_directory",
    },
  ],
  camden_town: [],
  west_croydon: [
    {
      id: "croydon-civic-lighting",
      title: "Croydon lighting reports",
      summary:
        "The council directs red route lighting faults to TfL. Milestone manages other road lighting. Check road ownership before reporting. The page gives conflicting repair targets, so completion times remain uncertain.",
      url: croydonLighting,
      scope:
        "Croydon borough service; West Croydon road ownership needs review.",
      sourceKind: "council_directory",
    },
    {
      id: "croydon-support-directory",
      title: "Croydon support services",
      summary:
        "The council lists domestic abuse and sexual violence support services. Each service has its own eligibility and access conditions. Confirm current details with the provider.",
      url: croydonSupport,
      scope:
        "Croydon borough directory; no West Croydon walk-in venue is confirmed.",
      sourceKind: "council_directory",
    },
  ],
};

const help: Record<PilotId, HelpCard[]> = {
  hounslow_town_centre: [
    {
      id: "hounslow-urgent-council-support",
      pilotId: "hounslow_town_centre",
      name: "Urgent council support",
      summary:
        "Hounslow Council lists telephone support for urgent council issues outside office hours. This borough service is not a walk-in refuge. Check the source for contact details and service limits.",
      url: hounslowUrgent,
      availability: "unconfirmed",
      schedule: null,
    },
  ],
  camden_town: [],
  west_croydon: [
    {
      id: "croydon-family-justice-support",
      pilotId: "west_croydon",
      name: "Family Justice Service",
      summary:
        "Croydon Council lists its Family Justice Service for domestic abuse and sexual violence support. This borough service is not a confirmed West Croydon walk-in refuge. Check current access details with the service.",
      url: croydonSupport,
      availability: "unconfirmed",
      schedule: null,
    },
  ],
};

export function getLocalSources(pilotId: PilotId): SourceCard[] {
  return sources[pilotSchema.parse(pilotId)].map((source) => ({
    ...source,
    status: "link_only",
    fetchedAt: retrievedAt,
    publishedAt: null,
    synthetic: false,
    checkedAt: retrievedAt,
    coverage: "directory",
    attribution: pilotId === "hounslow_town_centre" ? "Hounslow Council / Hounslow Highways" : "Croydon Council",
  }));
}

export function getLocalHelp(pilotId: PilotId): HelpCard[] {
  return help[pilotSchema.parse(pilotId)].map((card) => ({ ...card, kind: "service", checkedAt: retrievedAt, sourceLabel: pilotId === "hounslow_town_centre" ? "Hounslow Council" : "Croydon Council" }));
}
