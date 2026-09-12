import type {
  DemoState,
  Notice,
  Persona,
  PilotId,
} from "../contracts/index.js";
import { followCatalog, referenceIdsForPlace } from "./catalog.js";
import {
  settingsInputSchema,
  revisionInputSchema,
  personalizationStateSchema,
  type Settings,
  type TimeWindow,
  type Delivery,
  type PersonalizationState,
  type PreferenceRecord,
} from "./schema.js";
export * from "./schema.js";
export { followCatalog } from "./catalog.js";
export type PersonalizationHost = DemoState & {
  personalization?: PersonalizationState;
};
type Member = "alex" | "sam";
export class PersonalizationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function member(actor: Persona): Member {
  if (actor !== "alex" && actor !== "sam")
    throw new PersonalizationError(
      403,
      "forbidden",
      "Choose a member demonstration persona.",
    );
  return actor;
}
export function defaultSettings(state: DemoState, actor: Member): Settings {
  return {
    areas: [...state.preferences[actor].areas],
    categories: [...state.preferences[actor].categories],
    follows: [],
    access: [],
    transportModes: [],
    language: "en",
    timeZone: "Europe/London",
    travelWindow: null,
    quietHours: null,
    mutedNoticeIds: [],
    paused: false,
    inAppEnabled: state.preferences[actor].inAppEnabled,
    historicalDigest: false,
  };
}
export function readPersonalization(
  state: PersonalizationHost,
): PersonalizationState {
  return state.personalization
    ? personalizationStateSchema.parse(state.personalization)
    : {
        version: "1.0",
        members: {
          alex: {
            revision: 1,
            settings: defaultSettings(state, "alex"),
            deleted: false,
          },
          sam: {
            revision: 1,
            settings: defaultSettings(state, "sam"),
            deleted: false,
          },
        },
        outbox: { alex: [], sam: [] },
      };
}
function persist(state: PersonalizationHost, data: PersonalizationState) {
  state.personalization = personalizationStateSchema.parse(data);
}
export function readPersonalSettings(
  state: PersonalizationHost,
  actor: Persona,
): PreferenceRecord {
  return structuredClone(readPersonalization(state).members[member(actor)]);
}
const london = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minute = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
/** Evaluate the instant in local civil time. Both repeated DST hours follow the same explicit window. */
export function withinWindow(now: Date, window: TimeWindow | null): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  if (!window) return true;
  const parts = london.formatToParts(now),
    get = (kind: string) => parts.find((p) => p.type === kind)?.value ?? "";
  const day = days.indexOf(get("weekday")),
    time = Number(get("hour")) * 60 + Number(get("minute"));
  const start = minute(window.start),
    end = minute(window.end);
  return start < end
    ? window.days.includes(day) && time >= start && time < end
    : (time >= start && window.days.includes(day)) ||
        (time < end && window.days.includes((day + 6) % 7));
}
export interface NoticeContext {
  referenceIds?: string[];
  access?: Settings["access"];
  transportModes?: Settings["transportModes"];
  language?: Settings["language"];
  validFrom?: string;
  validTo?: string;
  sourceCurrent?: boolean;
}
export type Contexts = Readonly<Record<string, NoticeContext>>;
export interface RelevantNotice {
  notice: Notice;
  reasonCodes: string[];
  reasons: string[];
  orderingVersion: "explicit/1";
}
// These are demo policy limits, measured from the observation. Re-fetching never renews them.
export const demoFreshnessHours = {
  infrastructure: 48,
  transport: 2,
  access: 12,
  community: 24,
} as const;
function expiresAt(notice: Notice, context: NoticeContext): number {
  const fallback =
    Date.parse(notice.observedAt) +
    demoFreshnessHours[notice.category] * 3600000;
  const supplied =
    context.validTo === undefined ? fallback : Date.parse(context.validTo);
  return Math.min(fallback, supplied);
}
function current(notice: Notice, now: Date, context: NoticeContext): boolean {
  const start = Date.parse(context.validFrom ?? notice.observedAt),
    end = expiresAt(notice, context);
  return (
    notice.status === "active" &&
    notice.reviewStatus === "publication_approved" &&
    notice.synthetic === true &&
    ["community_firsthand", "community_other_source"].includes(notice.sourceKind) &&
    notice.evidence.length > 0 &&
    notice.evidence.every((e) => e.synthetic === true) &&
    context.sourceCurrent !== false &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now.getTime() &&
    end > now.getTime()
  );
}
export function currentPersonalNotice(
  state: PersonalizationHost,
  id: string,
  now = new Date(),
  contexts: Contexts = {},
): Notice | null {
  const notice = state.notices.find((row) => row.id === id);
  return notice && current(notice, now, contexts[id] ?? {})
    ? structuredClone(notice)
    : null;
}
function match(
  notice: Notice,
  settings: Settings,
  now: Date,
  contexts: Contexts,
): { codes: string[]; reasons: string[]; rank: number[] } | null {
  const context = contexts[notice.id] ?? {};
  if (
    !current(notice, now, context) ||
    !settings.categories.includes(notice.category) ||
    settings.mutedNoticeIds.includes(notice.id) ||
    !withinWindow(now, settings.travelWindow)
  )
    return null;
  const ids = [
    ...referenceIdsForPlace(notice.pilotId, notice.place),
    ...(context.referenceIds ?? []),
  ];
  const targets = followCatalog.filter(
    (t) =>
      t.pilotId === notice.pilotId &&
      settings.follows.includes(t.id) &&
      ids.includes(t.id),
  );
  const area = settings.areas.includes(notice.pilotId);
  if (!area && !targets.length) return null;
  const codes = ["selected_category"],
    reasons = [`You selected ${notice.category} updates.`];
  if (area) {
    codes.push("follows_area");
    reasons.push("You follow this area.");
  }
  for (const target of targets) {
    codes.push(`follows_${target.kind}`);
    reasons.push(
      `You follow ${target.label}${target.review === "candidate_boundary_unreviewed" ? " (candidate location)" : ""}.`,
    );
  }
  if (settings.travelWindow) {
    codes.push("within_chosen_time_window");
    reasons.push("This is within your chosen travel window.");
  }
  const access = (context.access ?? []).some((v) =>
    settings.access.includes(v),
  );
  const transport = (context.transportModes ?? []).some((v) =>
    settings.transportModes.includes(v),
  );
  const language =
    context.language !== undefined && context.language === settings.language;
  if (access) {
    codes.push("selected_access_updates");
    reasons.push("The source tags match your access choices.");
  }
  if (transport) {
    codes.push("selected_transport_mode");
    reasons.push("The source tags match your transport choices.");
  }
  if (language) {
    codes.push("preferred_content_language");
    reasons.push("The source content uses your preferred language.");
  }
  return {
    codes,
    reasons,
    rank: [
      targets.length ? 1 : 0,
      access ? 1 : 0,
      transport ? 1 : 0,
      language ? 1 : 0,
      Date.parse(notice.updatedAt),
    ],
  };
}
export function relevantNotices(
  state: PersonalizationHost,
  actor: Persona,
  now = new Date(),
  contexts: Contexts = {},
): RelevantNotice[] {
  const settings = readPersonalSettings(state, actor);
  if (settings.deleted || settings.settings.paused) return [];
  return state.notices
    .flatMap((notice) => {
      const found = match(notice, settings.settings, now, contexts);
      return found
        ? [
            {
              notice: structuredClone(notice),
              reasonCodes: found.codes,
              reasons: found.reasons,
              orderingVersion: "explicit/1" as const,
              rank: found.rank,
            },
          ]
        : [];
    })
    .sort((a, b) => {
      for (let i = 0; i < a.rank.length; i++) {
        const difference = b.rank[i] - a.rank[i];
        if (difference) return difference;
      }
      return a.notice.id.localeCompare(b.notice.id);
    })
    .map(({ rank: _rank, ...row }) => row);
}
export function savePersonalSettings(
  state: PersonalizationHost,
  actor: Persona,
  input: unknown,
  now = new Date(),
  contexts: Contexts = {},
): PreferenceRecord {
  const who = member(actor),
    parsed = settingsInputSchema.parse(input),
    data = readPersonalization(state),
    previous = data.members[who];
  if (previous.revision !== parsed.expectedRevision)
    throw new PersonalizationError(
      409,
      "conflict",
      "Preferences changed. Reload before saving your draft.",
    );
  data.members[who] = {
    revision: previous.revision + 1,
    settings: parsed.settings,
    deleted: false,
  };
  for (const item of data.outbox[who])
    if (["queued", "failed", "attempted"].includes(item.state)) {
      const notice = state.notices.find((n) => n.id === item.noticeId);
      if (
        !parsed.settings.inAppEnabled ||
        parsed.settings.paused ||
        !notice ||
        (item.kind !== "correction" &&
          !match(notice, parsed.settings, now, contexts))
      ) {
        item.state = "suppressed";
        item.reason = "settings_changed";
        item.nextAttemptAt = null;
      }
    }
  persist(state, data);
  return structuredClone(data.members[who]);
}
export function resetPersonalSettings(
  state: PersonalizationHost,
  actor: Persona,
  input: unknown,
): PreferenceRecord {
  const who = member(actor),
    { expectedRevision } = revisionInputSchema.parse(input);
  return savePersonalSettings(state, who, {
    expectedRevision,
    settings: {
      ...defaultSettings(state, who),
      areas: [],
      categories: [],
      inAppEnabled: false,
    },
  });
}
export function deletePersonalSettings(
  state: PersonalizationHost,
  actor: Persona,
  input: unknown,
): PreferenceRecord {
  const who = member(actor),
    { expectedRevision } = revisionInputSchema.parse(input),
    data = readPersonalization(state);
  if (data.members[who].revision !== expectedRevision)
    throw new PersonalizationError(
      409,
      "conflict",
      "Preferences changed. Reload before deleting.",
    );
  data.members[who] = {
    revision: expectedRevision + 1,
    settings: {
      ...defaultSettings(state, who),
      areas: [],
      categories: [],
      inAppEnabled: false,
    },
    deleted: true,
  };
  data.outbox[who] = [];
  persist(state, data);
  return structuredClone(data.members[who]);
}
export function exportPersonalSettings(
  state: PersonalizationHost,
  actor: Persona,
) {
  const who = member(actor),
    data = readPersonalization(state);
  return {
    schemaVersion: "1.0",
    synthetic: true,
    preferences: structuredClone(data.members[who]),
    inbox: structuredClone(data.outbox[who]),
  };
}
export function personalInbox(
  state: PersonalizationHost,
  actor: Persona,
): Delivery[] {
  return structuredClone(readPersonalization(state).outbox[member(actor)]);
}
function append(
  data: PersonalizationState,
  who: Member,
  notice: Notice,
  kind: Delivery["kind"],
  now: Date,
  contexts: Contexts,
) {
  const id = `${notice.id}:${notice.revision}:${kind}:in_app`;
  if (data.outbox[who].some((item) => item.id === id)) return;
  if (data.outbox[who].length >= 300)
    throw new PersonalizationError(
      429,
      "capacity",
      "The demonstration inbox is full. Delete its data before continuing.",
    );
  const end =
    kind === "correction"
      ? now.getTime() + 24 * 3600000
      : expiresAt(notice, contexts[notice.id] ?? {});
  data.outbox[who].push({
    id,
    noticeId: notice.id,
    noticeRevision: notice.revision,
    kind,
    channel: "in_app",
    state: "queued",
    createdAt: now.toISOString(),
    expiresAt: new Date(end).toISOString(),
    nextAttemptAt: null,
    attempts: 0,
    reason: "queued",
    history: [],
    message:
      kind === "correction"
        ? "A saved update has changed. Open its current status."
        : "An update matches your selected settings.",
  });
}
/** Call inside Store.mutate after publication changes. Never accepts a recipient from a request. */
export function queuePersonalUpdates(
  state: PersonalizationHost,
  actor: Persona,
  now = new Date(),
  contexts: Contexts = {},
): Delivery[] {
  const who = member(actor),
    data = readPersonalization(state),
    settings = data.members[who];
  for (const item of data.outbox[who]) {
    const notice = state.notices.find((n) => n.id === item.noticeId);
    if (
      ["queued", "failed", "attempted"].includes(item.state) &&
      (!notice ||
        notice.revision !== item.noticeRevision ||
        (item.kind === "notice" && notice.status !== "active"))
    ) {
      item.state = "suppressed";
      item.reason = "notice_changed";
      item.nextAttemptAt = null;
    }
  }
  if (
    !settings.deleted &&
    settings.settings.inAppEnabled &&
    !settings.settings.paused
  ) {
    const received = new Map<string, number>();
    for (const item of data.outbox[who])
      if (item.state === "delivered")
        received.set(
          item.noticeId,
          Math.max(received.get(item.noticeId) ?? 0, item.noticeRevision),
        );
    for (const row of relevantNotices(state, who, now, contexts))
      if (!received.has(row.notice.id))
        append(data, who, row.notice, "notice", now, contexts);
    for (const notice of state.notices)
      if (received.has(notice.id) && notice.revision > received.get(notice.id)!)
        append(data, who, notice, "correction", now, contexts);
  }
  persist(state, data);
  return personalInbox(state, who);
}
/** Injectable delivery is only an in-app storage operation. No provider/network operation is implemented. */
export async function dispatchPersonalUpdates(
  state: PersonalizationHost,
  actor: Persona,
  now = new Date(),
  contexts: Contexts = {},
  deliver: (item: Readonly<Delivery>) => void | Promise<void> = () => {},
): Promise<Delivery[]> {
  const who = member(actor);
  queuePersonalUpdates(state, who, now, contexts);
  const data = readPersonalization(state),
    record = data.members[who],
    settings = record.settings;
  for (const item of data.outbox[who]) {
    if (!["queued", "failed", "attempted"].includes(item.state)) continue;
    const notice = state.notices.find((n) => n.id === item.noticeId);
    if (Date.parse(item.expiresAt) <= now.getTime()) {
      item.state = "suppressed";
      item.reason = "expired";
      item.nextAttemptAt = null;
      continue;
    }
    const valid =
      notice &&
      notice.revision === item.noticeRevision &&
      (item.kind === "correction" || match(notice, settings, now, contexts));
    if (
      record.deleted ||
      !settings.inAppEnabled ||
      settings.mutedNoticeIds.includes(item.noticeId) ||
      !valid
    ) {
      item.state = "suppressed";
      item.reason = valid ? "settings_changed" : "notice_changed";
      item.nextAttemptAt = null;
      continue;
    }
    if (settings.paused) {
      item.reason = "paused";
      continue;
    }
    if (settings.quietHours && withinWindow(now, settings.quietHours)) {
      item.reason = "quiet_hours";
      continue;
    }
    if (item.nextAttemptAt && Date.parse(item.nextAttemptAt) > now.getTime())
      continue;
    if (item.attempts >= 3) {
      item.state = "suppressed";
      item.reason = "retry_exhausted";
      continue;
    }
    item.attempts++;
    item.state = "attempted";
    item.history.push({ at: now.toISOString(), state: "attempted" });
    try {
      await deliver(structuredClone(item));
      item.state = "delivered";
      item.reason = "delivered";
      item.nextAttemptAt = null;
      item.history.push({ at: now.toISOString(), state: "delivered" });
    } catch {
      item.state = item.attempts >= 3 ? "suppressed" : "failed";
      item.reason = item.attempts >= 3 ? "retry_exhausted" : "delivery_failed";
      item.nextAttemptAt =
        item.attempts >= 3
          ? null
          : new Date(
              now.getTime() + 5000 * 2 ** (item.attempts - 1),
            ).toISOString();
      item.history.push({ at: now.toISOString(), state: "failed" });
    }
  }
  persist(state, data);
  return personalInbox(state, who);
}
export function followedAreas(settings: Settings): PilotId[] {
  return [
    ...new Set([
      ...settings.areas,
      ...followCatalog
        .filter((t) => settings.follows.includes(t.id))
        .map((t) => t.pilotId),
    ]),
  ];
}
