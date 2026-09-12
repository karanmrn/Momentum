import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anchors, collectOns, parseCsv, parseLookup, parsePopulationCsv } from '../../scripts/datasets/ons/index';

const fields = ['DATE', 'GEOGRAPHY_CODE', 'GEOGRAPHY_NAME', 'GEOGRAPHY_TYPE', 'C2021_RESTYPE_3', 'C2021_RESTYPE_3_NAME', 'MEASURES', 'OBS_VALUE', 'OBS_STATUS', 'OBS_CONF', 'RECORD_COUNT'];
const codes = ['E01000001', 'E02000001', 'E01000002', 'E02000002', 'E01000003', 'E02000003'];
const csv = (selected = codes) => [fields.join(','), ...selected.map(code => ['2021', code, 'Synthetic area', `2021 super output areas - ${code.startsWith('E01') ? 'lower' : 'middle'} layer`, '0', 'Total: All usual residents', '20100', '1234', 'A', 'F', String(selected.length)].join(','))].join('\n');
const lookups = anchors.map((anchor, i) => ({ status: 200, result: [{ postcode: 'ZZ1 1ZZ', distance: 10,
  latitude: anchor.latitude, longitude: anchor.longitude, lsoa21: 'Synthetic LSOA', msoa21: 'Synthetic MSOA',
  codes: { lsoa21: codes[i * 2], msoa21: codes[i * 2 + 1], admin_district: anchor.boroughCode },
}] }));
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('ONS resident context acquisition', () => {
  it('parses quotes and rejects malformed or oversized CSV', () => {
    expect(parseCsv('"a,b","c""d"\r\n"line\nbreak",x\r\n')).toEqual([['a,b', 'c"d'], ['line\nbreak', 'x']]);
    expect(() => parseCsv('"unterminated')).toThrow();
    expect(() => parseCsv('"a"extra,b')).toThrow();
    expect(() => parseCsv('x'.repeat(256 * 1024 + 1))).toThrow();
  });
  it('requires six distinct requested areas and exact Census dimensions', () => {
    const rows = parsePopulationCsv(csv(), codes);
    expect(rows).toHaveLength(6); expect(rows[0].OBS_VALUE).toBe(1234);
    for (const invalid of [csv().replace('2021,', '2011,'), csv().replace(',20100,', ',20301,'),
      csv().replace(',1234,', ',,') , csv().replace(',A,F,', ',M,F,'),
      csv().replace('E01000001', 'E01099999'), csv().replace('E02000001', 'E01000001'), csv(codes.slice(1))]) {
      expect(() => parsePopulationCsv(invalid, codes)).toThrow();
    }
  });
  it('requires a close postcode in the expected borough with 2021 geography codes', () => {
    expect(parseLookup(lookups[0], anchors[0].boroughCode).codes.lsoa21).toBe(codes[0]);
    expect(() => parseLookup(lookups[0], anchors[1].boroughCode)).toThrow();
    expect(() => parseLookup({ status: 200, result: null }, anchors[0].boroughCode)).toThrow();
    expect(() => parseLookup({ status: 200, result: [{ ...lookups[0].result[0], distance: 101 }] }, anchors[0].boroughCode)).toThrow();
  });
  it('saves raw evidence privately and publishes only labelled aggregate context', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ons-test-')); temporary.push(directory);
    const fetchImpl = vi.fn<typeof fetch>();
    for (const lookup of lookups) fetchImpl.mockResolvedValueOnce(Response.json(lookup));
    fetchImpl.mockResolvedValueOnce(new Response(csv()));
    const manifest = await collectOns(directory, fetchImpl);
    expect(manifest).toMatchObject({ status: 'downloaded', rowCount: 6, publicationAllowed: false, alertEligible: false, period: '2021-03-21' });
    const saved = JSON.parse(await readFile(join(directory, 'research/datasets/ons-status.json'), 'utf8'));
    expect(saved.pilots[0]).toMatchObject({ selectionMethod: 'nearest_postcode_geography_lookup', counts: [{ geographyVintage: 2021 }, { geographyVintage: 2021 }] });
    expect(saved.evidence).toHaveLength(4);
    for (const item of saved.evidence) {
      expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect((await stat(join(directory, item.rawPath))).mode & 0o777).toBe(0o600);
    }
    expect(fetchImpl.mock.calls.every(([, options]) => options?.redirect === 'error')).toBe(true);
  });
  it('replaces a previous successful manifest with an unavailable state after failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ons-test-')); temporary.push(directory);
    const fetchImpl = vi.fn<typeof fetch>();
    for (const lookup of lookups) fetchImpl.mockResolvedValueOnce(Response.json(lookup));
    fetchImpl.mockResolvedValueOnce(new Response(csv()));
    await collectOns(directory, fetchImpl);
    fetchImpl.mockResolvedValueOnce(new Response('upstream secret text', { status: 429 }));
    expect(await collectOns(directory, fetchImpl)).toMatchObject({ status: 'unavailable', pilots: [], rowCount: 0 });
    const manifest = await readFile(join(directory, 'research/datasets/ons-status.json'), 'utf8');
    expect(manifest).not.toContain('upstream secret text');
    expect(JSON.parse(manifest).status).toBe('unavailable');
  });
});
