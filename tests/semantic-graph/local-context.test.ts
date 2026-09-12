import { expect, it, vi } from "vitest";
import { localContextGraph } from "../../packages/semantic-graph/local-context.js";
import { semanticGraphSchema } from "../../packages/semantic-graph/schema.js";

it("keeps Camden help availability and the dated bus exception without inventing coordinates", () => {
  const original = localContextGraph(
    "camden_town",
    new Date("2026-09-12T23:00:00+01:00"),
  );
  const bus = original.nodes.find((node) => node.id === "help:C01")!;
  expect(
    original.nodes.filter((node) => node.type === "HelpLocation"),
  ).toHaveLength(5);
  expect(bus.metadata.address).toBe("Outside KOKO on Camden High Street");
  expect(bus.metadata.coordinates).toBeUndefined();
  expect(bus.metadata.availability).toBe("unconfirmed");
  expect(bus.provenance?.fetchedAt).toBe("2026-09-12T14:18:31.995Z");
  const next = localContextGraph(
    "camden_town",
    new Date("2026-09-13T02:30:00+01:00"),
  );
  expect(
    next.nodes.find((node) => node.id === "help:C01")?.metadata.address,
  ).toBe("Outside Camden Town Underground station");
  expect(
    next.nodes.find((node) => node.id === "help:C01")?.metadata.availability,
  ).toBe("unconfirmed");
});
it("uses dated canonical station identities without live requests or entrance claims", () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network permitted"));
  try {
    const graph = localContextGraph("camden_town");
    const stations = graph.nodes.filter((node) =>
      node.id.startsWith("station:"),
    );
    expect(stations.map((node) => node.metadata.sourceRecordKey)).toEqual([
      "940GZZLUCTN",
      "910GCMDNRD",
    ]);
    for (const station of stations) {
      expect(station.metadata.availability).toBe("unknown");
      expect(station.metadata.coordinates).toBeUndefined();
      expect(station.metadata.precision).toBe("station_identity_not_entrance");
      expect(station.provenance?.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(station.provenance?.sourceFamilyId).toBe("tfl");
    }
    expect(fetch).not.toHaveBeenCalled();
    const area = {
      id: "area:camden_town",
      type: "Area",
      label: "Camden",
      synthetic: false,
      provenance: null,
      metadata: {},
    };
    expect(
      semanticGraphSchema.safeParse({
        ontologyVersion: "1.0",
        pilotId: "camden_town",
        nodes: [area, ...graph.nodes],
        assertions: graph.assertions,
        limitations: [],
        truncated: false,
      }).success,
    ).toBe(true);
  } finally {
    fetch.mockRestore();
  }
});
