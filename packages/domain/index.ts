import { createHash, randomUUID } from 'node:crypto';
import type {
  Category,
  DemoState,
  EvidenceGraph,
  Notice,
  Notification,
  Persona,
  Preferences,
  Report,
  ReportInput,
  DecisionInput,
} from '../contracts/index.js';
import { areas, pilotSchema } from '../contracts/index.js';

const MAX_IDEMPOTENCY_RECORDS = 100;
const MAX_REPORTS = 100;
const MAX_NOTIFICATIONS = 300;
const MAX_NOTICE_REVISIONS = 50;
const PUBLIC_WITHDRAWN_SUMMARY = 'A reviewed community summary was withdrawn.';
const WITHDRAWN_PLACE = 'Approximate local area removed';

export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function createDemoState(now = new Date()): DemoState {
  const seedCreatedAt = offsetIso(now, -45 * 60_000);
  const seedObservedAt = offsetIso(now, -30 * 60_000);
  const seedPublishedAt = offsetIso(now, -20 * 60_000);
  const hounslowReport = report({
    id: '10000000-0000-4000-8000-000000000001',
    owner: 'alex',
    pilotId: 'hounslow_town_centre',
    category: 'infrastructure',
    title: 'Lighting issue on the High Street approach',
    description: 'A fictional report notes a dark section near the reviewed High Street approach.',
    place: 'High Street approach',
    status: 'approved_for_summary',
    noticeId: '20000000-0000-4000-8000-000000000001',
  }, seedObservedAt, seedCreatedAt);
  const camdenReport = report({
    id: '10000000-0000-4000-8000-000000000002',
    owner: 'sam',
    pilotId: 'camden_town',
    category: 'access',
    title: 'Access update near Camden Town approach',
    description: 'A fictional report notes a temporary access concern near the reviewed station approach.',
    place: 'Camden Town station approach',
    status: 'approved_for_summary',
    noticeId: '20000000-0000-4000-8000-000000000002',
  }, seedObservedAt, seedCreatedAt);
  const croydonReport = report({
    id: '10000000-0000-4000-8000-000000000003',
    owner: 'sam',
    pilotId: 'west_croydon',
    category: 'transport',
    title: 'Interchange access observation',
    description: 'A fictional report notes changed wayfinding near the reviewed interchange.',
    place: 'West Croydon interchange',
    status: 'approved_for_summary',
    noticeId: '20000000-0000-4000-8000-000000000003',
  }, seedObservedAt, seedCreatedAt);

  return {
    schemaVersion: '1.0',
    reports: [
      hounslowReport,
      camdenReport,
      croydonReport,
      report({
        id: '10000000-0000-4000-8000-000000000004',
        owner: 'alex',
        pilotId: 'camden_town',
        category: 'community',
        title: 'Fictional Camden observation for review',
        description: 'A fictional, private community observation awaiting demonstration review.',
        place: 'Camden High Street approach',
        status: 'submitted',
        noticeId: null,
      }, seedObservedAt, seedCreatedAt),
      report({
        id: '10000000-0000-4000-8000-000000000005',
        owner: 'sam',
        pilotId: 'hounslow_town_centre',
        category: 'access',
        title: 'Fictional Hounslow observation for review',
        description: 'A fictional, private access observation awaiting demonstration review.',
        place: 'Treaty Centre approach',
        status: 'submitted',
        noticeId: null,
      }, seedObservedAt, seedCreatedAt),
    ],
    notices: [
      notice({
        id: '20000000-0000-4000-8000-000000000001',
        pilotId: 'hounslow_town_centre',
        category: 'infrastructure',
        title: 'Reviewed lighting issue near High Street approach',
        summary: 'A reviewed fictional community summary describes reduced lighting. It does not confirm a current fault.',
        place: 'High Street approach',
      }, seedObservedAt, seedPublishedAt),
      notice({
        id: '20000000-0000-4000-8000-000000000002',
        pilotId: 'camden_town',
        category: 'access',
        title: 'Reviewed access update near Camden Town',
        summary: 'A reviewed fictional community summary describes a temporary access concern. Check current operator information.',
        place: 'Camden Town station approach',
      }, seedObservedAt, seedPublishedAt),
      notice({
        id: '20000000-0000-4000-8000-000000000003',
        pilotId: 'west_croydon',
        category: 'transport',
        title: 'Reviewed interchange wayfinding update',
        summary: 'A reviewed fictional community summary describes changed wayfinding near the interchange.',
        place: 'West Croydon interchange',
      }, seedObservedAt, seedPublishedAt),
    ],
    preferences: {
      alex: preference(['hounslow_town_centre'], ['infrastructure']),
      sam: preference(['west_croydon'], ['transport']),
      moderator: preference(areas.map((area) => area.id), ['infrastructure', 'transport', 'access', 'community']),
    },
    notifications: [
      notification('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'alex', 'notice', 'delivered', seedPublishedAt),
      notification('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 1, 'sam', 'notice', 'delivered', seedPublishedAt),
    ],
    idempotency: {},
  };
}

export function listPublicNotices(state: DemoState, pilotId: string): Notice[] {
  const area = parsePilot(pilotId);
  return state.notices
    .filter((notice) => notice.pilotId === area && notice.status === 'active')
    .map(publicNotice);
}

export function findPublicNotice(state: DemoState, noticeId: string): Notice {
  return publicNotice(requireNotice(state, noticeId));
}

export function publicEvidenceGraph(state: DemoState, noticeId: string): EvidenceGraph {
  const notice = requireNotice(state, noticeId);
  if (notice.status !== 'active') {
    return {
      nodes: [{ id: notice.id, type: 'notice', label: notice.title }],
      edges: [],
      limitations: [
        'Synthetic demonstration data only.',
        'This notice is no longer current. Dependent public evidence links were removed.',
        'Private report identifiers and narratives are excluded from this graph.',
      ],
    };
  }
  const placeId = `place:${notice.pilotId}`;
  const sourceId = `source:community:${notice.pilotId}`;
  return {
    nodes: [
      { id: notice.id, type: 'notice', label: notice.title },
      { id: placeId, type: 'place', label: notice.place },
      { id: sourceId, type: 'source', label: 'Reviewed fictional community contribution' },
    ],
    edges: [
      { id: `edge:${notice.id}:place`, from: notice.id, to: placeId, predicate: 'AFFECTS_PLACE', reason: 'Reviewed approximate place relation.' },
      { id: `edge:${notice.id}:source`, from: notice.id, to: sourceId, predicate: 'ISSUED_BY', reason: 'Published after fictional moderation review.' },
    ],
    limitations: [
      'Synthetic demonstration data only.',
      'A reviewed community summary is not proof of an incident or current condition.',
      'Private report identifiers and narratives are excluded from this graph.',
    ],
  };
}

export function reportsForOwner(state: DemoState, owner: Persona): Report[] {
  return state.reports.filter((report) => report.owner === owner).map(copy);
}

export function moderationQueue(state: DemoState, actor: Persona, pilotId: string): Report[] {
  requireModerator(actor);
  const area = parsePilot(pilotId);
  return state.reports.filter((report) => report.pilotId === area && report.status !== 'withdrawn').map(copy);
}

export function submitReport(state: DemoState, actor: Persona, input: ReportInput): Report {
  requireMember(actor);
  if (state.reports.length >= MAX_REPORTS) {
    throw new DomainError(429, 'rate_limited', 'This synthetic session has reached its report limit.');
  }
  rejectSensitiveText([input.title, input.description, input.place]);
  const record: Report = {
    id: randomUUID(),
    revision: 1,
    owner: actor,
    pilotId: input.pilotId,
    category: input.category,
    title: input.title,
    description: input.description,
    place: input.place,
    observedAt: input.observedAt,
    status: 'submitted',
    createdAt: new Date().toISOString(),
    noticeId: null,
    synthetic: true,
  };
  state.reports.push(record);
  return copy(record);
}

export function withdrawReport(state: DemoState, actor: Persona, reportId: string, expectedRevision: number): Report {
  requireMember(actor);
  const report = requireOwnedReport(state, actor, reportId);
  requireRevision(report.revision, expectedRevision);
  if (report.noticeId) prepareNoticeChange(state, report.noticeId);
  report.revision += 1;
  report.status = 'withdrawn';
  report.title = 'Withdrawn report';
  report.description = '[withdrawn]';
  report.place = WITHDRAWN_PLACE;
  if (report.noticeId) {
    withdrawNotice(state, report.noticeId);
  }
  scrubCachedReportOutcomes(state, report);
  return copy(report);
}

export function decideReport(state: DemoState, actor: Persona, reportId: string, input: DecisionInput): Report {
  requireModerator(actor);
  rejectSensitiveText([input.summary]);
  const report = requireReport(state, reportId);
  requireRevision(report.revision, input.expectedRevision);

  if (input.action === 'approve') {
    if (report.status !== 'submitted') {
      throw new DomainError(409, 'conflict', 'Only submitted reports can be approved.');
    }
    ensureNotificationCapacity(state, pendingNotificationRecipientCount(state, report.pilotId, report.category));
    report.revision += 1;
    report.status = 'approved_for_summary';
    const approvedNotice = notice({
      id: randomUUID(),
      pilotId: report.pilotId,
      category: report.category,
      title: 'Reviewed community update',
      summary: input.summary,
      place: report.place,
    }, report.observedAt, new Date().toISOString());
    state.notices.push(approvedNotice);
    report.noticeId = approvedNotice.id;
    enqueueNotice(state, approvedNotice);
    return copy(report);
  }

  if (input.action === 'reject') {
    if (report.status !== 'submitted') {
      throw new DomainError(409, 'conflict', 'Only submitted reports can be rejected.');
    }
    report.revision += 1;
    report.status = 'rejected';
    return copy(report);
  }

  if (report.status !== 'approved_for_summary' || !report.noticeId) {
    throw new DomainError(409, 'conflict', 'Only an approved report can change its published notice.');
  }
  prepareNoticeChange(state, report.noticeId);
  report.revision += 1;
  reviseNotice(state, report.noticeId, input.action, input.summary);
  return copy(report);
}

export function readPreferences(state: DemoState, actor: Persona): Preferences {
  return copy(state.preferences[actor]);
}

export function updatePreferences(state: DemoState, actor: Persona, next: Preferences): Preferences {
  requireMember(actor);
  const current = state.preferences[actor];
  requireRevision(current.revision, next.revision - 1);
  state.preferences[actor] = copy(next);
  return copy(next);
}

export function personalisedFeed(state: DemoState, actor: Persona): Notice[] {
  requireMember(actor);
  const preferences = state.preferences[actor];
  return state.notices
    .filter((notice) => notice.status === 'active')
    .filter((notice) => preferences.areas.includes(notice.pilotId) && preferences.categories.includes(notice.category))
    .map((notice) => ({
      ...publicNotice(notice),
      reason: `Shown because you follow ${areaName(notice.pilotId)} and selected ${notice.category} updates.`,
    }));
}

export function notificationsFor(state: DemoState, actor: Persona): Notification[] {
  requireMember(actor);
  return state.notifications.filter((item) => item.recipient === actor).map(copy);
}

export function dispatchNotifications(state: DemoState, actor: Persona): Notification[] {
  requireMember(actor);
  const preferences = state.preferences[actor];
  for (const item of state.notifications) {
    if (item.recipient !== actor || item.state !== 'queued') continue;
    const notice = state.notices.find((candidate) => candidate.id === item.noticeId);
    const validRevision = notice?.revision === item.revision;
    const currentNotice = item.kind === 'correction'
      ? notice?.status === 'resolved' || notice?.status === 'retracted'
      : notice?.status === 'active';
    const matchesPreferences = item.kind === 'correction' || (notice &&
      preferences.areas.includes(notice.pilotId) && preferences.categories.includes(notice.category));
    if (!preferences.inAppEnabled || !validRevision || !currentNotice || !matchesPreferences) {
      item.state = 'suppressed';
      continue;
    }
    item.state = 'delivered';
  }
  return notificationsFor(state, actor);
}

export function replayOrRecord<T>(
  state: DemoState,
  key: string,
  fingerprint: string,
  operation: () => T,
): T {
  const existing = state.idempotency[key];
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new DomainError(409, 'conflict', 'Idempotency-Key was already used with different input.');
    }
    return copy(existing.result) as T;
  }
  const result = operation();
  state.idempotency[key] = { fingerprint, result: copy(result) };
  const keys = Object.keys(state.idempotency);
  while (keys.length > MAX_IDEMPOTENCY_RECORDS) {
    const oldest = keys.shift();
    if (oldest) delete state.idempotency[oldest];
  }
  return result;
}

