import type {
  Area,
  DecisionInput,
  Envelope,
  EvidenceGraph,
  HelpCard,
  HistoricalCoverage,
  Notice,
  Notification,
  Persona,
  Preferences,
  PreferencesInput,
  Report,
  ReportInput,
  SessionView,
  SourceCard,
} from "../packages/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string } };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as Envelope<T> &
    ApiErrorBody;
  if (!response.ok)
    throw new ApiError(
      body.error?.message || `Request failed (${response.status})`,
      response.status,
      body.error?.code,
    );
  return body.data;
}

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export const api = {
  session: () => request<SessionView>("/api/session"),
  setPersona: (persona: Persona) =>
    request<SessionView>("/api/session", {
      method: "POST",
      body: JSON.stringify({ persona }),
    }),
  areas: () => request<Area[]>("/api/areas"),
  feed: (area: string) =>
    request<Notice[]>(`/api/feed?area=${encodeURIComponent(area)}`),
  notice: (id: string) =>
    request<Notice>(`/api/notices/${encodeURIComponent(id)}`),
  evidence: (id: string) =>
    request<EvidenceGraph>(`/api/notices/${encodeURIComponent(id)}/evidence`),
  help: (area: string) =>
    request<HelpCard[]>(`/api/help?area=${encodeURIComponent(area)}`),
  sources: (area: string) =>
    request<SourceCard[]>(`/api/sources?area=${encodeURIComponent(area)}`),
  history: (area: string) =>
    request<HistoricalCoverage>(
      `/api/history?area=${encodeURIComponent(area)}`,
    ),
  reports: () => request<Report[]>("/api/reports"),
  submitReport: (input: ReportInput) =>
    request<Report>("/api/reports", {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify(input),
    }),
  withdrawReport: (id: string, expectedRevision: number) =>
    request<Report>(`/api/reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedRevision, action: "withdraw" }),
    }),
  moderation: (area: string) =>
    request<Report[]>(`/api/moderation?area=${encodeURIComponent(area)}`),
  decide: (id: string, input: DecisionInput) =>
    request<Report>(`/api/moderation/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify(input),
    }),
  preferences: () => request<Preferences>("/api/preferences"),
  savePreferences: (input: PreferencesInput) =>
    request<Preferences>("/api/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  personalFeed: () => request<Notice[]>("/api/me/feed"),
  notifications: () => request<Notification[]>("/api/me/notifications"),
  dispatch: () =>
    request<Notification[]>("/api/me/notifications/dispatch", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
