import { publicBrowse } from "./entry";
import type {
  Area,
  DecisionInput,
  EvidenceGraph,
  HelpCard,
  HistoricalCoverage,
  DatasetCoverageRecord,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {};
    throw new ApiError(
      typeof error.message === "string" && error.message
        ? error.message
        : `Request failed (${response.status})`,
      response.status,
      typeof error.code === "string" ? error.code : undefined,
    );
  }
  if (
    !isRecord(body) ||
    body.schemaVersion !== "1.0" ||
    !(Array.isArray(body.data) || isRecord(body.data))
  ) {
    throw new ApiError(
      "The server returned an invalid response. Try again.",
      response.status,
      "invalid_response",
    );
  }
  return body.data as T;
}

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const publicPath = (path: string) =>
  publicBrowse ? path.replace("/api/", "/api/public/") : path;

export const api = {
  session: () =>
    publicBrowse
      ? Promise.resolve<SessionView>({
          persona: "alex",
          synthetic: true,
          moderatorAreas: [],
        })
      : request<SessionView>("/api/session"),
  setPersona: (persona: Persona) =>
    request<SessionView>("/api/session", {
      method: "POST",
      body: JSON.stringify({ persona }),
    }),
  areas: () => request<Area[]>(publicPath("/api/areas")),
  feed: (area: string) =>
    request<Notice[]>(publicPath(`/api/feed?area=${encodeURIComponent(area)}`)),
  notice: (id: string) =>
    request<Notice>(`/api/notices/${encodeURIComponent(id)}`),
  evidence: (id: string) =>
    request<EvidenceGraph>(`/api/notices/${encodeURIComponent(id)}/evidence`),
  help: (area: string) =>
    request<HelpCard[]>(
      publicPath(`/api/help?area=${encodeURIComponent(area)}`),
    ),
  datasets: (area: string) =>
    request<DatasetCoverageRecord[]>(
      publicPath(`/api/datasets?area=${encodeURIComponent(area)}`),
    ),
  sources: (area: string) =>
    request<SourceCard[]>(
      publicPath(`/api/sources?area=${encodeURIComponent(area)}`),
    ),
  history: (area: string) =>
    request<HistoricalCoverage>(
      publicPath(`/api/history?area=${encodeURIComponent(area)}`),
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
