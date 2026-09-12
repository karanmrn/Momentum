import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createDemoState,
  decideReport,
  withdrawReport,
} from "../../packages/domain";
import {
  loadRelationExamples,
  generateCandidates,
  relationReviewView,
  readRelationReview,
  decideCandidate,
} from "../../packages/relation-review";
import {
  projectSemanticGraph,
  semanticGraphSchema,
} from "../../packages/semantic-graph";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage";
import { toGraphifyGraph } from "../../packages/semantic-graph/graphify";
const area = "camden_town" as const;
it("projects current reviewed pairs without private report references and removes withdrawn links", () => {
  const state = createDemoState();
  loadRelationExamples(
    state,
    "moderator",
    { area, expectedRevision: 1 },
    "fixture-load",
  );
  const reports = state.reports.filter(
    (r) => r.title.includes("Fictional") && r.title.includes("lamp"),
  );
  for (const report of reports)
    decideReport(state, "moderator", report.id, {
      expectedRevision: report.revision,
      action: "approve",
      summary:
        "Reviewed fictional lamp account. Current conditions remain unconfirmed.",
    });
  const copied = reports.find((r) => r.title.includes("copied"))!;
  const copiedNotice = state.notices.find((n) => n.id === copied.noticeId)!;
  expect(copiedNotice.sourceKind).toBe("community_other_source");
  expect(copiedNotice.evidence[0].originGroupId).toBe("camden_town:original-a");
  generateCandidates(
    state,
    "moderator",
    { area, expectedRevision: readRelationReview(state).revision },
    "generate-pairs",
  );
  const candidate = relationReviewView(
    state,
    "moderator",
    area,
  ).candidates.find((c) => c.independence === "unknown")!;
  decideCandidate(
    state,
    "moderator",
    candidate.id,
    {
      area,
      expectedRevision: readRelationReview(state).revision,
      action: "approve",
      reason: "Matching fictional asset interval reviewed.",
    },
    "approve-pair",
  );
  const graph = projectSemanticGraph(state, area, getDatasetCoverage(area));
  const edge = graph.assertions.find(
    (e) => e.predicate === "SAME_OPERATIONAL_ISSUE_AS",
  )!;
  expect(edge).toBeDefined();
  expect(edge.qualification?.independence).toBe("unknown");
  const exported = JSON.stringify(toGraphifyGraph(graph));
  for (const r of reports) expect(exported).not.toContain(r.id);
  const forged = structuredClone(graph);
  forged.assertions.find((e) => e.id === edge.id)!.qualification = undefined;
  expect(semanticGraphSchema.safeParse(forged).success).toBe(false);
  const report = state.reports.find(
    (r) => r.id === candidate.participants[0].reportId,
  )!;
  withdrawReport(state, report.owner, report.id, report.revision);
  expect(
    projectSemanticGraph(state, area, getDatasetCoverage(area)).assertions.some(
      (e) => e.predicate === "SAME_OPERATIONAL_ISSUE_AS",
    ),
  ).toBe(false);
});
it("SQL rejects JSON null and missing qualifications on operational assertions", async () => {
  const db = new PGlite();
  const session = "a".repeat(64);
  try {
    for (const name of [
      "001_demo_sessions.sql",
      "002_semantic_graph.sql",
      "003_camden_graph.sql",
      "004_reviewed_relations.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      "INSERT INTO streetwise_demo_sessions(id,state) VALUES($1,$2)",
      [session, createDemoState()],
    );
    await db.query(
      "INSERT INTO streetwise_semantic_snapshots(session_id,pilot_id,metadata) VALUES($1,$2,$3)",
      [session, area, { ontologyVersion: "1.0" }],
    );
    for (const [i, id] of ["notice-a", "notice-b"].entries())
      await db.query(
        "INSERT INTO streetwise_semantic_nodes(session_id,pilot_id,id,node_type,ordinal,data) VALUES($1,$2,$3,$4,$5,$6)",
        [
          session,
          area,
          id,
          "PublishedNotice",
          i,
          { id, type: "PublishedNotice" },
        ],
      );
    const base = {
      id: "op",
      subjectId: "notice-a",
      objectId: "notice-b",
      predicate: "SAME_OPERATIONAL_ISSUE_AS",
      synthetic: true,
      methodVersion: "fictional-relations/1",
      qualification: {},
    };
    const insert = (data: unknown) =>
      db.query(
        "INSERT INTO streetwise_semantic_assertions(session_id,pilot_id,id,subject_id,subject_type,object_id,object_type,predicate,ordinal,data) VALUES($1,$2,$3,$4,$5,$6,$5,$7,0,$8)",
        [
          session,
          area,
          "op",
          "notice-a",
          "PublishedNotice",
          "notice-b",
          "SAME_OPERATIONAL_ISSUE_AS",
          data,
        ],
      );
    for (const data of [
      { ...base, synthetic: null },
      { ...base, methodVersion: null },
      { ...base, qualification: null },
      { ...base, qualification: undefined },
    ])
      await expect(insert(data)).rejects.toThrow(
        /streetwise_semantic_assertion_pairs/,
      );
    await expect(insert(base)).resolves.toBeDefined();
  } finally {
    await db.close();
  }
});
