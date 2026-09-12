import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSources, getHelp } from '../../services/index';
import { validateContextResponse } from '../../services/context-dev';
afterEach(() => vi.unstubAllGlobals());
describe('source boundaries', () => {
 it('labels reporting month without inventing publication time or pilot counts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"date":"2026-07-01"}')));
  const source = (await getSources('hounslow_town_centre')).find(card => card.id === 'P03');
  expect(source?.status).toBe('available');
  expect(source?.summary).toContain('2026-07');
  expect(source?.publishedAt).toBeNull();
 });
 it.each(['{}','{"date":"2026-19-01"}', 'x'.repeat(17000)])('keeps invalid sources unavailable', async body => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  expect((await getSources('west_croydon')).find(card => card.id === 'P03')?.status).toBe('unavailable');
 });
 it('preserves unknown status on upstream failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const source = (await getSources('hounslow_town_centre')).find(card => card.id === 'P03');
  expect(source?.status).toBe('unavailable'); expect(source?.fetchedAt).toBeNull();
 });
 it('keeps overnight schedules separate from confirmed deployment', async () => {
  const [help] = await getHelp('camden_town');
  expect(help?.availability).toBe('unconfirmed'); expect(help?.schedule).toMatch(/next day|Sunday 13 September/);
 });
 it('rejects unknown areas before network access', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(getSources('london' as never)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
 });
 it('keeps Context output under review and retains source date', () => {
  const result = validateContextResponse({success:true, markdown:'Council listing', url:'https://www.camden.gov.uk/staying-safe-at-night',metadata:{finalUrl:'https://www.camden.gov.uk/staying-safe-at-night'}}, 'C01');
  expect(result.publicationAllowed).toBe(false); expect(result.sourcePublishedAt).toBeNull();
  expect(result.finalUrl).toBe('https://www.camden.gov.uk/staying-safe-at-night');
 });
 it('rejects empty Context output and unapproved redirects', () => {
  expect(() => validateContextResponse({success:true, markdown:'', url:'https://www.camden.gov.uk/staying-safe-at-night'}, 'C01')).toThrow();
  expect(() => validateContextResponse({success:true, markdown:'Text', url:'https://www.camden.gov.uk/staying-safe-at-night',metadata:{finalUrl:'https://example.com'}}, 'C01')).toThrow();
  expect(() => validateContextResponse({success:true, markdown:'Text', url:'https://www.camden.gov.uk/staying-safe-at-night',metadata:{finalUrl:'https://www.camden.gov.uk/unrelated-page'}}, 'C01')).toThrow();
 });
});