export function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort()))
    .digest('hex');
}

function report(
  input: Omit<Report, 'revision' | 'createdAt' | 'observedAt' | 'synthetic'>,
  observedAt: string,
  createdAt: string,
): Report {
  return { ...input, revision: 1, createdAt, observedAt, synthetic: true };
}

function notice(
  input: Pick<Notice, 'id' | 'pilotId' | 'category' | 'title' | 'summary' | 'place'>,
  observedAt: string,
  publishedAt: string,
): Notice {
  const sourceId = `40000000-0000-4000-8000-${input.id.slice(-12)}`;
  return {
    ...input,
    revision: 1,
    status: 'active',
    observedAt,
    updatedAt: publishedAt,
    synthetic: true,
    reviewStatus: 'publication_approved',
    sourceKind: 'community_firsthand',
    evidence: [{
      id: sourceId,
      label: 'Reviewed fictional community contribution',
      sourceKind: 'community_firsthand',
      sourceUrl: null,
      sourceFamilyId: 'streetwise-demo-community',
      originGroupId: `demo-origin-${input.id}`,
      observedAt,
      fetchedAt: null,
      precision: 'approximate_place',
      synthetic: true,
    }],
    timeline: [{ revision: 1, status: 'active', at: publishedAt, summary: input.summary }],
  };
}

