import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { PoliceSourceError } from '../../services/ingestion/src/police/client';
import { validateSnapshot } from '../../packages/history/src/index';
import { validateArea, scopeKey } from '../../services/ingestion/src/police/geometry';
import { monthSchema, type PoliceClient } from '../../services/ingestion/src/police/types';

const entrySchema = z.object({ status: z.enum(['available', 'missing', 'unavailable']), code: z.string().optional(), checksum: z.string().optional(), fetchedAt: z.string().optional(), retryAfterSeconds: z.number().int().min(0).max(3600).optional() }).strict();
export const checkpointSchema = z.object({ schemaVersion: z.literal('1.0'), scopeKey: z.string(), publicationAllowed: z.literal(false), availability: z.object({months:z.array(monthSchema).max(1200),fetchedAt:z.string().datetime({offset:true}),checksum:z.string().regex(/^[a-f0-9]{64}$/),sourceUrl:z.string().url()}).strict().optional(), months: z.record(monthSchema, entrySchema) }).strict();
export type Checkpoint = z.infer<typeof checkpointSchema>;

function retryMetadata(value: number | undefined): {retryAfterSeconds?: number} {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? {retryAfterSeconds:Math.min(3600, Math.ceil(value))} : {};
}

async function atomicWrite(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => undefined); }
}

export function monthRange(start: string, end: string): string[] {
  monthSchema.parse(start); monthSchema.parse(end);
  if (start > end) throw new Error('Start month must precede end month.');
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    if (months.length > 36) throw new Error('Select at most 36 months.');
    const [year, month] = cursor.split('-').map(Number);
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  return months;
}

export async function runBackfill(input: {area: unknown; months: string[]; outputDir: string; client: PoliceClient}): Promise<Checkpoint> {
  const area = validateArea(input.area);
  const months = z.array(monthSchema).min(1).max(36).parse(input.months);
  if (new Set(months).size !== months.length) throw new Error('Months must be unique.');
  const scope = scopeKey(area);
  const directory = join(input.outputDir, scope);
  await mkdir(directory, {recursive: true, mode: 0o700});
  await chmod(directory, 0o700);
  const lockPath = join(directory, '.lock');
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('Scope is locked. Check whether another import is active.'); });
  const path = join(directory, 'checkpoint.json');
  try {
    let checkpoint: Checkpoint;
    try { checkpoint = checkpointSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      checkpoint = {schemaVersion:'1.0',scopeKey:scope,publicationAllowed:false,months:{}};
    }
    if (checkpoint.scopeKey !== scope) throw new Error('Checkpoint scope does not match.');
    // Invalidate all requested months before discovery. A failed refresh cannot expose stale results.
    for (const month of months) checkpoint.months[month] = {status:'unavailable',code:'refresh_pending'};
    delete checkpoint.availability;
    await atomicWrite(path, checkpoint);
    let availability;
    try { availability = checkpointSchema.shape.availability.unwrap().parse(await input.client.availability()); }
    catch (error) {
      const limited = error instanceof PoliceSourceError && error.code === 'rate_limited';
      for (const month of months) checkpoint.months[month] = {status:'unavailable',code:limited ? 'rate_limited' : 'availability_failed',...(limited ? retryMetadata(error.retryAfterSeconds) : {})};
      await atomicWrite(path, checkpoint);
      return checkpoint;
    }
    checkpoint.availability = availability;
    await atomicWrite(path, checkpoint);
    for (const month of months) {
      try {
        if (!availability.months.includes(month)) {
          checkpoint.months[month] = {status:'missing',code:'month_not_published'};
        } else {
          const categories = await input.client.categories(month);
          const result = await input.client.month(area, month, availability, categories);
          if (result.status === 'available') {
            const snapshot = validateSnapshot(result.snapshot);
            if (snapshot.scopeKey !== scope || snapshot.month !== month || scopeKey(validateArea(snapshot.area)) !== scope) throw new Error('Snapshot scope mismatch.');
            const revisionsRoot = join(directory, 'revisions');
            const revisionsDirectory = join(revisionsRoot, month);
            await mkdir(revisionsDirectory, {recursive:true, mode:0o700});
            await chmod(revisionsRoot, 0o700);
            await chmod(revisionsDirectory, 0o700);
            const revisionPath = join(revisionsDirectory, `${snapshot.checksum}-${snapshot.taxonomyChecksum}.json`);
            let validRevision = false;
            try {
              const revision = validateSnapshot(JSON.parse(await readFile(revisionPath, 'utf8')));
              validRevision = revision.scopeKey === scope && revision.month === month && revision.checksum === snapshot.checksum && revision.taxonomyChecksum === snapshot.taxonomyChecksum && revision.recordsChecksum === snapshot.recordsChecksum && revision.synthetic === snapshot.synthetic;
            } catch { /* Repair missing or corrupt revision evidence from this validated response. */ }
            if (!validRevision) await atomicWrite(revisionPath, snapshot);
            await chmod(revisionPath, 0o600);
            const snapshotPath = join(directory, `${month}.json`);
            let same = false;
            try {
              const previous = validateSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')));
              same = previous.checksum === snapshot.checksum && previous.taxonomyChecksum === snapshot.taxonomyChecksum && previous.scopeKey === scope && previous.month === month && previous.synthetic === snapshot.synthetic && previous.recordsChecksum === snapshot.recordsChecksum;
            } catch { /* Replace absent or invalid prior evidence. */ }
            if (!same) await atomicWrite(snapshotPath, snapshot);
            await chmod(snapshotPath, 0o600);
            checkpoint.months[month] = {status:'available',checksum:snapshot.checksum,fetchedAt:snapshot.fetchedAt};
          } else {
            if (result.month !== month) throw new Error('Result month mismatch.');
            checkpoint.months[month] = {status:result.status,code:result.code,...retryMetadata(result.retryAfterSeconds)};
          }
        }
      } catch (error) {
        const limited = error instanceof PoliceSourceError && error.code === 'rate_limited';
        checkpoint.months[month] = {status:'unavailable',code:limited ? 'rate_limited' : 'month_failed',...(limited ? retryMetadata(error.retryAfterSeconds) : {})};
      }
      if (checkpoint.months[month].code === 'rate_limited') {
        const delay = retryMetadata(checkpoint.months[month].retryAfterSeconds);
        for (const remaining of months.slice(months.indexOf(month))) checkpoint.months[remaining] = {status:'unavailable',code:'rate_limited',...delay};
        await atomicWrite(path, checkpoint);
        break;
      }
      await atomicWrite(path, checkpoint);
    }
    return checkpoint;
  } finally { await lock.close(); await unlink(lockPath); }
}

