import { z } from 'zod';
import { pilotSchema, type PilotId, type SourceCard, type HelpCard } from '../packages/contracts/index';

const policeUrl = 'https://data.police.uk/api/crime-last-updated';
const metadataSchema = z.object({ date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/) });

/** Read bounded JSON from a fixed public endpoint. Redirects are refused. */
export async function readPublicJson(url: string): Promise<unknown> {
  if (url !== policeUrl) throw new Error('Source is not allowed.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok || !response.body) throw new Error('Source is unavailable.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_384) throw new Error('Source response is too large.');
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function getSources(pilotId: PilotId): Promise<SourceCard[]> {
  pilotSchema.parse(pilotId);
  const police: SourceCard = {
    id: 'P03', title: 'Historical police data', url: policeUrl,
    summary: 'Publication metadata is unavailable. No local crime count is available.',
    status: 'unavailable', sourceKind: 'official_dataset', fetchedAt: null,
    publishedAt: null, synthetic: false,
    scope: 'England, Wales and Northern Ireland metadata. Pilot boundaries remain under review.',
  };
  try {
    const metadata = metadataSchema.parse(await readPublicJson(policeUrl));
    police.status = 'available';
    police.fetchedAt = new Date().toISOString();
    police.summary = `Latest reporting month: ${metadata.date.slice(0, 7)}. Historical records are not live warnings. Pilot counts are not calculated.`;
  } catch { /* An outage cannot become a zero count or an all-clear state. */ }
  return [police, {
    id: 'T01', title: 'TfL travel information',
    summary: 'Open TfL for travel information. Live station data is not connected.',
    url: 'https://tfl.gov.uk/status-updates/', status: 'link_only',
    sourceKind: 'official_operator', fetchedAt: null, publishedAt: null,
    synthetic: false, scope: 'London transport; no pilot station status is asserted.',
  }];
}

export async function getHelp(pilotId: PilotId): Promise<HelpCard[]> {
  pilotSchema.parse(pilotId);
  if (pilotId === 'camden_town') return [{
    id: 'C01', pilotId, name: 'Camden Safety Bus',
    summary: 'Council listing outside Camden Town station. Deployment tonight is unconfirmed. Check the source before travelling.',
    url: 'https://www.camden.gov.uk/staying-safe-at-night', availability: 'unconfirmed',
    schedule: 'Council listing: Friday and Saturday 21:30 to 02:30 the next day, Europe/London.',
  }, {
    id: 'C02', pilotId, name: 'Camden Safe Havens',
    summary: 'Open the council directory. Venue coverage and current availability need checking.',
    url: 'https://www.camden.gov.uk/safe-havens', availability: 'unconfirmed', schedule: null,
  }];
  return [{
    id: 'R01', pilotId, name: 'Official reporting routes',
    summary: 'StreetSafe accepts public-place concerns. It is not a crime or emergency reporting service.',
    url: 'https://www.met.police.uk/notices/street-safe/street-safe/',
    availability: 'unconfirmed', schedule: null,
  }];
}
