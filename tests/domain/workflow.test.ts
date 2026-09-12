import { describe, expect, it, vi } from 'vitest';
import type { ReportInput } from '../../packages/contracts/index.js';
import {
  DomainError,
  createDemoState,
  decideReport,
  dispatchNotifications,
  fingerprint,
  notificationsFor,
  findPublicNotice,
  publicEvidenceGraph,
  replayOrRecord,
  reportsForOwner,
  submitReport,
  updatePreferences,
  withdrawReport,
} from '../../packages/domain/index.js';

const alexInput: ReportInput = {
  pilotId: 'hounslow_town_centre',
  category: 'infrastructure',
  title: 'Fictional lighting observation',
  description: 'A fictional description with no personal details.',
  place: 'Fictional plaza approach',
  observedAt: '2026-09-12T18:30:00.000Z',
  synthetic: true,
};

describe('Streetwise synthetic workflow', () => {
  it('creates seed timestamps before the supplied demonstration clock', () => {
    const clock = new Date('2026-09-12T13:16:00.000Z');
    const state = createDemoState(clock);

    for (const report of state.reports) expect(Date.parse(report.createdAt)).toBeLessThan(Date.parse(report.observedAt));
    for (const notice of state.notices) {
      expect(Date.parse(notice.observedAt)).toBeLessThan(Date.parse(notice.updatedAt));
      expect(Date.parse(notice.updatedAt)).toBeLessThan(Date.parse(clock.toISOString()));
    }
    for (const notification of state.notifications) expect(Date.parse(notification.createdAt)).toBeLessThan(Date.parse(clock.toISOString()));
  });

  it('keeps reports owner-private and omits report identifiers and narratives from public graph data', () => {
    const state = createDemoState();
    const privateReport = submitReport(state, 'alex', alexInput);

    expect(reportsForOwner(state, 'sam').map((report) => report.id)).not.toContain(privateReport.id);
    const graph = publicEvidenceGraph(state, '20000000-0000-4000-8000-000000000001');
    const publicText = JSON.stringify(graph);
    expect(publicText).not.toContain(privateReport.id);
    expect(publicText).not.toContain(privateReport.description);
    expect(graph.nodes.every((node) => node.type !== 'observation')).toBe(true);
  });

  it('replays identical report submissions and rejects a reused idempotency key with changed input', () => {
    const state = createDemoState();
    const first = replayOrRecord(state, 'report:alex:key-12345', fingerprint(alexInput), () => submitReport(state, 'alex', alexInput));
    const replay = replayOrRecord(state, 'report:alex:key-12345', fingerprint(alexInput), () => submitReport(state, 'alex', alexInput));

    expect(replay.id).toBe(first.id);
    expect(reportsForOwner(state, 'alex').filter((report) => report.id === first.id)).toHaveLength(1);
    expect(() => replayOrRecord(state, 'report:alex:key-12345', fingerprint({ ...alexInput, title: 'Different fictional title' }), () => first))
      .toThrow(expect.objectContaining<Partial<DomainError>>({ status: 409, code: 'conflict' }));
  });

  it('uses revisions and removes a withdrawn narrative from the current public projection', () => {
    const state = createDemoState();
    const report = state.reports.find((item) => item.owner === 'alex' && item.noticeId)!;
    const withdrawn = withdrawReport(state, 'alex', report.id, report.revision);
    const notice = state.notices.find((item) => item.id === report.noticeId)!;

    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.description).toBe('[withdrawn]');
    expect(notice.status).toBe('retracted');
    expect(notice.summary).toBe('A reviewed community summary was withdrawn.');
    expect(findPublicNotice(state, notice.id).evidence).toEqual([]);
    expect(publicEvidenceGraph(state, notice.id).edges).toEqual([]);
    expect(() => withdrawReport(state, 'alex', report.id, 1))
      .toThrow(expect.objectContaining<Partial<DomainError>>({ status: 409, code: 'conflict' }));
  });

  it('scrubs report-linked idempotency outcomes and keeps a withdrawal replay redacted', () => {
    const state = createDemoState();
    const submitted = replayOrRecord(state, 'report:alex:withdraw-replay-key', fingerprint(alexInput), () => submitReport(state, 'alex', alexInput));
    const approved = decideReport(state, 'moderator', submitted.id, {
      expectedRevision: submitted.revision,
      action: 'approve',
      summary: 'A reviewed fictional summary describes a lighting observation.',
    });
    const legacyRawFingerprint = JSON.stringify(alexInput, Object.keys(alexInput).sort());
    state.idempotency['report:alex:withdraw-replay-key'].fingerprint = legacyRawFingerprint;
    const reportCount = state.reports.length;
    withdrawReport(state, 'alex', approved.id, approved.revision);

    const replay = replayOrRecord(state, 'report:alex:withdraw-replay-key', fingerprint(alexInput), () => submitReport(state, 'alex', alexInput));
    expect(replay.description).toBe('[withdrawn]');
    expect(replay.place).toBe('Approximate local area removed');
    expect(state.reports).toHaveLength(reportCount);
    expect(state.idempotency['report:alex:withdraw-replay-key'].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state)).not.toContain(alexInput.title);
    expect(JSON.stringify(state)).not.toContain(alexInput.description);
    expect(JSON.stringify(state)).not.toContain(alexInput.place);
    const withdrawnNotice = findPublicNotice(state, approved.noticeId!);
    expect(withdrawnNotice.place).toBe('Approximate local area removed');
    expect(withdrawnNotice.evidence).toEqual([]);
  });

  it('uses the current enqueue time for new notifications', () => {
    vi.useFakeTimers();
    try {
      const seedTime = new Date('2026-09-12T13:00:00.000Z');
      vi.setSystemTime(new Date('2026-09-12T13:20:00.000Z'));
      const state = createDemoState(seedTime);
      const pending = submitReport(state, 'alex', alexInput);
      const approved = decideReport(state, 'moderator', pending.id, {
        expectedRevision: pending.revision,
        action: 'approve',
        summary: 'A reviewed fictional summary describes a lighting observation.',
      });
      const queued = state.notifications.find((item) => item.noticeId === approved.noticeId && item.kind === 'notice');
      expect(queued?.createdAt).toBe('2026-09-12T13:20:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds reports and notification rows in one synthetic session', () => {
    const state = createDemoState();
    const original = state.reports[0];
    state.reports = Array.from({ length: 100 }, (_, index) => ({ ...original, id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
    expect(() => submitReport(state, 'alex', alexInput))
      .toThrow(expect.objectContaining<Partial<DomainError>>({ status: 429, code: 'rate_limited' }));

    const notificationState = createDemoState();
    const pending = submitReport(notificationState, 'alex', alexInput);
    notificationState.notifications = Array.from({ length: 300 }, (_, index) => ({
      ...notificationState.notifications[0],
      id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    expect(() => decideReport(notificationState, 'moderator', pending.id, {
      expectedRevision: pending.revision,
      action: 'approve',
      summary: 'A reviewed fictional summary describes a lighting observation.',
    })).toThrow(expect.objectContaining<Partial<DomainError>>({ status: 429, code: 'rate_limited' }));
    expect(notificationState.reports.find((report) => report.id === pending.id)?.status).toBe('submitted');
  });

  it('queues a correction for a prior recipient and suppresses an ordinary notice after unsubscribe', () => {
    const state = createDemoState();
    const seeded = state.reports.find((item) => item.owner === 'alex' && item.noticeId)!;
    decideReport(state, 'moderator', seeded.id, {
      expectedRevision: seeded.revision,
      action: 'resolve',
      summary: 'This fictional update has been resolved after review.',
    });
    const correction = notificationsFor(state, 'alex').find((item) => item.kind === 'correction');
    expect(correction?.state).toBe('queued');
    dispatchNotifications(state, 'alex');
    expect(notificationsFor(state, 'alex').find((item) => item.id === correction?.id)?.state).toBe('delivered');

    const pending = submitReport(state, 'alex', alexInput);
    const approved = decideReport(state, 'moderator', pending.id, {
      expectedRevision: pending.revision,
      action: 'approve',
      summary: 'A reviewed fictional summary describes a lighting observation.',
    });
    const queued = notificationsFor(state, 'alex').find((item) => item.noticeId === approved.noticeId && item.kind === 'notice');
    expect(queued?.state).toBe('queued');
    const existingPreferences = state.preferences.alex;
    updatePreferences(state, 'alex', { ...existingPreferences, revision: existingPreferences.revision + 1, inAppEnabled: false });
    dispatchNotifications(state, 'alex');
    expect(notificationsFor(state, 'alex').find((item) => item.id === queued?.id)?.state).toBe('suppressed');
  });
});