export async function readBackfill(outputDir: string, inputArea: unknown, inputMonths: string[]): Promise<import('../../services/ingestion/src/police/types').MonthResult[]> {
  const area = validateArea(inputArea);
  const scope = scopeKey(area);
  const months = z.array(monthSchema).min(1).max(36).parse(inputMonths);
  const directory = join(outputDir, scope);
  let checkpoint: Checkpoint;
  try {
    // Do not read while a writer changes the checkpoint or snapshots.
    const lock = await open(join(directory, '.lock'), 'wx', 0o600);
    try {
      checkpoint = checkpointSchema.parse(JSON.parse(await readFile(join(directory, 'checkpoint.json'), 'utf8')));
      if (checkpoint.scopeKey !== scope) throw new Error('Checkpoint scope mismatch.');
      const results: import('../../services/ingestion/src/police/types').MonthResult[] = [];
      for (const month of months) {
        const entry = checkpoint.months[month];
        if (!entry || entry.status !== 'available') {
          results.push({status:entry?.status === 'missing' ? 'missing' : 'unavailable',month,code:entry?.code ?? 'not_imported',...retryMetadata(entry?.retryAfterSeconds)});
          continue;
        }
        try {
          const snapshot = validateSnapshot(JSON.parse(await readFile(join(directory, `${month}.json`), 'utf8')));
          if (snapshot.scopeKey !== scope || snapshot.month !== month || snapshot.checksum !== entry.checksum || scopeKey(validateArea(snapshot.area)) !== scope) throw new Error('Snapshot mismatch.');
          results.push({status:'available',snapshot});
        } catch { results.push({status:'unavailable',month,code:'snapshot_invalid'}); }
      }
      return results;
    } finally { await lock.close(); await unlink(join(directory, '.lock')); }
  } catch { return months.map(month => ({status:'unavailable',month,code:'checkpoint_unavailable'})); }
}
