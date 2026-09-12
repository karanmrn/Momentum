import { createHash } from 'node:crypto';
import { z } from 'zod';
import { checksumRecords } from './integrity.js';
import { scopeKey, toPolicePolygon, validateArea } from './geometry.js';
import { monthSchema, recordSchema, snapshotSchema, type PoliceClient } from './types.js';

const ROOT = 'https://data.police.uk/api/';
const DEADLINE_MS = 8000;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
const categorySchema = z.string().regex(/^[a-z][a-z-]{0,79}$/);
const categoryResponseSchema = z.array(z.object({ url: categorySchema, name: z.string().min(1).max(200) })).min(1).max(100);
const availabilityResponseSchema = z.array(z.object({ date: monthSchema, 'stop-and-search': z.array(z.string().max(100)).max(100).optional() })).max(1200);

/** Errors contain stable codes, never upstream text or record content. */
export class PoliceSourceError extends Error {
  constructor(public readonly code: string, public readonly retryAfterSeconds?: number) {
    super(code);
    this.name = 'PoliceSourceError';
  }
}

function retryAfter(value: string | null, now: Date): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now.getTime()) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.min(3600, Math.ceil(seconds))) : undefined;
}

export function createPoliceClient(options: { fetchImpl?: typeof fetch; now?: () => Date; synthetic?: boolean } = {}): PoliceClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  async function request(url: string, limit: number): Promise<{ value: unknown; checksum: string; fetchedAt: string }> {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let responseBody: ReadableStream<Uint8Array> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); reject(new PoliceSourceError('timeout')); }, DEADLINE_MS);
    });
    const work = async () => {
      try {
        const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } });
        responseBody = response.body;
        if (response.redirected || (response.status >= 300 && response.status < 400)) throw new PoliceSourceError('redirect_refused');
        if (response.status === 429) throw new PoliceSourceError('rate_limited', retryAfter(response.headers.get('retry-after'), now()));
        if (!response.ok) throw new PoliceSourceError(response.status === 503 ? 'scope_or_source_unavailable' : 'source_unavailable');
        const length = response.headers.get('content-length');
        if (length && Number(length) > limit) throw new PoliceSourceError('response_too_large');
        if (!response.body) throw new PoliceSourceError('invalid_response');
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > limit) throw new PoliceSourceError('response_too_large');
          chunks.push(part.value);
        }
        const bytes = Buffer.concat(chunks, size);
        let value: unknown;
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { throw new PoliceSourceError('invalid_response'); }
        return { value, checksum: hash(bytes), fetchedAt: now().toISOString() };
      } catch (error) {
        if (error instanceof PoliceSourceError) throw error;
        throw new PoliceSourceError(controller.signal.aborted ? 'timeout' : 'source_unavailable');
      } finally {
        if (reader) void reader.cancel().catch(() => {});
        else void responseBody?.cancel().catch(() => {});
      }
    };
    try { return await Promise.race([work(), timeout]); }
    finally { if (timer) clearTimeout(timer); }
  }

  return {
    async availability() {
      const sourceUrl = `${ROOT}crimes-street-dates`;
      const result = await request(sourceUrl, 128 * 1024);
      const parsed = availabilityResponseSchema.safeParse(result.value);
      if (!parsed.success || new Set(parsed.data.map(row => row.date)).size !== parsed.data.length) throw new PoliceSourceError('invalid_response');
      // Available reporting months do not establish force-level completeness.
      return { months: parsed.data.map(row => row.date).sort().reverse(), fetchedAt: result.fetchedAt, checksum: result.checksum, sourceUrl };
    },
    async categories(input) {
      const month = monthSchema.parse(input);
      const sourceUrl = `${ROOT}crime-categories?date=${month}`;
      const result = await request(sourceUrl, 128 * 1024);
      const parsed = categoryResponseSchema.safeParse(result.value);
      if (!parsed.success || new Set(parsed.data.map(row => row.url)).size !== parsed.data.length) throw new PoliceSourceError('invalid_response');
      return { month, categories: parsed.data.map(row => row.url), fetchedAt: result.fetchedAt, checksum: result.checksum, sourceUrl };
    },
    async month(inputArea, inputMonth, available, taxonomy) {
      const area = validateArea(inputArea);
      const month = monthSchema.parse(inputMonth);
      const months = z.array(monthSchema).max(1200).parse(available.months);
      checksumSchema.parse(available.checksum);
      if (!months.includes(month)) return { status: 'missing', month, code: 'month_not_available' };
      if (monthSchema.parse(taxonomy.month) !== month) throw new Error('taxonomy_month_mismatch');
      const categories = z.array(categorySchema).min(1).max(100).parse(taxonomy.categories);
      checksumSchema.parse(taxonomy.checksum);
      const polygon = toPolicePolygon(area);
      const sourceUrl = `${ROOT}crimes-street/all-crime?date=${month}&poly=${encodeURIComponent(polygon)}`;
      if (sourceUrl.length > 4094) throw new Error('polygon_query_too_long');
      try {
        const result = await request(sourceUrl, 10 * 1024 * 1024);
        const parsed = z.array(recordSchema).max(10000).safeParse(result.value);
        if (!parsed.success || parsed.data.some(record => record.month !== month || !categories.includes(record.category))) throw new PoliceSourceError('invalid_response');
        const snapshot = snapshotSchema.parse({
          schemaVersion: '1.0', parserVersion: 'police-street/1', sourceId: 'P01', sourceFamilyId: 'police-uk',
          scopeKey: scopeKey(area), area, month, sourceUrl, fetchedAt: result.fetchedAt, checksum: result.checksum,
          taxonomyChecksum: taxonomy.checksum, recordsChecksum: checksumRecords(parsed.data), records: parsed.data, coverage: 'complete_response',
          synthetic: options.synthetic ?? false, publicationAllowed: false, alertEligible: false,
        });
        return { status: 'available', snapshot };
      } catch (error) {
        const failure = error instanceof PoliceSourceError ? error : new PoliceSourceError('invalid_response');
        return { status: 'unavailable', month, code: failure.code, ...(failure.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: failure.retryAfterSeconds }) };
      }
    },
  };
}
