import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateArea } from '../../services/ingestion/src/police/geometry';
import { createPoliceClient } from '../../services/ingestion/src/police/client';
import { monthRange, runBackfill } from './index';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4) throw new Error('Usage: cli.ts <reviewed-area.json> <start-month> <end-month> <output-directory>');
  const [file, start, end, directory] = args;
  const area = validateArea(JSON.parse(await readFile(resolve(file), 'utf8')));
  const months = monthRange(start, end);
  const checkpoint = await runBackfill({area, months, outputDir:resolve(directory), client:createPoliceClient()});
  const statuses = Object.fromEntries(Object.entries(checkpoint.months).filter(([month]) => months.includes(month)).map(([month, entry]) => [month, entry.status]));
  process.stdout.write(`${JSON.stringify({scopeKey:checkpoint.scopeKey, publicationAllowed:false, months:statuses})}\n`);
  if (Object.values(statuses).some(status => status !== 'available')) process.exitCode = 1;
}
main().catch(() => { process.stderr.write('Backfill blocked or failed. Check approved geometry, month range, output permissions, and scope lock.\n'); process.exitCode = 1; });
