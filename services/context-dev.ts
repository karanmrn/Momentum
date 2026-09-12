import ContextDev from 'context.dev';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const sources = {
  C01: 'https://www.camden.gov.uk/staying-safe-at-night',
  C02: 'https://www.camden.gov.uk/safe-havens',
} as const;
const reviewedFinalUrls: {[sourceId in keyof typeof sources]: readonly string[]} = {
  C01: [sources.C01],
  C02: [sources.C02],
};
const responseSchema = z.object({
  success: z.literal(true), markdown: z.string().trim().min(1).max(200_000),
  url: z.string().url(),
  metadata: z.object({finalUrl: z.string().url(), publishedTime: z.string().optional(), modifiedTime: z.string().optional()}).passthrough().optional(),
  cache_metadata: z.object({status: z.enum(['hit', 'miss', 'zdr']), age_ms: z.number().nonnegative()}).optional(),
  request_id: z.string().optional(),
  key_metadata: z.object({credits_consumed: z.number().nonnegative()}).passthrough().optional(),
});
export function validateContextResponse(input: unknown, sourceId: keyof typeof sources) {
  const data = responseSchema.parse(input);
  const finalUrl = data.metadata?.finalUrl ?? data.url;
  if (data.url !== sources[sourceId] || !reviewedFinalUrls[sourceId].includes(finalUrl)) {
    throw new Error('Source redirect is not allowed.');
  }
  return {
    sourceId, sourceUrl: sources[sourceId], finalUrl, retrievedAt: new Date().toISOString(),
    sourcePublishedAt: data.metadata?.publishedTime ?? null,
    sourceModifiedAt: data.metadata?.modifiedTime ?? null,
    providerCache: data.cache_metadata ?? null,
    markdown: data.markdown, sha256: createHash('sha256').update(data.markdown).digest('hex'),
    requestId: data.request_id ?? null, creditsConsumed: data.key_metadata?.credits_consumed ?? null,
    publicationAllowed: false as const, reviewStatus: 'unreviewed' as const,
  };
}
/** Server-only research. This function never writes a public notice. */
export async function scrapeContextSource(sourceId: keyof typeof sources) {
  if (typeof window !== 'undefined') throw new Error('Server execution is required.');
  if (!Object.hasOwn(sources, sourceId)) throw new Error('Source is not allowed.');
  if (!process.env.CONTEXT_DEV_API_KEY) throw new Error('CONTEXT_DEV_API_KEY is not configured.');
  const client = new ContextDev({apiKey: process.env.CONTEXT_DEV_API_KEY, maxRetries: 0, timeout: 45_000});
  // One attempt preserves the explicit one-call credit limit. Failed requests need operator review.
  try {
    const result = await client.web.webScrapeMd({url: sources[sourceId], useMainContentOnly: true, maxAgeMs: 0, timeoutMS: 30_000});
    return validateContextResponse(result, sourceId);
  } catch { throw new Error('Context.dev source is unavailable. No content was published.'); }
}
