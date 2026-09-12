import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { areas, categorySchema } from "../packages/contracts";
import { followCatalog } from "../packages/personalization/catalog";
import {
  preferenceRecordSchema,
  deliverySchema,
  type Settings,
  type TimeWindow,
} from "../packages/personalization/schema";
import "./PersonalizationWorkspace.css";
const feedRow = z.object({
  notice: z.object({
    id: z.string().uuid(),
    title: z.string().max(200),
    summary: z.string().max(1000),
    category: categorySchema,
    observedAt: z.string().datetime({ offset: true }),
    synthetic: z.literal(true),
  }),
  reasons: z.array(z.string()),
  reasonCodes: z.array(z.string()),
  orderingVersion: z.literal("explicit/1"),
});
const viewSchema = z.object({
  preferences: preferenceRecordSchema,
  mutedNotices: z
    .array(z.object({ id: z.string().uuid(), title: z.string().max(200) }))
    .max(100),
  feed: z.array(feedRow).max(300),
  inbox: z
    .array(
      deliverySchema.extend({
        currentStatus: z.string(),
        currentNotice: z
          .object({ title: z.string().max(200), summary: z.string().max(1000) })
          .nullable(),
        currentRevision: z.number().int().nullable(),
      }),
    )
    .max(300),
  historicalDigest: z
    .array(
      z.object({
        pilotId: z.string(),
        title: z.string(),
        status: z.string(),
        latestMonth: z.string().nullable(),
        months: z.array(z.string()),
        sourceUrl: z.string().url().startsWith("https://").or(z.literal("")),
        limitations: z.array(z.string()),
      }),
    )
    .max(10),
  limitations: z.array(z.string()).max(10),
});
type View = z.infer<typeof viewSchema>;
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request(path = "", method = "GET", body?: unknown) {
  const response = await fetch(`/api/personalization${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestError(
      result?.error?.message ?? "Preferences are unavailable.",
      response.status,
    );
  if (result?.schemaVersion !== "1.0")
    throw Error("Invalid preference response.");
  return viewSchema.parse(result.data);
}
const names: Record<string, string> = {
  step_free: "Step-free access",
  lighting: "Lighting",
  wayfinding: "Wayfinding",
  accessible_facilities: "Accessible facilities",
  walking: "Walking",
  bus: "Bus",
  rail: "Rail",
  tube: "Underground",
  tram: "Tram",
  cycling: "Cycling",
  infrastructure: "Infrastructure",
  transport: "Transport",
  access: "Access",
  community: "Community",
};
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function WindowControls({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: TimeWindow | null;
  onChange: (value: TimeWindow | null) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="pw-window" disabled={disabled}>
      <legend>{label}</legend>
      <label className="pw-check">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "07:00" }
                : null,
            )
          }
        />
        Use {label.toLowerCase()}
      </label>
      {value && (
        <>
          <div className="pw-times">
            <label>
              Start
              <input
                type="time"
                value={value.start}
                onChange={(e) => onChange({ ...value, start: e.target.value })}
              />
            </label>
            <label>
              End
              <input
                type="time"
                value={value.end}
                onChange={(e) => onChange({ ...value, end: e.target.value })}
              />
            </label>
          </div>
          <div className="pw-checks">
            {days.map((day, i) => (
              <label className="pw-check" key={day}>
                <input
                  type="checkbox"
                  checked={value.days.includes(i)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      days: e.target.checked
                        ? [...value.days, i]
                        : value.days.filter((d) => d !== i),
                    })
                  }
                />
                {day}
              </label>
            ))}
          </div>
          <p className="pw-note">
            Days refer to the start of each window. Overnight windows continue
            into the next day. Europe/London handles clock changes.
          </p>
        </>
      )}
    </fieldset>
  );
}
export function PersonalizationWorkspace({
  onExit,
}: { onExit?: () => void } = {}) {
  const [data, setData] = useState<View | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false);
  useEffect(() => {
    let active = true;
    request()
      .then((view) => {
        if (active) {
          setData(view);
          setDraft(view.preferences.settings);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  function toggle<
    K extends
      | "areas"
      | "categories"
      | "follows"
      | "access"
      | "transportModes"
      | "mutedNoticeIds",
  >(key: K, value: Settings[K][number]) {
    if (!draft) return;
    const list = draft[key] as string[];
    update(
      key,
      (list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value]) as Settings[K],
    );
  }
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    replaceDraft = false,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const view = await request(path, method, body);
      setData(view);
      if (replaceDraft) setDraft(view.preferences.settings);
      setConflict(false);
      setMessage(
        path === "/delete"
          ? "Your saved preferences and inbox were deleted."
          : path === "/reset"
            ? "Preferences were reset. Delivery is off."
            : path === "/dispatch"
              ? "The in-app queue was checked."
              : path === "/queue"
                ? "Relevant updates were queued."
                : "Preferences saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change failed.");
      if (e instanceof RequestError && e.status === 409) {
        setConflict(true);
        try {
          setData(await request());
        } catch {
          setData(null);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (data && draft && !conflict)
      void mutate(
        "",
        "PUT",
        { expectedRevision: data.preferences.revision, settings: draft },
        true,
      );
  }
  async function reload() {
    setBusy(true);
    try {
      const view = await request();
      setData(view);
      setDraft(view.preferences.settings);
      setError("");
      setConflict(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="personalization-workspace">
      <header className="pw-header">
        <div>
          <span className="pw-kicker">Fictional demonstration</span>
          <h1>Your updates</h1>
        </div>
        {onExit && (
          <button onClick={onExit} className="pw-button secondary">
            Back to Momentum
          </button>
        )}
      </header>
      <p className="pw-notice">
        Preferences stay private in this demonstration session. Real account
        storage and external push are separate.
      </p>
      {error && (
        <div role="alert" className="pw-error">
          <p>{error}</p>
          {conflict ? (
            <>
              <p>
                Your draft is preserved. The saved settings changed elsewhere.
              </p>
              <button
                className="pw-button secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                Use saved settings
              </button>
              {data && draft && (
                <button
                  className="pw-button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      "",
                      "PUT",
                      {
                        expectedRevision: data.preferences.revision,
                        settings: draft,
                      },
                      true,
                    )
                  }
                >
                  Replace latest with my draft
                </button>
              )}
            </>
          ) : (
            <button
              className="pw-button secondary"
              disabled={busy}
              onClick={() => void reload()}
            >
              Reload settings
            </button>
          )}
        </div>
      )}
      {message && (
        <p className="pw-success" role="status">
          {message}
        </p>
      )}
      {!draft && !error && <p role="status">Loading private preferences...</p>}
      {draft && data && (
        <>
          <nav className="pw-actions" aria-label="Preference sections">
            <a className="pw-button secondary" href="#pw-settings">
              Settings
            </a>
            <a className="pw-button secondary" href="#pw-matches">
              Matching updates
            </a>
            <a className="pw-button secondary" href="#pw-inbox">
              Inbox
            </a>
          </nav>
          <div className="pw-layout">
            <form onSubmit={save} className="pw-form" id="pw-settings">
              <fieldset disabled={busy}>
                <legend>Follow areas</legend>
                <div className="pw-checks">
                  {areas.map((area) => (
                    <label className="pw-check" key={area.id}>
                      <input
                        type="checkbox"
                        checked={draft.areas.includes(area.id)}
                        onChange={() => toggle("areas", area.id)}
                      />
                      {area.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>Follow stations and places</legend>
                <div className="pw-catalog">
                  {followCatalog.map((target) => (
                    <label className="pw-check" key={target.id}>
                      <input
                        type="checkbox"
                        checked={draft.follows.includes(target.id)}
                        onChange={() => toggle("follows", target.id)}
                      />
                      <span>
                        {target.label}
                        <small>
                          {target.kind} ·{" "}
                          {target.review === "source_identity_checked"
                            ? "Source identity checked"
                            : "Candidate boundary unreviewed"}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="pw-note">
                  Only source-linked locations match these follows. Nearby
                  notices do not automatically match a station or candidate
                  zone.
                </p>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>Topics</legend>
                <div className="pw-checks">
                  {categorySchema.options.map((value) => (
                    <label className="pw-check" key={value}>
                      <input
                        type="checkbox"
                        checked={draft.categories.includes(value)}
                        onChange={() => toggle("categories", value)}
                      />
                      {names[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>Access and transport</legend>
                <div className="pw-checks">
                  {(
                    [
                      "step_free",
                      "lighting",
                      "wayfinding",
                      "accessible_facilities",
                    ] as const
                  ).map((value) => (
                    <label className="pw-check" key={value}>
                      <input
                        type="checkbox"
                        checked={draft.access.includes(value)}
                        onChange={() => toggle("access", value)}
                      />
                      {names[value]}
                    </label>
                  ))}
                </div>
                <div className="pw-checks">
                  {(
                    [
                      "walking",
                      "bus",
                      "rail",
                      "tube",
                      "tram",
                      "cycling",
                    ] as const
                  ).map((value) => (
                    <label className="pw-check" key={value}>
                      <input
                        type="checkbox"
                        checked={draft.transportModes.includes(value)}
                        onChange={() => toggle("transportModes", value)}
                      />
                      {names[value]}
                    </label>
                  ))}
                </div>
                <p className="pw-note">
                  These choices order notices with matching source tags. Missing
                  tags remain unknown.
                </p>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>Language</legend>
                <label>
                  Preferred content language
                  <select
                    value={draft.language}
                    onChange={(e) =>
                      update("language", e.target.value as Settings["language"])
                    }
                  >
                    {[
                      ["en", "English"],
                      ["fr", "French"],
                      ["es", "Spanish"],
                      ["pl", "Polish"],
                      ["pa", "Punjabi"],
                      ["hi", "Hindi"],
                      ["ur", "Urdu"],
                      ["other", "Other"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="pw-note">
                  The interface remains English. This setting orders explicitly
                  tagged content and does not translate reports.
                </p>
              </fieldset>
              <WindowControls
                disabled={busy}
                label="Travel window"
                value={draft.travelWindow}
                onChange={(value) => update("travelWindow", value)}
              />
              <WindowControls
                disabled={busy}
                label="Quiet hours"
                value={draft.quietHours}
                onChange={(value) => update("quietHours", value)}
              />
              <fieldset disabled={busy}>
                <legend>Delivery</legend>
                <label className="pw-check">
                  <input
                    type="checkbox"
                    checked={draft.inAppEnabled}
                    onChange={(e) => update("inAppEnabled", e.target.checked)}
                  />
                  In-app updates
                </label>
                <label className="pw-check">
                  <input
                    type="checkbox"
                    checked={draft.paused}
                    onChange={(e) => update("paused", e.target.checked)}
                  />
                  Pause personalised updates
                </label>
                <label className="pw-check">
                  <input
                    type="checkbox"
                    checked={draft.historicalDigest}
                    onChange={(e) =>
                      update("historicalDigest", e.target.checked)
                    }
                  />
                  Monthly historical coverage digest
                </label>
                <p className="pw-note">
                  Historical coverage stays separate from current notices.
                  External push is disabled.
                </p>
              </fieldset>
              {draft.mutedNoticeIds.length > 0 && (
                <fieldset disabled={busy}>
                  <legend>Muted updates</legend>
                  {draft.mutedNoticeIds.map((id) => (
                    <div className="pw-muted" key={id}>
                      <span>
                        {data.mutedNotices.find((row) => row.id === id)
                          ?.title ?? "Muted notice"}
                      </span>
                      <button
                        type="button"
                        className="pw-button secondary"
                        onClick={() => toggle("mutedNoticeIds", id)}
                      >
                        Unmute
                      </button>
                    </div>
                  ))}
                </fieldset>
              )}
              <div className="pw-actions">
                <button className="pw-button" disabled={busy || conflict}>
                  Save preferences
                </button>
                <button
                  type="button"
                  className="pw-button secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      "/reset",
                      "POST",
                      { expectedRevision: data.preferences.revision },
                      true,
                    )
                  }
                >
                  Reset preferences
                </button>
                <a
                  className="pw-button secondary"
                  href="/api/personalization/export"
                  download
                >
                  Export my data
                </a>
                <button
                  type="button"
                  className="pw-button danger"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      "/delete",
                      "POST",
                      { expectedRevision: data.preferences.revision },
                      true,
                    )
                  }
                >
                  Delete preferences and inbox
                </button>
              </div>
              <p className="pw-note">
                Saved revision {data.preferences.revision}. Deletion removes
                this workspace's saved choices and inbox. It does not delete
                your reports.
              </p>
            </form>
            <aside className="pw-results">
              <section className="pw-panel" id="pw-matches">
                <h2>Why these updates?</h2>
                {data.preferences.settings.paused && (
                  <p>Personalised updates are paused.</p>
                )}
                {!data.feed.length && (
                  <p>
                    No current fictional notices match these settings. This does
                    not mean the area has no concerns.
                  </p>
                )}
                {data.feed.map((row) => (
                  <article className="pw-update" key={row.notice.id}>
                    <span className="pw-kicker">
                      Fictional · {row.notice.category}
                    </span>
                    <h3>{row.notice.title}</h3>
                    <p>{row.notice.summary}</p>
                    <ul>
                      {row.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="pw-button secondary"
                      onClick={() => {
                        const settings = {
                          ...data.preferences.settings,
                          mutedNoticeIds: [
                            ...new Set([
                              ...data.preferences.settings.mutedNoticeIds,
                              row.notice.id,
                            ]),
                          ],
                        };
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                mutedNoticeIds: settings.mutedNoticeIds,
                              }
                            : current,
                        );
                        void mutate(
                          "",
                          "PUT",
                          {
                            expectedRevision: data.preferences.revision,
                            settings,
                          },
                          false,
                        );
                      }}
                      disabled={busy || conflict}
                    >
                      Mute this update
                    </button>
                  </article>
                ))}
              </section>
              <section className="pw-panel" id="pw-inbox">
                <h2>In-app inbox</h2>
                <div className="pw-actions">
                  <button
                    type="button"
                    className="pw-button secondary"
                    disabled={busy}
                    onClick={() => void mutate("/queue", "POST", {})}
                  >
                    Queue current updates
                  </button>
                  <button
                    type="button"
                    className="pw-button"
                    disabled={busy}
                    onClick={() => void mutate("/dispatch", "POST", {})}
                  >
                    Check queued updates
                  </button>
                </div>
                {!data.inbox.length && <p>No updates have been queued.</p>}
                {data.inbox.map((item) => (
                  <article className="pw-update" key={item.id}>
                    <h3>
                      {item.kind === "correction"
                        ? "Status correction"
                        : "Personal update"}
                    </h3>
                    <p>{item.message}</p>
                    {item.currentNotice && (
                      <details>
                        <summary>Read current notice</summary>
                        <h4>{item.currentNotice.title}</h4>
                        <p>{item.currentNotice.summary}</p>
                      </details>
                    )}
                    {!item.currentNotice && (
                      <p>Current content is unavailable or expired.</p>
                    )}
                    <dl>
                      <div>
                        <dt>Delivery</dt>
                        <dd>
                          {item.state} · {item.reason.replaceAll("_", " ")}
                        </dd>
                      </div>
                      <div>
                        <dt>Current notice</dt>
                        <dd>
                          {item.currentStatus} · revision{" "}
                          {item.currentRevision ?? "unknown"}
                        </dd>
                      </div>
                      <div>
                        <dt>Attempts</dt>
                        <dd>{item.attempts} of 3</dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>
                          {new Date(item.expiresAt).toLocaleString("en-GB", {
                            timeZone: "Europe/London",
                          })}{" "}
                          London time
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </section>
              <section className="pw-panel">
                <h2>Historical digest</h2>
                {!data.preferences.settings.historicalDigest ? (
                  <p>
                    Historical coverage is off. Choose it separately under
                    Delivery.
                  </p>
                ) : data.historicalDigest.length === 0 ? (
                  <p>
                    No historical coverage is available for your selected scope.
                  </p>
                ) : (
                  data.historicalDigest.map((row) => (
                    <article className="pw-update" key={row.pilotId}>
                      <h3>
                        {areas.find((a) => a.id === row.pilotId)?.name ??
                          row.pilotId}
                      </h3>
                      <p>
                        {row.title} · {row.status}. Latest source month:{" "}
                        {row.latestMonth ?? "unknown"}.
                      </p>
                      <p>
                        {row.months.length} acquired months. These are
                        historical source files, not current warnings or
                        approved pilot crime totals.
                      </p>
                      {row.sourceUrl && (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Read historical source
                        </a>
                      )}
                    </article>
                  ))
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
