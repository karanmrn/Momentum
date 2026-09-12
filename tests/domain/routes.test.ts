import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DemoState, Store } from '../../packages/contracts/index.js';
import { createDemoState } from '../../packages/domain/index.js';
import { createRoutes } from '../../server/routes.js';

describe('workflow HTTP routes', () => {
  let baseUrl = '';
  let close: () => Promise<void>;

  beforeAll(async () => {
    const stateBySession = new Map<string, DemoState>();
    const store: Store = {
      async read(sessionId) {
        return stateBySession.get(sessionId) ?? createSession(sessionId);
      },
      async mutate(sessionId, operation) {
        const state = stateBySession.get(sessionId) ?? createSession(sessionId);
        return operation(state);
      },
    };
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    app.use((request, response, next) => {
      response.locals.sessionId = 'isolated-demo-session';
      response.locals.persona = request.header('X-Demo-Persona') ?? 'alex';
      next();
    });
    app.use('/api', createRoutes(store));
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

    function createSession(sessionId: string): DemoState {
      const state = createDemoState();
      stateBySession.set(sessionId, state);
      return state;
    }
  });

  afterAll(async () => close());

  it('returns only past seed timestamps through the HTTP workflow', async () => {
    const feed = await fetch(`${baseUrl}/api/feed?area=hounslow_town_centre`);
    const feedBody = await feed.json();
    const generatedAt = Date.parse(feedBody.generatedAt);
    const seedNotice = feedBody.data[0];
    expect(Date.parse(seedNotice.observedAt)).toBeLessThan(generatedAt);
    expect(Date.parse(seedNotice.updatedAt)).toBeLessThan(generatedAt);

    const inbox = await fetch(`${baseUrl}/api/me/notifications`);
    const inboxBody = await inbox.json();
    expect(Date.parse(inboxBody.data[0].createdAt)).toBeLessThan(Date.parse(inboxBody.generatedAt));
  });

  it('uses server session identity, requires JSON and enforces idempotency', async () => {
    const input = {
      pilotId: 'hounslow_town_centre',
      category: 'infrastructure',
      title: 'Fictional report for HTTP testing',
      description: 'A fictional factual description without personal details.',
      place: 'High Street approach',
      observedAt: '2026-09-12T18:30:00.000Z',
      synthetic: true,
      moderator: true,
    };
    const rejected = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'report-key-12345' },
      body: JSON.stringify(input),
    });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error.code).toBe('invalid_input');

    delete (input as { moderator?: boolean }).moderator;
    const submit = () => fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'report-key-12345' },
      body: JSON.stringify(input),
    });
    const first = await submit();
    const firstBody = await first.json();
    const replay = await submit();
    const replayBody = await replay.json();
    expect(first.status).toBe(201);
    expect(replayBody.data.id).toBe(firstBody.data.id);

    const samReports = await fetch(`${baseUrl}/api/reports`, { headers: { 'X-Demo-Persona': 'sam' } });
    expect((await samReports.json()).data.map((report: { id: string }) => report.id)).not.toContain(firstBody.data.id);

    const missingJson = await fetch(`${baseUrl}/api/me/notifications/dispatch`, {
      method: 'POST',
      headers: { 'X-Demo-Persona': 'alex' },
    });
    expect(missingJson.status).toBe(400);
  });
});
