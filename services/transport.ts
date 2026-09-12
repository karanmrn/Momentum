import { z } from 'zod';
import { pilotSchema, type PilotId } from '../packages/contracts/index.js';
import {
  transportSnapshotSchema, trafficCameraSnapshotSchema,
  type TransportSnapshot, type TransportStation, type TransportLine, type TrafficCameraSnapshot,
} from '../packages/transport/index.js';

export const TRANSPORT_CACHE_MS = 30_000;
export const CAMERA_CACHE_MS = 300_000;
export const TRANSPORT_TIMEOUT_MS = 6_000;
export const TRANSPORT_MAX_BYTES = 2_000_000;
const BASE = 'https://api.tfl.gov.uk';
const SOURCE_LABEL = 'Powered by TfL Open Data' as const;
const CAMERA_URL = `${BASE}/Place/Type/JamCam`;

// Identity and coordinates: acquired StopPoint snapshots listed in research/datasets/tfl-status.json.
// Line associations: scripts/datasets/tfl/live.ts and its selected StopPoint child records.
const targets: Record<PilotId, { stations: { id: string; name: string; coordinates: [number, number] }[];
  lines: { id: string; name: string }[]; anchor: [number, number] }> = {
  hounslow_town_centre: {
    stations: [
      { id: '940GZZLUHWC', name: 'Hounslow Central Underground Station', coordinates: [51.471295, -0.366578] },
      { id: '940GZZLUHWE', name: 'Hounslow East Underground Station', coordinates: [51.473213, -0.356474] },
    ], lines: [{ id: 'piccadilly', name: 'Piccadilly' }], anchor: [51.4683, -0.3618],
  },
  camden_town: {
    stations: [
      { id: '940GZZLUCTN', name: 'Camden Town Underground Station', coordinates: [51.539292, -0.14274] },
      { id: '910GCMDNRD', name: 'Camden Road Rail Station', coordinates: [51.541791, -0.138701] },
    ], lines: [{ id: 'northern', name: 'Northern' }, { id: 'mildmay', name: 'Mildmay' }], anchor: [51.5392, -0.1426],
  },
  west_croydon: {
    stations: [{ id: 'HUBWCY', name: 'West Croydon', coordinates: [51.378786, -0.101939] }],
    lines: [{ id: 'windrush', name: 'Windrush' }, { id: 'tram', name: 'Tram' }], anchor: [51.3784, -0.1023],
  },
};

const boundedText = z.string().trim().min(1).max(2000);
const sourceTime = z.string().datetime();
const validity = z.object({ fromDate: sourceTime, toDate: sourceTime }).refine(
  value => Date.parse(value.toDate) >= Date.parse(value.fromDate), 'invalid_source_interval',
);
const disruptionSchema = z.array(z.object({
  atcoCode: z.string().max(40), stationAtcoCode: z.string().max(40).optional(),
  description: boundedText, fromDate: sourceTime, toDate: sourceTime,
})).max(100);
const linesSchema = z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: boundedText,
  lineStatuses: z.array(z.object({
    statusSeverity: z.number().int().min(0).max(99).optional(),
    statusSeverityDescription: boundedText.optional(), reason: boundedText.optional(),
    validityPeriods: z.array(validity).max(20).optional(),
  })).max(20),
})).max(3);
const camerasSchema = z.array(z.object({
  id: z.string().regex(/^JamCams_[A-Za-z0-9._-]{1,80}$/),
  url: z.string().max(200), commonName: boundedText, placeType: z.literal('JamCam'),
  lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180),
})).max(2000);

function inInterval(from: string, to: string, at: number): boolean {
  return Date.parse(from) <= at && at < Date.parse(to);
}

function describeLineStatuses(statuses: z.infer<typeof linesSchema>[number]['lineStatuses']): string {
  const groups = new Map<string, Set<string>>();
  for (const status of statuses) {
    if (!status.statusSeverityDescription) continue;
    const reason = status.reason?.replace(/\s+/g, ' ').trim() ?? '';
    const severities = groups.get(reason) ?? new Set<string>();
    severities.add(status.statusSeverityDescription);
    groups.set(reason, severities);
  }
  return [...groups].map(([reason, severities]) =>
    `${[...severities].join('; ')}${reason ? `: ${reason}` : ''}`).join(' ').slice(0, 3000);
}