function preference(areas: Preferences['areas'], categories: Preferences['categories']): Preferences {
  return { revision: 1, areas, categories, inAppEnabled: true };
}

function notification(
  id: string,
  noticeId: string,
  revision: number,
  recipient: Persona,
  kind: Notification['kind'],
  state: Notification['state'],
  createdAt = new Date().toISOString(),
): Notification {
  return { id, noticeId, revision, recipient, kind, state, createdAt, message: genericMessage(kind) };
}

function enqueueNotice(state: DemoState, notice: Notice): void {
  const recipients = (['alex', 'sam'] as const).filter((recipient) => {
    const preferences = state.preferences[recipient];
    return preferences.inAppEnabled && preferences.areas.includes(notice.pilotId) && preferences.categories.includes(notice.category) &&
      !state.notifications.some((item) => item.noticeId === notice.id && item.revision === notice.revision && item.recipient === recipient && item.kind === 'notice');
  });
  ensureNotificationCapacity(state, recipients.length);
  for (const recipient of recipients) {
    const preferences = state.preferences[recipient];
    if (!preferences.inAppEnabled) continue;
    state.notifications.push(notification(randomUUID(), notice.id, notice.revision, recipient, 'notice', 'queued'));
  }
}

function pendingNotificationRecipientCount(state: DemoState, pilotId: Notice['pilotId'], category: Category): number {
  return (['alex', 'sam'] as const).filter((recipient) => {
    const preferences = state.preferences[recipient];
    return preferences.inAppEnabled && preferences.areas.includes(pilotId) && preferences.categories.includes(category);
  }).length;
}

