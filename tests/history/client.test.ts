import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checksumRecords } from '../../services/ingestion/src/police/integrity';
import { createPoliceClient } from '../../services/ingestion/src/police/client';
import type { ApprovedArea, Availability, CategoryList, PoliceRecord } from '../../services/ingestion/src/police/types';

const date = '2026-09-12T12:00:00.000Z';
const area: ApprovedArea = { pilotId: 'camden_town', boundaryVersion: 'synthetic-1', boundaryStatus: 'approved', reviewedBy: 'synthetic-test', reviewedAt: date, crs: 'EPSG:4326', geometry: { type: 'Polygon', coordinates: [[[-0.145, 51.538], [-0.14, 51.538], [-0.14, 51.541], [-0.145, 51.541], [-0.145, 51.538]]] } };
const available: Availability = { months: ['2026-07'], checksum: 'a'.repeat(64), fetchedAt: date, sourceUrl: 'https://data.police.uk/api/crimes-street-dates' };
const taxonomy: CategoryList = { month: '2026-07', categories: ['robbery', 'anti-social-behaviour'], checksum: 'b'.repeat(64), fetchedAt: date, sourceUrl: 'https://data.police.uk/api/crime-categories?date=2026-07' };
const record: PoliceRecord = { category: 'robbery', persistent_id: null, id: null, month: '2026-07', location_type: 'BTP', location: { latitude: '51.539', longitude: '-0.142', street: { id: 1, name: 'On or near station' } }, outcome_status: null };
function setup(response: () => Response | Promise<Response>, synthetic = true) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response());
  return { fetchImpl, client: createPoliceClient({ fetchImpl, now: () => new Date(date), synthetic }) };
}
afterEach(() => vi.useRealTimers());

describe('Police.uk client', () => {
  it('reads month metadata and month-specific taxonomy from fixed official URLs', async () => {
    const { client, fetchImpl } = setup(() => Response.json([{ date: '2026-07', 'stop-and-search': ['btp'] }]));
    expect((await client.availability()).months).toEqual(['2026-07']);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://data.police.uk/api/crimes-street-dates');
    fetchImpl.mockResolvedValueOnce(Response.json([{ url: 'robbery', name: 'Robbery' }]));
    expect(await client.categories('2026-07')).toMatchObject({ month: '2026-07', categories: ['robbery'] });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://data.police.uk/api/crime-categories?date=2026-07');
  });

  it('preserves multiplicity, null IDs, BTP and raw-byte provenance', async () => {
    const raw = JSON.stringify([record, record]);
    const { client, fetchImpl } = setup(() => new Response(raw));
    const result = await client.month(area, '2026-07', available, taxonomy);
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.snapshot.records).toHaveLength(2);
    expect(result.snapshot).toMatchObject({ checksum: createHash('sha256').update(raw).digest('hex'), taxonomyChecksum: taxonomy.checksum, recordsChecksum: checksumRecords([record, record]), fetchedAt: date, synthetic: true, publicationAllowed: false, alertEligible: false });
    expect(result.snapshot.records[0]).toMatchObject({ persistent_id: null, id: null, location_type: 'BTP' });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin).toBe('https://data.police.uk');
    expect(url.searchParams.get('date')).toBe(result.snapshot.month);
    expect(url.searchParams.get('poly')).toBe('51.538,-0.145:51.538,-0.14:51.541,-0.14:51.541,-0.145');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('defaults real-source snapshots to non-synthetic', async () => {
    const client = createPoliceClient({ fetchImpl: vi.fn().mockResolvedValue(Response.json([])), now: () => new Date(date) });
    const result = await client.month(area, '2026-07', available, taxonomy);
    expect(result).toMatchObject({ status: 'available', snapshot: { synthetic: false, records: [] } });
  });

  it('does not fetch a missing month or invalid input', async () => {
    const { client, fetchImpl } = setup(() => Response.json([]));
    expect(await client.month(area, '2026-06', available, taxonomy)).toMatchObject({ status: 'missing' });
    await expect(client.categories('2026-13')).rejects.toThrow();
    await expect(client.month({ ...area, boundaryStatus: 'pending' } as unknown as ApprovedArea, '2026-07', available, taxonomy)).rejects.toThrow();
    await expect(client.month(area, '2026-07', available, { ...taxonomy, month: '2026-06' })).rejects.toThrow('taxonomy_month_mismatch');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...record, month: '2026-06' }],
    [{ ...record, category: 'unknown' }],
    [{ ...record, location: { ...record.location, latitude: '100' } }],
    Array.from({ length: 10001 }, () => record),
    { error: 'private upstream content' },
  ])('rejects invalid or mismatched source records', async value => {
    const { client } = setup(() => Response.json(value));
    expect(await client.month(area, '2026-07', available, taxonomy)).toEqual({ status: 'unavailable', month: '2026-07', code: 'invalid_response' });
  });

  it('rejects an oversized GET polygon before fetching', async () => {
    const { client, fetchImpl } = setup(() => Response.json([]));
    const ring: [number, number][] = Array.from({ length: 99 }, (_, i) => {
      const angle = 2 * Math.PI * i / 99;
      return [-0.142 + Math.cos(angle) * 0.001, 51.539 + Math.sin(angle) * 0.001];
    });
    ring.push(ring[0]);
    await expect(client.month({ ...area, geometry: { type: 'Polygon', coordinates: [ring] } }, '2026-07', available, taxonomy)).rejects.toThrow('polygon_query_too_long');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns bounded Retry-After without retrying', async () => {
    const { client, fetchImpl } = setup(() => new Response('sensitive upstream message', { status: 429, headers: { 'retry-after': '99999' } }));
    expect(await client.month(area, '2026-07', available, taxonomy)).toEqual({ status: 'unavailable', month: '2026-07', code: 'rate_limited', retryAfterSeconds: 3600 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(client.availability()).rejects.toMatchObject({ code: 'rate_limited', message: 'rate_limited' });
  });

  it('rejects redirect responses', async () => {
    const { client } = setup(() => new Response(null, { status: 302, headers: { Location: 'https://example.com' } }));
    expect(await client.month(area, '2026-07', available, taxonomy)).toMatchObject({ status: 'unavailable', code: 'redirect_refused' });
  });

  it('bounds actual streamed bytes even without Content-Length', async () => {
    const { client } = setup(() => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1)); controller.close(); } })));
    expect(await client.month(area, '2026-07', available, taxonomy)).toMatchObject({ status: 'unavailable', code: 'response_too_large' });
  });

  it('bounds metadata bodies and rejects malformed JSON', async () => {
    const { client, fetchImpl } = setup(() => new Response(' '.repeat(128 * 1024 + 1)));
    await expect(client.availability()).rejects.toMatchObject({ code: 'response_too_large' });
    fetchImpl.mockResolvedValueOnce(new Response('{invalid'));
    await expect(client.categories('2026-07')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('enforces the deadline across stalled bodies', async () => {
    vi.useFakeTimers();
    const { client } = setup(() => new Response(new ReadableStream({ start() {} })));
    const result = client.month(area, '2026-07', available, taxonomy);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toMatchObject({ status: 'unavailable', code: 'timeout' });
  });
});