function distanceMetres(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type Entry<T> = { pending?: Promise<T>; value?: T; expires: number };
type CacheSlot = { transport?: Entry<TransportSnapshot>; cameras?: Entry<TrafficCameraSnapshot> };

export function createTransportService({ fetchImpl = fetch, now = () => new Date() }:
  { fetchImpl?: typeof fetch; now?: () => Date } = {}) {
  // Three validated pilot keys. Failures are cached too. No caller can add an endpoint or cache key.
  const cache = new Map<PilotId, CacheSlot>();

  function clock(): number {
    const value = now().getTime();
    if (!Number.isFinite(value)) throw new Error('invalid_clock');
    return value;
  }

  async function fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSPORT_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let body: ReadableStream<Uint8Array> | null = null;
    try {
      const response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Streetwise/1.0' },
      });
      body = response.body;
      if (!response.ok || response.redirected || (response.url && response.url !== url)) throw new Error('source_unavailable');
      const declared = response.headers.get('content-length');
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > TRANSPORT_MAX_BYTES)) throw new Error('response_too_large');
      if (!response.body) throw new Error('empty_response');
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.byteLength;
        if (length > TRANSPORT_MAX_BYTES) throw new Error('response_too_large');
        chunks.push(result.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally {
      clearTimeout(timer);
      if (reader) await reader.cancel().catch(() => undefined);
      else if (body) await body.cancel().catch(() => undefined);
    }
  }

  function base(pilotId: PilotId, startedAt: number, sourceUrl: string, ttl = TRANSPORT_CACHE_MS) {
    return {
      pilotId, fetchedAt: new Date(startedAt).toISOString(),
      expiresAt: new Date(startedAt + ttl).toISOString(),
      sourceId: 'TFL-UNIFIED' as const, sourceUrl, sourceLabel: SOURCE_LABEL,
      observedAt: null, synthetic: false as const,
    };
  }

  async function collectTransport(pilotId: PilotId): Promise<TransportSnapshot> {
    const startedAt = clock(), target = targets[pilotId];
    const noticeExpiries: number[] = [];
    const fetchedAt = new Date(startedAt).toISOString();
    const lineUrl = `${BASE}/Line/${target.lines.map(line => line.id).join(',')}/Status`;
    const stationsPromise = Promise.all(target.stations.map(async (station): Promise<TransportStation> => {
      const sourceUrl = `${BASE}/StopPoint/${station.id}/Disruption`;
      const row: TransportStation = {
        ...station, pilotId, coordinateMeaning: 'station_reference', status: 'unknown',
        description: 'Station status unavailable. Access and facilities remain unconfirmed.',
        availability: 'unknown', retrievalStatus: 'unavailable', sourceUrl, sourceLabel: SOURCE_LABEL,
        observedAt: null, fetchedAt,
      };
      try {
        const disruptions = disruptionSchema.parse(await fetchJson(sourceUrl));
        if (disruptions.some(item => (item.stationAtcoCode ?? item.atcoCode) !== station.id
          || Date.parse(item.toDate) < Date.parse(item.fromDate))) throw new Error('station_mismatch');
        const active = disruptions.filter(item => inInterval(item.fromDate, item.toDate, startedAt));
        noticeExpiries.push(...active.map(item => Date.parse(item.toDate)));
        return { ...row, retrievalStatus: 'available', status: active.length ? 'reported_disruption' : 'unknown',
          description: active.length ? active.map(item => item.description).join(' ').slice(0, 3000)
            : 'No current station disruption was returned. Access and facilities remain unconfirmed.' };
      } catch { return row; }
    }));
    const linesPromise = (async (): Promise<TransportLine[]> => {
      const rows: TransportLine[] = target.lines.map(line => ({
        ...line, status: 'unknown', description: 'Line status unavailable.', scope: 'whole_line',
        sourceUrl: `${BASE}/Line/${line.id}/Status`, sourceLabel: SOURCE_LABEL, observedAt: null, fetchedAt,
      }));
      try {
        const response = linesSchema.parse(await fetchJson(lineUrl));
        if (new Set(response.map(line => line.id)).size !== response.length
          || response.some(line => !target.lines.some(targetLine => targetLine.id === line.id))) throw new Error('line_mismatch');
        return rows.map(row => {
          const line = response.find(item => item.id === row.id);
          const current = line?.lineStatuses.filter(status => status.statusSeverity !== undefined && status.statusSeverityDescription
            && (!status.validityPeriods?.length || status.validityPeriods.some(period => inInterval(period.fromDate, period.toDate, startedAt))));
          if (!current?.length) return row;
          noticeExpiries.push(...current.flatMap(status => (status.validityPeriods ?? [])
            .filter(period => inInterval(period.fromDate, period.toDate, startedAt)).map(period => Date.parse(period.toDate))));
          return { ...row, status: 'reported', description: describeLineStatuses(current) };
        });
      } catch { return rows; }
    })();
    const [stations, lines] = await Promise.all([stationsPromise, linesPromise]);
    const covered = stations.filter(station => station.retrievalStatus === 'available').length
      + lines.filter(line => line.status === 'reported').length;
    return transportSnapshotSchema.parse({
      ...base(pilotId, startedAt, lineUrl),
      expiresAt: new Date(Math.min(startedAt + TRANSPORT_CACHE_MS, ...noticeExpiries)).toISOString(),
      status: covered === stations.length + lines.length ? 'available' : covered > 0 ? 'partial' : 'unavailable',
      stations, lines,
      limitations: [
        'Line notices describe the whole line, not this station or personal safety.',
        'Station points are registered references, not entrances or measured vehicle positions.',
        'An empty disruption response does not confirm access, staffing, or working facilities.',
        'Fetched time records retrieval. TfL observation time is not supplied by these responses.',
        'This selection excludes bus and National Rail service status.',
      ],
    });
  }

  async function collectCameras(pilotId: PilotId): Promise<TrafficCameraSnapshot> {
    const startedAt = clock();
    const metadata = base(pilotId, startedAt, CAMERA_URL, CAMERA_CACHE_MS);
    const limitations = [
      'Camera metadata describes road traffic monitoring. It does not establish safety or surveillance coverage.',
      'No images or videos are fetched. Camera availability and capture time remain unknown.',
      'The one-mile research circle is not an approved pilot boundary.',
    ];
    try {
      const response = camerasSchema.parse(await fetchJson(CAMERA_URL));
      if (new Set(response.map(camera => camera.id)).size !== response.length
        || response.some(camera => camera.url !== `/Place/${camera.id}`)) throw new Error('invalid_camera_identity');
      const nearby = response.filter(camera => distanceMetres(targets[pilotId].anchor, [camera.lat, camera.lon]) <= 1609.344);
      const cameras = nearby.slice(0, 50).map(camera => ({
        id: camera.id, name: camera.commonName, pilotId, coordinates: [camera.lat, camera.lon],
        coordinateMeaning: 'camera_reference', status: 'metadata_only', availability: 'unknown',
        sourceUrl: `${BASE}/Place/${camera.id}`, sourceLabel: SOURCE_LABEL,
        observedAt: null, fetchedAt: metadata.fetchedAt,
      }));
      if (nearby.length > 50) limitations.push('Only the first 50 nearby camera records are shown.');
      return trafficCameraSnapshotSchema.parse({ ...metadata, status: nearby.length > 50 ? 'partial' : 'available',
        scope: 'one_mile_research_circle', cameras, limitations });
    } catch {
      return trafficCameraSnapshotSchema.parse({ ...metadata, status: 'unavailable',
        scope: 'one_mile_research_circle', cameras: [], limitations });
    }
  }

  async function cached<T extends TransportSnapshot | TrafficCameraSnapshot>(
    pilot: PilotId, kind: 'transport' | 'cameras', collect: (pilotId: PilotId) => Promise<T>,
  ): Promise<T> {
    const pilotId = pilotSchema.parse(pilot), instant = clock();
    const slot = cache.get(pilotId) ?? {};
    cache.set(pilotId, slot);
    const existing = slot[kind] as Entry<T> | undefined;
    if (existing?.pending) return structuredClone(await existing.pending);
    if (existing?.value && instant < existing.expires) return structuredClone(existing.value);
    const entry: Entry<T> = { expires: instant + (kind === 'cameras' ? CAMERA_CACHE_MS : TRANSPORT_CACHE_MS) };
    Object.assign(slot, { [kind]: entry });
    entry.pending = collect(pilotId);
    try {
      const result = await entry.pending;
      entry.value = result;
      entry.expires = Date.parse(result.expiresAt);
      return structuredClone(result);
    } finally { entry.pending = undefined; }
  }
  return {
    getTransport: (pilotId: PilotId) => cached(pilotId, 'transport', collectTransport),
    getTrafficCameras: (pilotId: PilotId) => cached(pilotId, 'cameras', collectCameras),
  };
}

const transportService = createTransportService();
export const getTransport = transportService.getTransport;
export const getTrafficCameras = transportService.getTrafficCameras;
