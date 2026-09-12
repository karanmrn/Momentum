import { readFile, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  importMpsBoroughCsv,
  MPS_LIMITS,
} from "../../packages/enrichment/mps-context.js";
export async function importLocalMpsContext(
  csvPath: string,
  manifestPath: string,
  root = process.cwd(),
) {
  const file = resolve(csvPath),
    manifestFile = resolve(manifestPath);
  if (
    (await stat(file)).size > MPS_LIMITS.maxBytes ||
    (await stat(manifestFile)).size > 8192
  )
    throw new Error("MPS local input exceeds bounds.");
  const data = await importMpsBoroughCsv(
    await readFile(file),
    JSON.parse(await readFile(manifestFile, "utf8")),
  );
  const target = resolve(root, "research/enrichment/mps-context.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(`${target}.tmp`, JSON.stringify(data, null, 2) + "\n");
  await rename(`${target}.tmp`, target);
  return {
    months: data.months.length,
    selectedCells: data.cells.length,
    sourceRows: data.source.sourceRowCount,
    sourceHash: data.source.sha256,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error(
      "Usage: mps-context.ts <official-download.csv> <manifest.json>",
    );
    process.exitCode = 1;
  } else
    importLocalMpsContext(args[0], args[1])
      .then((value) => console.log(JSON.stringify(value)))
      .catch(() => {
        console.error(
          "MPS import failed validation. No output dataset was published.",
        );
        process.exitCode = 1;
      });
}