function withdrawNotice(state: DemoState, noticeId: string): void {
  const notice = requireNotice(state, noticeId);
  prepareNoticeChange(state, noticeId);
  notice.revision += 1;
  notice.status = 'retracted';
  notice.summary = PUBLIC_WITHDRAWN_SUMMARY;
  notice.place = WITHDRAWN_PLACE;
  notice.evidence = [];
  notice.updatedAt = new Date().toISOString();
  notice.timeline = notice.timeline.map((entry) => ({ ...entry, summary: PUBLIC_WITHDRAWN_SUMMARY }));
  notice.timeline.push({ revision: notice.revision, status: 'retracted', at: notice.updatedAt, summary: PUBLIC_WITHDRAWN_SUMMARY });
  correctNotice(state, notice);
}

function reviseNotice(state: DemoState, noticeId: string, action: 'resolve' | 'retract', summary: string): void {
  const notice = requireNotice(state, noticeId);
  prepareNoticeChange(state, noticeId);
  notice.revision += 1;
  notice.status = action === 'resolve' ? 'resolved' : 'retracted';
  notice.summary = action === 'retract' ? summary : summary;
  notice.updatedAt = new Date().toISOString();
  notice.timeline.push({ revision: notice.revision, status: notice.status, at: notice.updatedAt, summary: notice.summary });
  correctNotice(state, notice);
}

function correctNotice(state: DemoState, notice: Notice): void {
  const deliveredRecipients = new Set<Persona>();
  for (const item of state.notifications) {
    if (item.noticeId !== notice.id) continue;
    if (item.kind === 'notice' && item.state === 'delivered') deliveredRecipients.add(item.recipient);
    if (item.kind === 'notice' && item.state === 'queued') item.state = 'suppressed';
  }
  for (const recipient of deliveredRecipients) {
    const exists = state.notifications.some((item) =>
      item.noticeId === notice.id && item.revision === notice.revision && item.recipient === recipient && item.kind === 'correction',
    );
    if (!exists) state.notifications.push(notification(randomUUID(), notice.id, notice.revision, recipient, 'correction', 'queued'));
  }
}

