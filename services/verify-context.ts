import { mkdir, writeFile } from 'node:fs/promises';
import { scrapeContextSource } from './context-dev';

try {
  const result = await scrapeContextSource('C01');
  await mkdir('research/acquisition', {recursive: true});
  await writeFile('research/acquisition/context-camden.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({sourceId: result.sourceId, sourceUrl: result.sourceUrl, retrievedAt: result.retrievedAt, characters: result.markdown.length, creditsConsumed: result.creditsConsumed, publicationAllowed: result.publicationAllowed}));
} catch {
  console.error('Context.dev validation failed. No content was published.');
  process.exitCode = 1;
}
