import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export const anchors = [
  { pilotId: 'camden_town', latitude: 51.5392, longitude: -0.1426, boroughCode: 'E09000007' },
  { pilotId: 'hounslow_town_centre', latitude: 51.4683, longitude: -0.3618, boroughCode: 'E09000018' },
  { pilotId: 'west_croydon', latitude: 51.3784, longitude: -0.1023, boroughCode: 'E09000008' },
] as const;
const root = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1/';
const lookupSchema = z.object({ status: z.literal(200), result: z.array(z.object({
  postcode: z.string().min(5).max(10), distance: z.number().finite().nonnegative().max(100),
  latitude: z.number().finite(), longitude: z.number().finite(),
  lsoa21: z.string().min(1), msoa21: z.string().min(1),
  codes: z.object({ lsoa21: z.string().regex(/^E01\d{6}$/), msoa21: z.string().regex(/^E02\d{6}$/), admin_district: z.string().regex(/^E09\d{6}$/) }),
})).length(1) });
export function parseLookup(input: unknown, boroughCode: string) {
  const row = lookupSchema.parse(input).result[0];
  if (row.codes.admin_district !== boroughCode) throw new Error('lookup_borough_mismatch');
  return row;
}

/** Parse bounded CSV records, including quoted commas, newlines, and escaped quotes. */
export function parseCsv(text: string): string[][] {
  if (Buffer.byteLength(text) > 256 * 1024) throw new Error('csv_too_large');
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"') {
      if (field || closed) throw new Error('invalid_csv');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error('invalid_csv');
      field += c;
    }
  }
  if (quoted) throw new Error('invalid_csv');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}
const censusSchema = z.object({
  DATE: z.literal('2021'), GEOGRAPHY_CODE: z.string().regex(/^E0[12]\d{6}$/),
  GEOGRAPHY_NAME: z.string().min(1), GEOGRAPHY_TYPE: z.enum(['2021 super output areas - lower layer', '2021 super output areas - middle layer']),
  C2021_RESTYPE_3: z.literal('0'), C2021_RESTYPE_3_NAME: z.literal('Total: All usual residents'),
  MEASURES: z.literal('20100'), OBS_VALUE: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().max(1000000)),
  OBS_STATUS: z.literal('A'), OBS_CONF: z.literal('F'),
  RECORD_COUNT: z.string().regex(/^\d+$/).transform(Number),
});
export function parsePopulationCsv(text: string, expectedCodes: string[]) {
  const [header, ...rows] = parseCsv(text);
  if (!header || new Set(header).size !== header.length || rows.length !== expectedCodes.length) throw new Error('incomplete_census_response');
  const parsed = rows.map(row => {
    if (row.length !== header.length) throw new Error('invalid_csv_row');
    return censusSchema.parse(Object.fromEntries(header.map((name, i) => [name, row[i]])));
  });
  if (new Set(parsed.map(row => row.GEOGRAPHY_CODE)).size !== expectedCodes.length || parsed.some(row =>
    !expectedCodes.includes(row.GEOGRAPHY_CODE) || row.RECORD_COUNT !== expectedCodes.length ||
    (row.GEOGRAPHY_CODE.startsWith('E01') ? !row.GEOGRAPHY_TYPE.endsWith('lower layer') : !row.GEOGRAPHY_TYPE.endsWith('middle layer')))) throw new Error('census_scope_mismatch');
  return parsed;
}

async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const parsed = new URL(url);
  if (!['https://www.nomisweb.co.uk', 'https://api.postcodes.io'].includes(parsed.origin)) throw new Error('source_not_allowed');
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok || response.redirected || !response.body) throw new Error('source_unavailable');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 256 * 1024) throw new Error('source_too_large');
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks);
}