function correctionRecipientCount(state: DemoState, notice: Notice): number {
  return new Set(state.notifications
    .filter((item) => item.noticeId === notice.id && item.kind === 'notice' && item.state === 'delivered')
    .map((item) => item.recipient)).size;
}

function prepareNoticeChange(state: DemoState, noticeId: string): void {
  const notice = requireNotice(state, noticeId);
  ensureNoticeRevisionCapacity(notice);
  ensureNotificationCapacity(state, correctionRecipientCount(state, notice));
}

function ensureNotificationCapacity(state: DemoState, additions: number): void {
  if (state.notifications.length + additions > MAX_NOTIFICATIONS) {
    throw new DomainError(429, 'rate_limited', 'This synthetic session has reached its notification limit.');
  }
}

function ensureNoticeRevisionCapacity(notice: Notice): void {
  if (notice.revision >= MAX_NOTICE_REVISIONS) {
    throw new DomainError(429, 'rate_limited', 'This synthetic notice has reached its revision limit.');
  }
}

function scrubCachedReportOutcomes(state: DemoState, report: Report): void {
  for (const [key, entry] of Object.entries(state.idempotency)) {
    if (isReportOutcome(entry.result, report.id)) {
      entry.result = copy(report);
      entry.fingerprint = hashLegacyFingerprint(entry.fingerprint);
      state.idempotency[key] = entry;
    }
  }
}

function isReportOutcome(value: unknown, reportId: string): value is Report {
  return typeof value === 'object' && value !== null && (value as { id?: unknown }).id === reportId;
}

function hashLegacyFingerprint(value: string): string {
  return /^[a-f0-9]{64}$/.test(value) ? value : createHash('sha256').update(value).digest('hex');
}

function offsetIso(now: Date, milliseconds: number): string {
  return new Date(now.getTime() + milliseconds).toISOString();
}

function requireReport(state: DemoState, reportId: string): Report {
  const report = state.reports.find((candidate) => candidate.id === reportId);
  if (!report) throw new DomainError(404, 'not_found', 'Record was not found.');
  return report;
}

function requireOwnedReport(state: DemoState, actor: Persona, reportId: string): Report {
  const report = requireReport(state, reportId);
  if (report.owner !== actor) throw new DomainError(404, 'not_found', 'Record was not found.');
  return report;
}

function requireNotice(state: DemoState, noticeId: string): Notice {
  const notice = state.notices.find((candidate) => candidate.id === noticeId);
  if (!notice) throw new DomainError(404, 'not_found', 'Record was not found.');
  return notice;
}

function parsePilot(value: string) {
  const parsed = pilotSchema.safeParse(value);
  if (!parsed.success) throw new DomainError(400, 'invalid_input', 'A configured pilot area is required.');
  return parsed.data;
}

function requireRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new DomainError(409, 'conflict', 'This record has changed. Refresh and try again.');
}

function requireMember(actor: Persona): void {
  if (actor === 'moderator') throw new DomainError(403, 'unauthorised', 'This action requires a demo member session.');
}

function requireModerator(actor: Persona): void {
  if (actor !== 'moderator') throw new DomainError(403, 'unauthorised', 'This action requires the demo moderator session.');
}

function areaName(pilotId: Notice['pilotId']): string {
  return areas.find((area) => area.id === pilotId)?.name ?? 'this area';
}

function genericMessage(kind: Notification['kind']): string {
  return kind === 'correction'
    ? 'A reviewed Streetwise update you saw has changed.'
    : 'A reviewed Streetwise update matches your saved preferences.';
}

function rejectSensitiveText(values: string[]): void {
  const prohibited = /\b(case\s*(?:reference|number)|crime\s*reference)\b|\b\d{7,}\b|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/i;
  if (values.some((value) => prohibited.test(value))) {
    throw new DomainError(400, 'invalid_input', 'Use a short factual description without names, contact details, or case references.');
  }
}

function publicNotice(notice: Notice): Notice {
  const projection = copy(notice);
  if (projection.status !== 'active') projection.evidence = [];
  if (projection.status === 'retracted') projection.place = WITHDRAWN_PLACE;
  return projection;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}
