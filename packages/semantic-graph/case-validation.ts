import { buildCaseGraph } from "../camden-evidence/index.js";
import { camdenExampleIds } from "../camden-evidence/session.js";
import type { SemanticGraph } from "./schema.js";

type Node = SemanticGraph["nodes"][number];
type Assertion = SemanticGraph["assertions"][number];
const caseTypes = new Set([
  "SourceSnapshot",
  "PoliceRecord",
  "ResearchArea",
  "AreaContext",
  "FictionalObservation",
  "FictionalSummary",
]);
const canonicalNodes = new Map<string, Node[]>();
const canonicalAssertions = new Map<string, Assertion[]>();

// These are the existing, validated fixed exercises. No source is fetched here.
for (const example of camdenExampleIds) {
  for (const state of ["original", "corrected"] as const) {
    const graph = buildCaseGraph(example, state);
    for (const node of graph.nodes) {
      const projected: Node = {
        id: node.id,
        type: node.type,
        label: node.label,
        synthetic: node.synthetic,
        provenance: node.provenance
          ? {
              sourceId: node.provenance.sourceFamilyId,
              sourceFamilyId: node.provenance.sourceFamilyId,
              sourceUrl: node.provenance.sourceUrl,
              fetchedAt: node.provenance.fetchedAt,
              originGroupId: node.provenance.originGroupId,
              snapshotSha256: node.provenance.snapshotSha256,
            }
          : null,
        metadata: {
          revision: node.revision,
          precision: node.precision,
          ...(node.observedAt ? { observedAt: node.observedAt } : {}),
          ...(node.reportedAt ? { reportedAt: node.reportedAt } : {}),
          ...(node.correctionNote
            ? { correctionNote: node.correctionNote }
            : {}),
        },
      };
      canonicalNodes.set(node.id, [
        ...(canonicalNodes.get(node.id) ?? []),
        projected,
      ]);
    }
    for (const assertion of graph.assertions) {
      const {
        sourceFamilyId,
        originGroupId,
        revision,
        recordedAt,
        validFrom,
        validTo,
        timePrecision,
        spatialPrecision,
        relationStatus,
        independence,
        ...base
      } = assertion;
      const projected: Assertion = {
        ...base,
        metadata: {
          sourceFamilyId,
          originGroupId,
          revision,
          recordedAt,
          validFrom,
          validTo,
          timePrecision,
          spatialPrecision,
          relationStatus,
          independence,
        },
      };
      canonicalAssertions.set(assertion.id, [
        ...(canonicalAssertions.get(assertion.id) ?? []),
        projected,
      ]);
    }
  }
}

/** Case qualifications cannot be downgraded by changing the declared method. */
export function caseProjectionError(graph: SemanticGraph): string | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    const expected = canonicalNodes.get(node.id);
    if (
      (caseTypes.has(node.type) || expected) &&
      !expected?.some((candidate) => sameData(node, candidate))
    )
      return "Case nodes must preserve their validated source or fictional revision.";
  }
  for (const assertion of graph.assertions) {
    const subject = nodes.get(assertion.subjectId);
    const object = nodes.get(assertion.objectId);
    const casePair = [
      "PoliceRecord",
      "AreaContext",
      "FictionalObservation",
      "FictionalSummary",
    ].includes(subject?.type ?? "");
    const expected = canonicalAssertions.get(assertion.id);
    if (
      (casePair ||
        expected ||
        assertion.methodVersion === "camden-case-study/1") &&
      !expected?.some((candidate) => sameData(assertion, candidate))
    )
      return "Case assertions must preserve their validated method, lineage, precision, and interval.";
    if (casePair && assertion.synthetic && assertion.metadata) {
      const observation =
        subject?.type === "FictionalObservation" ? subject : object;
      if (
        assertion.metadata.revision !== observation?.metadata.revision ||
        assertion.metadata.validFrom !== observation?.metadata.observedAt ||
        assertion.metadata.recordedAt !== observation?.metadata.reportedAt
      )
        return "Case assertions must match the selected fictional revision.";
    }
  }
  return null;
}

function sameData(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (
    !actual ||
    !expected ||
    typeof actual !== "object" ||
    typeof expected !== "object"
  )
    return false;
  if (Array.isArray(actual) || Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => sameData(value, expected[index]))
    );
  const record = actual as Record<string, unknown>,
    reference = expected as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length === Object.keys(reference).length &&
    keys.every(
      (key) =>
        Object.hasOwn(reference, key) && sameData(record[key], reference[key]),
    )
  );
}
