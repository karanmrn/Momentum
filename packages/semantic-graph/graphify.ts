import { semanticGraphSchema, type SemanticGraph } from "./schema.js";

/** Read-only interchange projection. Assertions remain distinct graph entities. */
export function toGraphifyGraph(input: SemanticGraph) {
  const graph = semanticGraphSchema.parse(input);
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
    metadata: structuredClone(node),
  }));
  const assertions = graph.assertions.map((assertion) => ({
    id: `assertion:${assertion.id}`,
    label: assertion.predicate,
    type: "QualifiedAssertion",
    metadata: structuredClone(assertion),
  }));
  const identifiers = new Set(nodes.map((node) => node.id));
  if (assertions.some((node) => identifiers.has(node.id)))
    throw new Error("Assertion identifier conflicts with a record.");
  const edges = graph.assertions.flatMap((assertion) => [
    {
      id: `link:${assertion.id}:subject`,
      source: assertion.subjectId,
      target: `assertion:${assertion.id}`,
      relation: "HAS_ASSERTION",
    },
    {
      id: `link:${assertion.id}:object`,
      source: `assertion:${assertion.id}`,
      target: assertion.objectId,
      relation: assertion.predicate,
    },
  ]);
  return {
    directed: true,
    multigraph: false,
    nodes: [...nodes, ...assertions],
    edges,
    metadata: {
      formatVersion: "streetwise-graphify/1",
      ontologyVersion: graph.ontologyVersion,
      pilotId: graph.pilotId,
      limitations: [...graph.limitations],
      truncated: graph.truncated,
      source: "Validated public evidence projection",
    },
  };
}
