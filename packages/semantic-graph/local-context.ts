import { z } from "zod";
import tflData from "../../research/datasets/tfl-status.json" with { type: "json" };
import { getCamdenHelp } from "../../services/data/camden-help.js";
import { pilotSchema, type PilotId } from "../contracts/index.js";
import type { SemanticGraph } from "./schema.js";

type Node = SemanticGraph["nodes"][number];
type Assertion = SemanticGraph["assertions"][number];
const stationId = z.string().regex(/^[A-Z0-9]{3,30}$/);
const snapshots = z
  .object({
    live: z.object({
      status: z.literal("collected"),
      stations: z
        .array(
          z.object({
            pilotId: pilotSchema,
            id: stationId,
            name: z.string().min(1).max(300),
            identityMatch: z.literal("verified_tfl_search_and_detail"),
          }),
        )
        .max(10),
      requests: z
        .array(
          z.object({
            sourceUrl: z.string().url(),
            fetchedAt: z.string().datetime(),
            httpStatus: z.number().int(),
            checksum: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        )
        .max(30),
    }),
  })
  .parse(tflData);

/** Curated directory entries and dated official identities. No live request or operational claim. */
export function localContextGraph(
  pilotId: PilotId,
  now = new Date(),
): Pick<SemanticGraph, "nodes" | "assertions"> {
  const nodes: Node[] = [],
    assertions: Assertion[] = [];
  const areaId = `area:${pilotId}`;
  function connect(node: Node, source: Node) {
    nodes.push(source, node);
    assertions.push(
      {
        id: `${node.id}:ISSUED_BY:${source.id}`,
        subjectId: node.id,
        predicate: "ISSUED_BY",
        objectId: source.id,
        inferenceType: "deterministic_join",
        reasonCodes: ["dated_source_record_not_live_availability"],
        evidenceRefs: [node.id, source.id],
        methodVersion: "1.0",
        synthetic: false,
      },
      {
        id: `${node.id}:CONTEXTUAL_AREA_ONLY:${areaId}`,
        subjectId: node.id,
        predicate: "CONTEXTUAL_AREA_ONLY",
        objectId: areaId,
        inferenceType: "deterministic_join",
        reasonCodes: ["selected_local_context_not_approved_pilot_membership"],
        evidenceRefs: [node.id],
        methodVersion: "1.0",
        synthetic: false,
      },
    );
  }
  for (const station of snapshots.live.stations.filter(
    (station) => station.pilotId === pilotId,
  )) {
    const url = `https://api.tfl.gov.uk/StopPoint/${station.id}`;
    const request = snapshots.live.requests.find(
      (request) => request.sourceUrl === url && request.httpStatus === 200,
    );
    if (!request) continue;
    const sourceId = `source:tfl:${station.id}`;
    const provenance = {
      sourceId,
      sourceFamilyId: "tfl",
      sourceUrl: url,
      fetchedAt: request.fetchedAt,
      originGroupId: null,
      snapshotSha256: request.checksum,
    };
    connect(
      {
        id: `station:${station.id}`,
        type: "Place",
        label: station.name,
        synthetic: false,
        provenance,
        metadata: {
          sourceRecordKey: station.id,
          precision: "station_identity_not_entrance",
          availability: "unknown",
          summary:
            "Dated TfL station identity. Current station operation is unknown.",
        },
      },
      {
        id: sourceId,
        type: "Source",
        label: "TfL station identity",
        synthetic: false,
        provenance,
        metadata: {},
      },
    );
  }
  if (pilotId === "camden_town")
    for (const help of getCamdenHelp(now)) {
      const sourceId = `source:camden-help:${help.id}`;
      const provenance = {
        sourceId,
        sourceFamilyId: "camden-council",
        sourceUrl: help.url,
        fetchedAt: help.checkedAt ?? null,
        originGroupId: null,
      };
      connect(
        {
          id: `help:${help.id}`,
          type: "HelpLocation",
          label: help.name,
          synthetic: false,
          provenance,
          metadata: {
            sourceRecordKey: help.id,
            summary: help.summary,
            availability: help.availability,
            schedule: help.schedule,
            ...(help.address ? { address: help.address } : {}),
            ...(help.coordinates ? { coordinates: help.coordinates } : {}),
            precision: help.coordinates
              ? "directory_place_reference"
              : "published_location_no_verified_coordinates",
          },
        },
        {
          id: sourceId,
          type: "Source",
          label: help.sourceLabel ?? "Camden Council",
          synthetic: false,
          provenance,
          metadata: {},
        },
      );
    }
  return { nodes, assertions };
}
