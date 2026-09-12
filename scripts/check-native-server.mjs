import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

// Load emitted ESM through Node, without Vite, tsx, or Vitest import resolution.
process.env.VERCEL = '1';
delete process.env.DATABASE_URL;
delete process.env.DEMO_ACCESS_CODE;
const { default: handler } = await import('../.vercel/native-server/api/index.js');
const server = createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const area of ['hounslow_town_centre', 'camden_town', 'west_croydon']) {
    const response = await fetch(`${base}/api/public/datasets?area=${area}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal((await response.json()).data.length, 6);
  }
  const privateResponse = await fetch(`${base}/api/session`);
  assert.equal(privateResponse.status, 503);
  console.log('Native ESM startup and three public dataset routes passed; private storage remains gated.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