export async function collectOns(workspace: string, fetchImpl: typeof fetch = fetch) {
  const fetchedAt = new Date().toISOString();
  const runId = fetchedAt.replace(/[:.]/g, '-');
  const rawRelative = `.data/datasets/ons/${runId}`;
  const rawRoot = resolve(workspace, rawRelative);
  await mkdir(rawRoot, { recursive: true, mode: 0o700 }); await chmod(rawRoot, 0o700);
  const evidence: { url: string; rawPath: string; sha256: string; bytes: number }[] = [];
  async function capture(url: string, name: string) {
    const bytes = await download(url, fetchImpl);
    const path = join(rawRoot, name);
    await writeFile(path, bytes, { mode: 0o600 }); await chmod(path, 0o600);
    evidence.push({ url, rawPath: `${rawRelative}/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  const base = {
    schemaVersion: '1.0', source: 'ONS Census 2021, delivered by Nomis', dataset: 'TS001', apiDataset: 'NM_2021_1',
    period: '2021-03-21', fetchedAt, synthetic: false, publicationAllowed: false, alertEligible: false,
    licence: { name: 'Open Government Licence', url: 'https://www.nomisweb.co.uk/home/copyright.asp', attribution: 'Source: Office for National Statistics, Census 2021, via Nomis. Crown copyright.' },
    documentation: ['https://www.nomisweb.co.uk/datasets/c2021ts001', 'https://www.nomisweb.co.uk/api/v01/help', 'https://postcodes.io/docs/postcode/schema/'],
    limitations: [
      'These are Census Day usual-resident counts. They are not current population or night-time footfall.',
      'Each anchor selects the nearest postcode within 100 metres. Its 2021 geography codes select Census areas.',
      'The lookup does not prove that the anchor lies inside that area. No boundary overlay was performed.',
      'LSOA and MSOA totals overlap. Do not add them together.',
      'These statistical areas are not approved pilot boundaries or town-centre population totals.',
      'Do not use these counts as a personal danger estimate or a crime-rate denominator for pilot counts.',
      'ONS applies statistical disclosure control. Counts can differ slightly between Census tables.',
      'Postcodes.io supplies the geographic lookup. ONS through Nomis supplies the population counts.',
    ],
  };
  let manifest: Record<string, unknown>;
  try {
    const lookupRows = [];
    for (const anchor of anchors) {
      const url = `https://api.postcodes.io/postcodes?${new URLSearchParams({ lon: String(anchor.longitude), lat: String(anchor.latitude), limit: '1' })}`;
      const row = parseLookup(JSON.parse(await capture(url, `${anchor.pilotId}-lookup.json`)), anchor.boroughCode);
      lookupRows.push({ anchor, row, url });
    }
    const codes = lookupRows.flatMap(({ row }) => [row.codes.lsoa21, row.codes.msoa21]);
    if (new Set(codes).size !== 6) throw new Error('lookup_scope_mismatch');
    const queryUrl = `${root}data.csv?${new URLSearchParams({ geography: codes.join(','), c2021_restype_3: '0', measures: '20100', date: '2021' })}`;
    const census = parsePopulationCsv(await capture(queryUrl, 'ts001-population.csv'), codes);
    const pilots = lookupRows.map(({ anchor, row, url }) => ({
      ...anchor, selectionMethod: 'nearest_postcode_geography_lookup', lookupSource: 'Postcodes.io', lookupUrl: url,
      postcode: row.postcode, postcodeDistanceMetres: row.distance,
      counts: [row.codes.lsoa21, row.codes.msoa21].map(code => {
        const record = census.find(value => value.GEOGRAPHY_CODE === code)!;
        return { geographyCode: code, geographyName: record.GEOGRAPHY_NAME, geographyType: record.GEOGRAPHY_TYPE,
          geographyVintage: 2021, usualResidents: record.OBS_VALUE, observationStatus: record.OBS_STATUS, publicationFlag: record.OBS_CONF };
      }),
    }));
    manifest = { ...base, status: 'downloaded', rowCount: census.length, queryUrl, pilots, evidence };
  } catch {
    manifest = { ...base, status: 'unavailable', rowCount: 0, pilots: [], code: 'acquisition_or_validation_failed', evidence };
  }
  const manifestDir = resolve(workspace, 'research/datasets');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(join(manifestDir, 'ons-status.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  collectOns(process.cwd()).then(result => {
    process.stdout.write(`${JSON.stringify({ status: result.status, rows: result.rowCount })}\n`);
    if (result.status !== 'downloaded') process.exitCode = 1;
  }).catch(() => { process.stderr.write('ONS collection failed.\n'); process.exitCode = 1; });
}
