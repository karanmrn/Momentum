import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { buildImportPlan } from "./sources.js";
import { importArtifact, inspectArtifact, type StoreClient } from "./import.js";

/** Connection URL options must not replace the explicit TLS certificate checks. */
export function researchConnectionString(value: string): string {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("invalid_database_protocol");
  for (const name of url.searchParams.keys()) {
    if (
      name.toLowerCase().startsWith("ssl") ||
      name.toLowerCase() === "uselibpqcompat"
    )
      throw new Error("database_tls_override");
  }
  return url.toString();
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args[0] !== "--source-root" ||
    !args[1] ||
    (args.length !== 2 && !(args.length === 3 && args[2] === "--apply"))
  ) {
    throw new Error("invalid_arguments");
  }
  const artifacts = await buildImportPlan(resolve(args[1]));
  if (args[2] !== "--apply") {
    for (const artifact of artifacts)
      console.log(JSON.stringify(await inspectArtifact(artifact)));
    return;
  }
  const connectionString = process.env.RESEARCH_DATABASE_URL;
  if (!connectionString) throw new Error("database_not_configured");
  const connection = new pg.Client({
    connectionString: researchConnectionString(connectionString),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    application_name: "streetwise-research-import",
  });
  try {
    await connection.connect();
    const client: StoreClient = {
      query: (sql, values) => connection.query(sql, values),
    };
    for (const artifact of artifacts) {
      const result = await importArtifact(client, artifact);
      console.log(JSON.stringify({ dataset: artifact.dataset, ...result }));
    }
  } finally {
    await connection.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    // Provider errors can contain connection details or raw source values.
    console.error(
      "Dataset import failed. Check the source files, schema, and database connection.",
    );
    process.exitCode = 1;
  });
}
