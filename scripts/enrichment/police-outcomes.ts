import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  collectPoliceOutcomes,
  expectedCrimeSchema,
} from "../../packages/enrichment/police-outcomes.js";

export async function collectSelectedCamdenOutcomes(root = process.cwd()) {
  const input = JSON.parse(
    await readFile(
      resolve(root, "research/camden-evidence/police-records.json"),
      "utf8",
    ),
  );
  const selected = z
    .object({
      records: z
        .array(
          z.object({
            exampleId: z.string(),
            raw: z.object({
              persistent_id: z.string(),
              category: z.string(),
              month: z.string(),
            }),
          }),
        )
        .length(5),
    })
    .parse(input);
  const expected = selected.records.map((row) =>
    expectedCrimeSchema.parse({
      exampleId: row.exampleId,
      persistentId: row.raw.persistent_id,
      category: row.raw.category,
      month: row.raw.month,
    }),
  );
  const collection = await collectPoliceOutcomes(expected);
  const target = resolve(root, "research/enrichment/police-outcomes.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(`${target}.tmp`, JSON.stringify(collection, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(`${target}.tmp`, target);
  return collection.results.map((result) => ({
    exampleId: result.expectedCrime.exampleId,
    status: result.status,
    outcomes: result.outcomes?.length ?? null,
  }));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  collectSelectedCamdenOutcomes()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch(() => {
      console.error(
        "Police outcome collection failed. No source response content was logged.",
      );
      process.exitCode = 1;
    });
}
