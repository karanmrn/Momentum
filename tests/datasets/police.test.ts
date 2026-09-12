import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anchors, collect, createTransport, sourceUrl, validateRecords } from '../../scripts/datasets/police/collect';
const record = { category: 'robbery', id: null, persistent_id: null, month: '2026-07', location_type: 'BTP', location: { latitude: '51.539', longitude: '-0.142', street: { id: 1, name: 'On or near station' } }, outcome_status: { category: 'Under investigation', date: '2026-07' } };
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); vi.useRealTimers(); });
describe('Police research collector', () => {
  it('preserves repeated null IDs and BTP records while checking month and coordinates', () => {
    expect(validateRecords(Buffer.from(JSON.stringify([record, record])), '2026-07')).toHaveLength(2);
    expect(() => validateRecords(Buffer.from(JSON.stringify([record])), '2026-06')).toThrow();
    expect(sourceUrl(anchors[0], '2026-07')).toBe('https://data.police.uk/api/crimes-street/all-crime?date=2026-07&lat=51.4683&lng=-0.3618');
    expect(() => sourceUrl(anchors[0], '2026-99')).toThrow();
  });
  it('saves exact raw bytes privately and resumes without downloading records again', async () => {
    const root = await mkdtemp(join(tmpdir(), 'police-')); dirs.push(root);
    const raw = Buffer.from(JSON.stringify([record, record]));
    const transport = vi.fn(async (url: string) => url.endsWith('crimes-street-dates') ? Buffer.from('[{"date":"2026-07"}]') : raw);
    const options = { root, statusPath: join(root, 'status.json'), transport };
    const result = await collect(options);
    expect(result.downloadedScopes).toBe(3);
    expect(result.recordsStored).toBe(6);
    expect(result.areas[0]).toMatchObject({ recordCount: 2, outcomeStatusCount: 2, status: 'downloaded', publicationAllowed: false, approvedPilotBoundary: false });
    expect(await readFile(join(root, anchors[0].id, '2026-07.json'))).toEqual(raw);
    expect((await stat(join(root, anchors[0].id, '2026-07.json'))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(root, 'status.json'), 'utf8')).not.toMatch(/recordCount|recordsStored|outcomeStatusCount|outcomeCounts/);
    const manifest = JSON.parse(await readFile(join(root, anchors[0].id, '2026-07.manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ publicationAllowed: false, scope: 'research_only', approvedPilotBoundary: false, btpRecords: 2, absentPersistentIds: 2, outcomeCounts: { 'Under investigation': 2 } });
    transport.mockClear();
    expect((await collect(options)).recordsStored).toBe(6);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('halts all further requests after a rate limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'police-')); dirs.push(root);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ date: '2026-07' }])).mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '120' } }));
    const result = await collect({ root, statusPath: join(root, 'status.json'), transport: createTransport(fetchImpl, async () => {}) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.missingScopes).toHaveLength(3);
    expect(result.missingScopes[0]).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 120 });
  });
  it('retries transient errors once and bounds streamed bytes', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response('[]'));
    expect((await createTransport(fetchImpl, async () => {})('https://data.police.uk/api/crimes-street-dates', 128)).toString()).toBe('[]');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    fetchImpl.mockResolvedValueOnce(new Response('1234'));
    await expect(createTransport(fetchImpl, async () => {})('https://data.police.uk/api/crimes-street-dates', 3)).rejects.toThrow('response_too_large');
  });
});
