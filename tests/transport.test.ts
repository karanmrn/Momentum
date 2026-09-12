import { describe, expect, it, vi } from 'vitest';
import { createTransportService, CAMERA_CACHE_MS, TRANSPORT_CACHE_MS, TRANSPORT_MAX_BYTES, TRANSPORT_TIMEOUT_MS } from '../services/transport.js';
import { transportSnapshotSchema, trafficCameraSnapshotSchema } from '../packages/transport/index.js';
import type { PilotId } from '../packages/contracts/index.js';

const NOW = new Date('2026-09-12T14:00:00Z');
const lineIds: Record<PilotId, string[]> = {
  hounslow_town_centre: ['piccadilly'], camden_town: ['northern', 'mildmay'], west_croydon: ['windrush', 'tram'],
};
const status = { statusSeverity: 10, statusSeverityDescription: 'Good Service', validityPeriods: [] };
function lines(ids: string[]) { return ids.map(id => ({ id, name: id, lineStatuses: [{ ...status }] })); }
function camera(id = 'JamCams_001', lat = 51.5392, lon = -0.1426) {
  return { id, url: `/Place/${id}`, commonName: 'Synthetic road camera', placeType: 'JamCam', lat, lon,
    additionalProperties: [{ key: 'imageUrl', value: 'https://untrusted.example/image.jpg' }, { key: 'available', value: 'true' }] };
}
function responseFor(url: string) {
  if (url.includes('/Line/')) return Response.json(lines(url.split('/Line/')[1].split('/')[0].split(',')));
  return Response.json([]);
}
function client(fetchImpl: typeof fetch = vi.fn(async input => responseFor(String(input))), now = () => NOW) {
  return createTransportService({ fetchImpl, now });
}

