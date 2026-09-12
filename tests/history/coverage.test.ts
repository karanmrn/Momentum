import { describe, expect, it, vi } from 'vitest';
import { getHistoricalCoverage } from '../../packages/history/src/coverage';
import { createPoliceClient } from '../../services/ingestion/src/police/client';
import type { Availability } from '../../services/ingestion/src/police/types';
import type { PilotId } from '../../packages/contracts/index';

function metadata(): Availability {
  return { months: ['2026-05', '2026-07', '2026-06'], fetchedAt: '2026-09-12T12:00:00Z',
    checksum: 'a'.repeat(64), sourceUrl: 'https://data.police.uk/api/crimes-street-dates' };
}
describe('visible historical publication coverage', () => {
  it.each(['camden_town', 'west_croydon', 'hounslow_town_centre'] as const)(
    'returns real publication coverage without an area total for %s', async pilot => {
      const result = await getHistoricalCoverage(pilot, { availability: async () => metadata() });
      expect(result).toMatchObject({ status: 'boundary_review_required', latestMonth: '2026-07',
        availableMonths: ['2026-07','2026-06','2026-05'], fetchedAt: '2026-09-12T12:00:00Z',
        recordCount: null, estimate: null, sourceUrl: 'https://data.police.uk/api/crimes-street-dates' });
      expect(result.explanation).toContain('dataset-wide publication coverage');
    },
  );
  it('rejects an unknown pilot before any request', async () => {
    const availability = vi.fn(async () => metadata());
    await expect(getHistoricalCoverage('london' as PilotId, { availability })).rejects.toThrow();
    expect(availability).not.toHaveBeenCalled();
  });
  it('preserves an unavailable state without old months or a false zero', async () => {
    const availability = vi.fn().mockResolvedValueOnce(metadata()).mockRejectedValueOnce(new Error('untrusted upstream error'));
    expect((await getHistoricalCoverage('camden_town', { availability })).latestMonth).toBe('2026-07');
    const unavailable = await getHistoricalCoverage('camden_town', { availability });
    expect(unavailable).toMatchObject({ status:'source_unavailable', latestMonth:null,
      availableMonths:[], fetchedAt:null, recordCount:null, estimate:null });
    expect(JSON.stringify(unavailable)).not.toContain('untrusted upstream error');
  });
  it.each([
    { months: [] }, { months: ['2026-13'] }, { months: ['2026-07','2026-07'] },
    { fetchedAt: 'yesterday' }, { checksum: 'broken' }, { sourceUrl: 'https://other.example/data' },
  ])('rejects malformed source metadata: %j', async change => {
    const result = await getHistoricalCoverage('camden_town', { availability: async () => ({...metadata(),...change}) });
    expect(result).toMatchObject({status:'source_unavailable',availableMonths:[],recordCount:null});
  });
  it('uses only the bounded metadata endpoint through the actual client', async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe('https://data.police.uk/api/crimes-street-dates');
      expect(init?.redirect).toBe('error');
      return Response.json([{date:'2026-07','stop-and-search':[]},{date:'2026-06'}]);
    });
    const client = createPoliceClient({fetchImpl,now:()=>new Date('2026-09-12T12:00:00Z')});
    expect(await getHistoricalCoverage('west_croydon', client)).toMatchObject({latestMonth:'2026-07',recordCount:null});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
