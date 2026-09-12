import { getCroydonProgrammeSource } from './data/recent-programme.js';
import { getCamdenHelp, getCamdenDirectorySource } from './data/camden-help.js';
import { getLocalSources, getLocalHelp } from './data/local-services.js';
import { getCamdenLighting } from './ingestion/camden-lighting.js';
import { z } from 'zod';
import { pilotSchema, type PilotId, type SourceCard, type HelpCard } from '../packages/contracts/index.js';

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
    coverage: 'metadata', attribution: 'Police.uk',
  };
  try {
    const metadata = metadataSchema.parse(await readPublicJson(policeUrl));
    police.status = 'available';
    police.fetchedAt = new Date().toISOString();
    police.summary = `Latest reporting month: ${metadata.date.slice(0, 7)}. Historical records are not live warnings. Pilot counts are not calculated.`;
  } catch { /* An outage cannot become a zero count or an all-clear state. */ }
  const local = getLocalSources(pilotId);
  if (pilotId === 'west_croydon') local.unshift(getCroydonProgrammeSource());
  if (pilotId === 'camden_town') local.push(getCamdenDirectorySource(), await getCamdenLighting());
  return [...local, police, {
    id: 'T01', title: 'TfL travel information',
    summary: 'Open TfL for current travel information. Dataset coverage lists dated station and line-status snapshots.',
    url: 'https://tfl.gov.uk/status-updates/', status: 'link_only',
    sourceKind: 'official_operator', fetchedAt: null, publishedAt: null,
    synthetic: false, scope: 'London transport; no pilot station status is asserted.',
  }];
}

export async function getHelp(pilotId: PilotId): Promise<HelpCard[]> {
  pilotSchema.parse(pilotId);
  return pilotId === 'camden_town' ? getCamdenHelp() : getLocalHelp(pilotId);
}