describe('fixed TfL transport adapter', () => {
  it.each(Object.keys(lineIds) as PilotId[])('queries only the fixed station and line paths for %s', async pilotId => {
    const fetchImpl: typeof fetch = vi.fn(async (input, options) => {
      const url = String(input);
      expect(url).toMatch(/^https:\/\/api\.tfl\.gov\.uk\/(StopPoint\/[A-Z0-9]+\/Disruption|Line\/[a-z,-]+\/Status)$/);
      expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return responseFor(url);
    });
    const result = await client(fetchImpl).getTransport(pilotId);
    expect(transportSnapshotSchema.parse(result).status).toBe('available');
    expect(result.lines.map(line => line.id)).toEqual(lineIds[pilotId]);
    expect(result.stations.every(station => station.pilotId === pilotId && station.status === 'unknown'
      && station.availability === 'unknown' && station.retrievalStatus === 'available')).toBe(true);
    expect(result.observedAt).toBeNull();
    expect(result.fetchedAt).toBe(NOW.toISOString());
    expect(Date.parse(result.expiresAt) - Date.parse(result.fetchedAt)).toBe(TRANSPORT_CACHE_MS);
    expect(result.stations[0].coordinates[0]).toBeGreaterThan(51);
    expect(fetchImpl).toHaveBeenCalledTimes(result.stations.length + 1);
  });

  it('retains current station disruptions without claiming known access', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => {
      const url = String(input);
      if (!url.includes('940GZZLUCTN')) return responseFor(url);
      return Response.json([{ atcoCode: '940GZZLUCTN', stationAtcoCode: '940GZZLUCTN',
        fromDate: '2026-09-12T13:00:00Z', toDate: '2026-09-12T16:00:00Z', description: 'Synthetic exit-only notice' }]);
    });
    const result = await client(fetchImpl).getTransport('camden_town');
    expect(result.stations[0]).toMatchObject({ status: 'reported_disruption', availability: 'unknown',
      description: 'Synthetic exit-only notice', observedAt: null });
    expect(result.lines[0]).toMatchObject({ status: 'reported', description: 'Good Service', scope: 'whole_line' });
  });

  it('expires cached status when a source notice ends before the normal cache deadline', async () => {
    let instant = NOW.getTime();
    const fetchImpl: typeof fetch = vi.fn(async input => String(input).includes('/Line/')
      ? Response.json([{ id: 'piccadilly', name: 'Piccadilly', lineStatuses: [{ ...status,
        validityPeriods: [{ fromDate: '2026-09-12T13:00:00Z', toDate: '2026-09-12T14:00:05Z' }] }] }])
      : Response.json([]));
    const service = client(fetchImpl, () => new Date(instant));
    expect((await service.getTransport('hounslow_town_centre')).expiresAt).toBe('2026-09-12T14:00:05.000Z');
    instant += 5000;
    expect((await service.getTransport('hounslow_town_centre')).lines[0].status).toBe('unknown');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it.each([
    { fromDate: '2026-09-12T12:00:00Z', toDate: '2026-09-12T13:00:00Z' },
    { fromDate: '2026-09-12T15:00:00Z', toDate: '2026-09-12T16:00:00Z' },
  ])('does not present notices outside their source interval: %j', async interval => {
    const fetchImpl: typeof fetch = vi.fn(async input => String(input).includes('/StopPoint/')
      ? Response.json([{ atcoCode: String(input).split('/')[4], description: 'Synthetic notice', ...interval }])
      : Response.json([{ id: 'piccadilly', name: 'Piccadilly', lineStatuses: [{ ...status, validityPeriods: [interval] }] }]));
    const result = await client(fetchImpl).getTransport('hounslow_town_centre');
    expect(result.stations.every(station => station.status === 'unknown')).toBe(true);
    expect(result.lines[0].status).toBe('unknown');
  });

  it('keeps station and line failures independent', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => String(input).includes('/Line/')
      ? Response.json({ error: 'upstream secret' }, { status: 503 }) : Response.json([]));
    const result = await client(fetchImpl).getTransport('hounslow_town_centre');
    expect(result.status).toBe('partial');
    expect(result.lines[0]).toMatchObject({ status: 'unknown', description: 'Line status unavailable.' });
    expect(JSON.stringify(result)).not.toContain('upstream secret');
  });

  it('retains static station references on a complete outage without seed statuses', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => { throw new Error('private upstream details'); });
    const result = await client(fetchImpl).getTransport('west_croydon');
    expect(result.status).toBe('unavailable');
    expect(result.stations[0]).toMatchObject({ id: 'HUBWCY', coordinates: [51.378786, -0.101939],
      status: 'unknown', retrievalStatus: 'unavailable', coordinateMeaning: 'station_reference' });
    expect(result.lines.every(line => line.status === 'unknown')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private upstream|Good Service|seed/);
  });

  it.each([
    [], [{ id: 'piccadilly', name: 'Piccadilly', lineStatuses: [] }],
    [{ id: 'piccadilly', name: 'Piccadilly', lineStatuses: [{ statusSeverityDescription: 'Good Service' }] }],
    [{ id: 'piccadilly', name: 'Piccadilly', lineStatuses: [{ statusSeverity: 10 }] }],
    lines(['other']), lines(['piccadilly', 'piccadilly']),
    [{ id: 'piccadilly', name: 'Piccadilly', lineStatuses: [{ statusSeverity: '10', statusSeverityDescription: 'Good Service' }] }],
  ].map(payload => ({ payload })))('does not replace missing or invalid line status with good service: %j', async ({ payload }) => {
    const fetchImpl: typeof fetch = vi.fn(async input => Response.json(String(input).includes('/Line/') ? payload : []));
    const result = await client(fetchImpl).getTransport('hounslow_town_centre');
    expect(result.lines[0].status).toBe('unknown');
    expect(result.status).toBe('partial');
  });

  it('accepts a partial line response without losing a successful line', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => Response.json(String(input).includes('/Line/') ? lines(['northern']) : []));
    const result = await client(fetchImpl).getTransport('camden_town');
    expect(result.status).toBe('partial');
    expect(result.lines.map(line => line.status)).toEqual(['reported', 'unknown']);
  });

  it('rejects another station notice instead of moving it to the requested station', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => String(input).includes('/StopPoint/')
      ? Response.json([{ atcoCode: 'OTHER', description: 'Synthetic notice', fromDate: '2026-09-12T13:00:00Z', toDate: '2026-09-12T16:00:00Z' }])
      : responseFor(String(input)));
    const result = await client(fetchImpl).getTransport('camden_town');
    expect(result.stations.every(station => station.retrievalStatus === 'unavailable')).toBe(true);
  });

  it('deduplicates in-flight calls and caches snapshots and failures for 30 seconds', async () => {
    let instant = NOW.getTime();
    const fetchImpl: typeof fetch = vi.fn(async () => Response.json({}, { status: 503 }));
    const service = client(fetchImpl, () => new Date(instant));
    const results = await Promise.all(Array.from({ length: 20 }, () => service.getTransport('camden_town')));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(results.every(result => result.status === 'unavailable')).toBe(true);
    results[0].stations[0].name = 'Mutated';
    expect((await service.getTransport('camden_town')).stations[0].name).not.toBe('Mutated');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    instant += TRANSPORT_CACHE_MS;
    await service.getTransport('camden_town');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('permits only three cache keys and rejects invalid pilots before fetching', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => responseFor(String(input)));
    const service = client(fetchImpl);
    await expect(service.getTransport('london' as PilotId)).rejects.toThrow();
    await expect(service.getTrafficCameras('../../x' as PilotId)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const pilotId of Object.keys(lineIds) as PilotId[]) await service.getTransport(pilotId);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    for (const pilotId of Object.keys(lineIds) as PilotId[]) await service.getTransport(pilotId);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it.each(['declared', 'streamed', 'redirected', 'invalid_json'])('fails closed on %s responses', async failure => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      if (failure === 'declared') return new Response('[]', { headers: { 'content-length': String(TRANSPORT_MAX_BYTES + 1) } });
      if (failure === 'streamed') return new Response(' '.repeat(TRANSPORT_MAX_BYTES + 1));
      if (failure === 'invalid_json') return new Response('not json');
      const response = Response.json([]);
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });
    expect((await client(fetchImpl).getTransport('west_croydon')).status).toBe('unavailable');
  });

  it('aborts slow source requests without retries', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: typeof fetch = vi.fn((_input, options) => new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      const pending = client(fetchImpl).getTransport('west_croydon');
      await vi.advanceTimersByTimeAsync(TRANSPORT_TIMEOUT_MS);
      expect((await pending).status).toBe('unavailable');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('cancels unread bodies on status and declared-size failures', async () => {
    const cancel = vi.fn();
    const fetchImpl: typeof fetch = vi.fn(async () => new Response(new ReadableStream({ cancel }), {
      status: 503, headers: { 'content-length': String(TRANSPORT_MAX_BYTES + 1) },
    }));
    expect((await client(fetchImpl).getTransport('west_croydon')).status).toBe('unavailable');
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});

describe('traffic camera metadata', () => {
  it('keeps only nearby metadata and never fetches or emits images', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => {
      expect(String(input)).toBe('https://api.tfl.gov.uk/Place/Type/JamCam');
      return Response.json([camera(), camera('JamCams_002', 51.3784, -0.1023)]);
    });
    const result = await client(fetchImpl).getTrafficCameras('camden_town');
    expect(trafficCameraSnapshotSchema.parse(result).status).toBe('available');
    expect(result.cameras).toHaveLength(1);
    expect(result.cameras[0]).toMatchObject({ id: 'JamCams_001', pilotId: 'camden_town',
      coordinates: [51.5392, -0.1426], status: 'metadata_only', availability: 'unknown', observedAt: null,
      sourceUrl: 'https://api.tfl.gov.uk/Place/JamCams_001' });
    expect(JSON.stringify(result)).not.toContain('untrusted.example');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('distinguishes zero nearby metadata from an unavailable response', async () => {
    expect((await client(vi.fn(async () => Response.json([]))).getTrafficCameras('camden_town')))
      .toMatchObject({ status: 'available', cameras: [] });
    expect((await client(vi.fn(async () => Response.json({}, { status: 503 }))).getTrafficCameras('camden_town')))
      .toMatchObject({ status: 'unavailable', cameras: [] });
  });

  it.each([
    [{ ...camera(), url: 'https://untrusted.example/' }], [camera(), camera()],
    [{ ...camera(), lat: 100 }], [{ ...camera(), lat: '51.5' }],
    [{ ...camera(), placeType: 'PoliceCamera' }],
  ].map(payload => ({ payload })))('rejects malformed or duplicate camera metadata: %j', async ({ payload }) => {
    const result = await client(vi.fn(async () => Response.json(payload))).getTrafficCameras('camden_town');
    expect(result).toMatchObject({ status: 'unavailable', cameras: [] });
  });

  it('bounds camera output and marks truncated coverage as partial', async () => {
    const payload = Array.from({ length: 51 }, (_, index) => camera(`JamCams_${index}`));
    const result = await client(vi.fn(async () => Response.json(payload))).getTrafficCameras('camden_town');
    expect(result.status).toBe('partial');
    expect(result.cameras).toHaveLength(50);
  });

  it('deduplicates concurrent camera requests and rejects cross-pilot snapshot rows', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => Response.json([camera()]));
    const service = client(fetchImpl);
    const [first] = await Promise.all(Array.from({ length: 10 }, () => service.getTrafficCameras('camden_town')));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(trafficCameraSnapshotSchema.safeParse({ ...first, pilotId: 'west_croydon' }).success).toBe(false);
  });

  it('keeps camera metadata for five minutes with matching expiry', async () => {
    let instant = NOW.getTime();
    const fetchImpl: typeof fetch = vi.fn(async () => Response.json([]));
    const service = client(fetchImpl, () => new Date(instant));
    const first = await service.getTrafficCameras('camden_town');
    expect(Date.parse(first.expiresAt) - Date.parse(first.fetchedAt)).toBe(CAMERA_CACHE_MS);
    instant += TRANSPORT_CACHE_MS;
    await service.getTrafficCameras('camden_town');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    instant = NOW.getTime() + CAMERA_CACHE_MS;
    await service.getTrafficCameras('camden_town');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
