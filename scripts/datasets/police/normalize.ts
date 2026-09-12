import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { anchors, sourceUrl, validateRecords } from './collect';
import { monthSchema } from '../../../services/ingestion/src/police/types';

const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const scopeSchema = z.object({ area: z.enum(['hounslow_town_centre', 'camden_town', 'west_croydon']), month: monthSchema, status: z.literal('downloaded'), sha256: z.string().regex(/^[a-f0-9]{64}$/), sourceUrl: z.string(), fetchedAt: z.string().datetime({ offset: true }), recordCount: z.number().int().min(0).max(10000) });
const manifestSchema = scopeSchema.omit({ status: true }).extend({ scope: z.literal('research_only'), approvedPilotBoundary: z.literal(false), publicationAllowed: z.literal(false), alertEligible: z.literal(false), synthetic: z.literal(false), geography: z.object({ type: z.literal('source_default_circle'), radiusMiles: z.literal(1), center: z.tuple([z.number(), z.number()]) }) });

/** Normalization retains source multiplicity. Public identifiers are not case references. */
export function normalizeSnapshot(bytes: Uint8Array, input: unknown) {
  const manifest = manifestSchema.parse(input);
  const anchor = anchors.find(area => area.id === manifest.area)!;
  if (manifest.sourceUrl !== sourceUrl(anchor, manifest.month) || manifest.geography.center[0] !== anchor.lng || manifest.geography.center[1] !== anchor.lat) throw new Error('source_scope_mismatch');
  if (digest(bytes) !== manifest.sha256) throw new Error('source_checksum_mismatch');
  const rows = validateRecords(bytes, manifest.month);
  if (rows.length !== manifest.recordCount) throw new Error('source_count_mismatch');
  return rows.map((row, index) => ({
    schemaVersion: '1.0', id: digest(`${manifest.sourceUrl}\n${manifest.sha256}\n${index}`), kind: 'historical_police_record', pilotId: manifest.area,
    sourceFamilyId: 'police-uk', sourceSnapshot: manifest.sha256, sourceRecordKey: row.persistent_id || null,
    apiRecordId: row.id ?? null, sourceUrl: manifest.sourceUrl, fetchedAt: manifest.fetchedAt, observedMonth: row.month,
    spatialPrecision: 'anonymised_point', timePrecision: 'month',
    location: { latitude: Number(row.location.latitude), longitude: Number(row.location.longitude) },
    category: row.category, locationType: row.location_type, outcomeStatus: row.outcome_status ?? null,
    queryGeography: 'source_defined_one_mile_research_circle', publicationAllowed: false, alertEligible: false, synthetic: false,
  }));
}

export async function normalize(rootInput = '.data/datasets/police') {
  const root = resolve(rootInput);
  const summary = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const scopes = z.array(scopeSchema).max(3600).parse(summary.scopes);
  if (scopes.length !== summary.expectedScopes || new Set(scopes.map(scope => `${scope.area}/${scope.month}`)).size !== scopes.length) throw new Error('incomplete_or_duplicate_scopes');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = resolve(root, 'evidence.jsonl.tmp');
  const target = resolve(root, 'evidence.jsonl');
  const handle = await open(temporary, 'w', 0o600);
  await chmod(temporary, 0o600);
  const checksum = createHash('sha256'); let count = 0; let byteCount = 0;
  const areaCounts: Record<string, number> = {};
  try {
    for (const scope of scopes) {
      const path = resolve(root, scope.area, scope.month);
      const bytes = await readFile(`${path}.json`);
      const manifest = manifestSchema.parse(JSON.parse(await readFile(`${path}.manifest.json`, 'utf8')));
      if (manifest.area !== scope.area || manifest.month !== scope.month || manifest.sha256 !== scope.sha256 || manifest.sourceUrl !== scope.sourceUrl || manifest.fetchedAt !== scope.fetchedAt || manifest.recordCount !== scope.recordCount) throw new Error('manifest_scope_mismatch');
      const rows = normalizeSnapshot(bytes, manifest);
      for (const row of rows) {
        const line = Buffer.from(`${JSON.stringify(row)}\n`);
        await handle.writeFile(line);
        checksum.update(line); byteCount += line.byteLength; count++;
      }
      areaCounts[scope.area] = (areaCounts[scope.area] ?? 0) + rows.length;
    }
    await handle.sync();
    await handle.close();
    await rename(temporary, target);
    const result = { schemaVersion: '1.0', parserVersion: 'police-evidence/1', sourceScopes: scopes.length, recordCount: count, areaCounts, sha256: checksum.digest('hex'), bytes: byteCount, normalizedAt: new Date().toISOString(), publicationAllowed: false, alertEligible: false, synthetic: false, queryGeography: 'source_defined_one_mile_research_circle' };
    const meta = await open(resolve(root, '.normalization.json.tmp'), 'w', 0o600);
    try { await meta.writeFile(JSON.stringify(result, null, 2)); await meta.sync(); } finally { await meta.close(); }
    await rename(resolve(root, '.normalization.json.tmp'), resolve(root, '.normalization.json'));
    return result;
  } catch (error) { await handle.close().catch(() => {}); await rm(temporary, { force: true }); throw error; }
}

/** Check the entire normalized file without loading it into memory. */
export async function verifyNormalized(path: string) {
  const hash = createHash('sha256'); let lines = 0;
  for await (const part of createReadStream(path)) { const bytes = Buffer.from(part); hash.update(bytes); for (const byte of bytes) if (byte === 10) lines++; }
  return { lines, sha256: hash.digest('hex') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  normalize().then(result => console.log(JSON.stringify(result))).catch(() => { console.error('normalization_failed'); process.exitCode = 1; });
}
