import { z } from 'zod';
import { pilotSchema, type PilotId } from '../../contracts/index.js';
import { createPoliceClient } from '../../../services/ingestion/src/police/client.js';
import { monthSchema, type PoliceClient } from '../../../services/ingestion/src/police/types.js';

const sourceUrl = 'https://data.police.uk/api/crimes-street-dates';
const availabilitySchema = z.object({
  months: z.array(monthSchema).min(1).max(1200),
  fetchedAt: z.string().datetime({ offset: true }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  sourceUrl: z.literal(sourceUrl),
}).refine(value => new Set(value.months).size === value.months.length);

export interface HistoricalCoverage {
  status: 'boundary_review_required' | 'source_unavailable';
  estimate: null;
  explanation: string;
  latestMonth: string | null;
  availableMonths: string[];
  fetchedAt: string | null;
  sourceUrl: string;
  recordCount: null;
}

/** Read global publication coverage. This does not request or publish local crime counts. */
export async function getHistoricalCoverage(
  pilotId: PilotId,
  client: Pick<PoliceClient, 'availability'> = createPoliceClient(),
): Promise<HistoricalCoverage> {
  pilotSchema.parse(pilotId);
  const unavailable: HistoricalCoverage = {
    status: 'source_unavailable',
    estimate: null,
    explanation: 'Police.uk publication metadata is unavailable. Area counts still need reviewed boundaries. No community-report correlation is available.',
    latestMonth: null,
    availableMonths: [],
    fetchedAt: null,
    sourceUrl,
    recordCount: null,
  };
  try {
    const source = availabilitySchema.parse(await client.availability());
    const availableMonths = [...source.months].sort().reverse();
    return {
      status: 'boundary_review_required',
      estimate: null,
      explanation: `Police.uk lists ${availableMonths.length} reporting months. Latest month: ${availableMonths[0]}. This is dataset-wide publication coverage. Area counts need reviewed boundaries. No community-report correlation is available.`,
      latestMonth: availableMonths[0],
      availableMonths,
      fetchedAt: source.fetchedAt,
      sourceUrl,
      recordCount: null,
    };
  } catch {
    return unavailable;
  }
}
