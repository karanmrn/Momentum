import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { recordSchema, monthSchema } from '../../../services/ingestion/src/police/types';

export const anchors = [
  { id: 'hounslow_town_centre', lat: 51.4683, lng: -0.3618 },
  { id: 'camden_town', lat: 51.5392, lng: -0.1426 },
  { id: 'west_croydon', lat: 51.3784, lng: -0.1023 },
] as const;
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const recordsSchema = z.array(recordSchema).max(10000);
const monthsSchema = z.array(z.object({ date: monthSchema })).min(1).max(1200);
const base = 'https://data.police.uk/api/';
export function sourceUrl(area: typeof anchors[number], month: string) {
  return `${base}crimes-street/all-crime?date=${monthSchema.parse(month)}&lat=${area.lat}&lng=${area.lng}`;
}
export function validateRecords(bytes: Uint8Array, month: string) {
  const rows = recordsSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (rows.some(row => row.month !== month)) throw new Error('month_mismatch');
  return rows;
}
async function save(path: string, data: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.tmp`, data, { mode: 0o600 });
  await chmod(`${path}.tmp`, 0o600);
  await rename(`${path}.tmp`, path);
}
class SourceError extends Error {
  constructor(public code: string, public retryAfterSeconds?: number) { super(code); }
}
export function createTransport(fetchImpl: typeof fetch = fetch, delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))) {
  return async (url: string, limit: number): Promise<Buffer> => {
    if (!url.startsWith(base)) throw new Error('invalid_source');
    for (let attempt = 0; attempt < 2; attempt++) {
      await delay(attempt ? 2000 : 150);
      const controller = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); reject(new SourceError('timeout')); }, 15000);
      });
      try {
        return await Promise.race([deadline, (async () => {
          const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } });
          if (response.status === 429) {
            const header = response.headers.get('retry-after');
            const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : undefined;
            void response.body?.cancel().catch(() => {});
            throw new SourceError('rate_limited', seconds !== undefined && Number.isFinite(seconds) ? Math.max(0, seconds) : undefined);
          }
          if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); throw new SourceError(response.status >= 500 ? 'source_unavailable' : 'source_rejected'); }
          if (!response.body) throw new SourceError('empty_body');
          reader = response.body.getReader();
          const chunks: Uint8Array[] = []; let size = 0;
          while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) throw new SourceError('response_too_large'); chunks.push(part.value); }
          return Buffer.concat(chunks, size);
        })()]);
      } catch (error) {
        const failure = error instanceof SourceError ? error : new SourceError('network_failure');
        if (failure.code === 'rate_limited' || !['source_unavailable', 'timeout', 'network_failure'].includes(failure.code) || attempt === 1) throw failure;
      } finally { if (timer) clearTimeout(timer); void reader?.cancel().catch(() => {}); }
    }
    throw new SourceError('source_unavailable');
  };
}

export function sanitizeStatus(status: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(status)) {
    if (['recordCount', 'recordsStored', 'outcomeStatusCount', 'outcomeCounts', 'btpRecords', 'absentPersistentIds'].includes(key)) continue;
    sanitized[key] = Array.isArray(value)
      ? value.map(item => item && typeof item === 'object' ? sanitizeStatus(item as Record<string, unknown>) : item)
      : value && typeof value === 'object' ? sanitizeStatus(value as Record<string, unknown>) : value;
  }
  return sanitized;
}

export async function collect(options: { root?: string; statusPath?: string; transport?: ReturnType<typeof createTransport> } = {}) {
  const root = resolve(options.root ?? '.data/datasets/police');
  const statusPath = resolve(options.statusPath ?? 'research/datasets/police-status.json');
  const transport = options.transport ?? createTransport();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  const metadata = await transport(`${base}crimes-street-dates`, 128 * 1024);
  const months = monthsSchema.parse(JSON.parse(metadata.toString('utf8'))).map(row => row.date).sort();
  if (new Set(months).size !== months.length) throw new Error('duplicate_metadata_month');
  await save(resolve(root, 'availability.json'), metadata);
  const scopes: Array<Record<string, unknown>> = [];
  let halted = false;
  for (const month of months) {
    for (const area of anchors) {
      const url = sourceUrl(area, month);
      const rawPath = resolve(root, area.id, `${month}.json`);
      const manifestPath = resolve(root, area.id, `${month}.manifest.json`);
      try {
        if (halted) { scopes.push({ area: area.id, month, status: 'not_attempted', code: 'rate_limit_halt' }); continue; }
        let bytes: Buffer | undefined; let fetchedAt: string | undefined; let resumed = false;
        try {
          const prior = JSON.parse(await readFile(manifestPath, 'utf8'));
          const stored = await readFile(rawPath);
          if (prior.sourceUrl === url && prior.sha256 === sha(stored) && prior.month === month && prior.area === area.id && prior.publicationAllowed === false && typeof prior.fetchedAt === 'string') {
            validateRecords(stored, month); bytes = stored; fetchedAt = prior.fetchedAt; resumed = true;
          }
        } catch { /* Missing or invalid checkpoints must be fetched again. */ }
        if (!bytes) { bytes = await transport(url, 10 * 1024 * 1024); fetchedAt = new Date().toISOString(); }
        const rows = validateRecords(bytes, month);
        const outcomes: Record<string, number> = Object.create(null);
        for (const row of rows) { const outcome = row.outcome_status?.category ?? 'not_provided'; outcomes[outcome] = (outcomes[outcome] ?? 0) + 1; }
        const manifest = { schemaVersion: '1.0', parserVersion: 'police-research/1', area: area.id, month, sourceUrl: url, fetchedAt, sha256: sha(bytes), recordCount: rows.length, outcomeCounts: outcomes,
          btpRecords: rows.filter(row => row.location_type === 'BTP').length, absentPersistentIds: rows.filter(row => !row.persistent_id).length,
          geography: { type: 'source_default_circle', radiusMiles: 1, center: [area.lng, area.lat] }, scope: 'research_only', approvedPilotBoundary: false, publicationAllowed: false, alertEligible: false, synthetic: false, coverage: 'complete_response' };
        if (!resumed) await save(rawPath, bytes);
        await save(manifestPath, JSON.stringify(manifest, null, 2));
        scopes.push({ area: area.id, month, status: 'downloaded', recordCount: rows.length, outcomeStatusCount: rows.filter(row => row.outcome_status != null).length, sha256: manifest.sha256, fetchedAt, sourceUrl: url, resumed });
        process.stdout.write(`${area.id} ${month} ${rows.length} ${resumed ? 'resumed' : 'saved'}\n`);
      } catch (error) {
        const code = error instanceof SourceError ? error.code : 'invalid_response';
        scopes.push({ area: area.id, month, status: 'failed', code, ...(error instanceof SourceError && error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
        if (code === 'rate_limited') halted = true;
      }
      await save(resolve(root, 'checkpoint.json'), JSON.stringify({ startedAt, scopes }, null, 2));
    }
  }
  const downloaded = scopes.filter(row => row.status === 'downloaded');
  const areas = anchors.map(area => {
    const areaScopes = scopes.filter(row => row.area === area.id);
    const acquired = areaScopes.filter(row => row.status === 'downloaded');
    return { areaId: area.id, requestedMonths: months, downloadedMonths: acquired.map(row => row.month),
      recordCount: acquired.reduce((sum, row) => sum + Number(row.recordCount), 0),
      outcomeStatusCount: acquired.reduce((sum, row) => sum + Number(row.outcomeStatusCount), 0),
      failedMonths: areaScopes.filter(row => row.status !== 'downloaded').map(row => ({ month: row.month, status: row.status, code: row.code })),
      sourceUrls: acquired.map(row => row.sourceUrl), retrievedAt: acquired.map(row => String(row.fetchedAt)).sort().at(-1) ?? null,
      status: acquired.length === months.length ? 'downloaded' : acquired.length ? 'partial' : 'unavailable',
      geometryMethod: 'police_uk_default_one_mile_radius', center: [area.lng, area.lat], scope: 'research_only',
      approvedPilotBoundary: false, publicationAllowed: false, alertEligible: false,
      licence: { name: 'Open Government Licence v3.0', url: 'https://data.police.uk/about/' } };
  });
  const status = { areas, schemaVersion: '1.0', source: 'Police.uk', scope: 'research_only', geography: 'Source-defined one-mile circles around project anchors; not approved pilot boundaries.', publicationAllowed: false, alertEligible: false, synthetic: false,
    startedAt, finishedAt: new Date().toISOString(), availableMonths: months, metadataSha256: sha(metadata), expectedScopes: months.length * anchors.length, downloadedScopes: downloaded.length,
    recordsStored: downloaded.reduce((sum, row) => sum + Number(row.recordCount), 0), missingScopes: scopes.filter(row => row.status !== 'downloaded'), scopes };
  await save(resolve(root, 'manifest.json'), JSON.stringify(status, null, 2));
  await save(statusPath, JSON.stringify(sanitizeStatus(status), null, 2));
  return status;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  collect().then(result => { console.log(JSON.stringify({ downloadedScopes: result.downloadedScopes, expectedScopes: result.expectedScopes, recordsStored: result.recordsStored, missingScopes: result.missingScopes })); if (result.missingScopes.length) process.exitCode = 1; }).catch(error => { console.error(error instanceof SourceError ? error.code : 'collection_failed'); process.exitCode = 1; });
}
