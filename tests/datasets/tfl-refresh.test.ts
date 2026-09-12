import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { collect } from '../../scripts/datasets/tfl/index';
import { buildDatasetCoverage } from '../../packages/datasets/src/project';

afterEach(() => vi.unstubAllGlobals());

it('replaces old acquired transport coverage when the source refresh fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'streetwise-tfl-refresh-'));
  const statusPath = join(root, 'research/datasets/tfl-status.json');
  const time = '2026-09-12T12:00:00Z';
  try {
    await mkdir(join(root, 'research/datasets'), { recursive: true });
    await writeFile(statusPath, JSON.stringify({
      fetchedAt: time,
      staticFallback: {
        sourceUrl: 'https://naptan.api.dft.gov.uk/',
        identities: [{ pilotId: 'west_croydon' }],
      },
    }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unavailable', { status: 503 })));
    await expect(collect(root)).rejects.toThrow('naptan_http_503');
    const saved = JSON.parse(await readFile(statusPath, 'utf8'));
    const coverage = buildDatasetCoverage({ tfl: saved }, time);
    expect(coverage.records.find(row => row.pilotId === 'west_croydon' && row.id === 'naptan-stops'))
      .toMatchObject({ status: 'blocked', acquiredUnits: null, fetchedAt: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
