import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { normalize, normalizeSnapshot, verifyNormalized } from '../../scripts/datasets/police/normalize';
const row = { category: 'robbery', persistent_id: null, id: null, month: '2026-07', location_type: 'BTP', location: { latitude: '51.539', longitude: '-0.142', street: { id: 1, name: 'On or near station' } }, outcome_status: null };
const bytes = Buffer.from(JSON.stringify([row, row]));
const manifest = { area: 'camden_town', month: '2026-07', sourceUrl: 'https://data.police.uk/api/crimes-street/all-crime?date=2026-07&lat=51.5392&lng=-0.1426', fetchedAt: '2026-09-12T12:00:00.000Z', sha256: createHash('sha256').update(bytes).digest('hex'), recordCount: 2, scope: 'research_only', approvedPilotBoundary: false, publicationAllowed: false, alertEligible: false, synthetic: false, geography: { type: 'source_default_circle', radiusMiles: 1, center: [-0.1426, 51.5392] } };
it('preserves anonymous multiplicity, stable identity and historical boundaries', () => {
  const first = normalizeSnapshot(bytes, manifest);
  expect(first).toEqual(normalizeSnapshot(bytes, manifest));
  expect(first[0].id).not.toBe(first[1].id);
  expect(first[0]).toMatchObject({ kind: 'historical_police_record', sourceRecordKey: null, apiRecordId: null, locationType: 'BTP', publicationAllowed: false, alertEligible: false, spatialPrecision: 'anonymised_point', timePrecision: 'month' });
});
it('refuses checksum, month, coordinate and source-scope mismatches', () => {
  expect(() => normalizeSnapshot(Buffer.from('[]'), manifest)).toThrow('source_checksum_mismatch');
  expect(() => normalizeSnapshot(bytes, { ...manifest, month: '2026-06' })).toThrow();
  expect(() => normalizeSnapshot(bytes, { ...manifest, area: 'west_croydon' })).toThrow('source_scope_mismatch');
  expect(() => normalizeSnapshot(bytes, { ...manifest, geography: { ...manifest.geography, center: [0, 0] } })).toThrow('source_scope_mismatch');
});
it('writes private atomic JSONL with a verified checksum and rejects a changed manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'police-normalize-'));
  try {
    await mkdir(join(root, 'camden_town'));
    await writeFile(join(root, 'camden_town/2026-07.json'), bytes);
    await writeFile(join(root, 'camden_town/2026-07.manifest.json'), JSON.stringify(manifest));
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ expectedScopes: 1, scopes: [{ ...manifest, status: 'downloaded' }] }));
    const result = await normalize(root);
    expect(result.recordCount).toBe(2);
    expect(await verifyNormalized(join(root, 'evidence.jsonl'))).toEqual({ lines: 2, sha256: result.sha256 });
    expect((await stat(join(root, 'evidence.jsonl'))).mode & 0o777).toBe(0o600);
    const original = await readFile(join(root, 'evidence.jsonl'));
    await writeFile(join(root, 'camden_town/2026-07.manifest.json'), JSON.stringify({ ...manifest, recordCount: 3 }));
    await expect(normalize(root)).rejects.toThrow('manifest_scope_mismatch');
    expect(await readFile(join(root, 'evidence.jsonl'))).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
