import { pilotSchema } from "../packages/contracts/index.js";
import {
  semanticGraphSchema,
  type SemanticGraph,
} from "../packages/semantic-graph/index.js";

export interface SemanticSql {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
function sessionKey(id: string): void {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid session");
}

/** Call inside the session transaction, after locking its authoritative state row. */
export async function replaceSemanticGraph(
  sql: SemanticSql,
  sessionId: string,
  inputs: SemanticGraph[],
): Promise<void> {
  sessionKey(sessionId);
  if (inputs.length > 3) throw new Error("Too many pilot graphs");
  const graphs = inputs.map((input) => semanticGraphSchema.parse(input));
  if (new Set(graphs.map((graph) => graph.pilotId)).size !== graphs.length)
    throw new Error("Duplicate pilot graph");
  await sql.query(
    "DELETE FROM public.streetwise_semantic_snapshots WHERE session_id=$1",
    [sessionId],
  );
  for (const graph of graphs) {
    const { nodes, assertions, ...metadata } = graph;
    await sql.query(
      "INSERT INTO public.streetwise_semantic_snapshots(session_id,pilot_id,metadata) VALUES ($1,$2,$3::jsonb)",
      [sessionId, graph.pilotId, JSON.stringify(metadata)],
    );
    await sql.query(
      `INSERT INTO public.streetwise_semantic_nodes(session_id,pilot_id,id,node_type,ordinal,data)
      SELECT $1,$2,item->>'id',item->>'type',(position-1)::integer,item
      FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS entries(item,position)`,
      [sessionId, graph.pilotId, JSON.stringify(nodes)],
    );
    const types = new Map(nodes.map((node) => [node.id, node.type]));
    const rows = assertions.map((data, ordinal) => ({
      id: data.id,
      subject_id: data.subjectId,
      subject_type: types.get(data.subjectId),
      object_id: data.objectId,
      object_type: types.get(data.objectId),
      predicate: data.predicate,
      ordinal,
      data,
    }));
    await sql.query(
      `INSERT INTO public.streetwise_semantic_assertions(session_id,pilot_id,id,subject_id,subject_type,object_id,object_type,predicate,ordinal,data)
      SELECT $1,$2,id,subject_id,subject_type,object_id,object_type,predicate,ordinal,data
      FROM jsonb_to_recordset($3::jsonb) AS entries(id text,subject_id text,subject_type text,object_id text,object_type text,predicate text,ordinal integer,data jsonb)`,
      [sessionId, graph.pilotId, JSON.stringify(rows)],
    );
  }
}

/** The caller refreshes the projection under the same session row lock before reading. */
export async function readSemanticGraph(
  sql: SemanticSql,
  sessionId: string,
  pilot: unknown,
): Promise<SemanticGraph | null> {
  sessionKey(sessionId);
  const pilotId = pilotSchema.parse(pilot);
  const result = await sql.query<{ graph: unknown }>(
    `SELECT metadata || jsonb_build_object(
      'nodes',COALESCE((SELECT jsonb_agg(n.data ORDER BY n.ordinal) FROM public.streetwise_semantic_nodes n WHERE n.session_id=s.session_id AND n.pilot_id=s.pilot_id),'[]'::jsonb),
      'assertions',COALESCE((SELECT jsonb_agg(a.data ORDER BY a.ordinal) FROM public.streetwise_semantic_assertions a WHERE a.session_id=s.session_id AND a.pilot_id=s.pilot_id),'[]'::jsonb)
    ) AS graph FROM public.streetwise_semantic_snapshots s WHERE s.session_id=$1 AND s.pilot_id=$2`,
    [sessionId, pilotId],
  );
  return result.rows.length
    ? semanticGraphSchema.parse(result.rows[0].graph)
    : null;
}
