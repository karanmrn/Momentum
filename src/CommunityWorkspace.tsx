import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { Persona, PilotId } from "../packages/contracts";
import {
  intakeSchema,
  workflowRecordSchema,
  discussionSchema,
  type Intake,
} from "../packages/community-workflow/schema";
import "./CommunityWorkspace.css";

const noticeSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  place: z.string(),
  status: z.string(),
  observedAt: z.string(),
  updatedAt: z.string(),
  sourceKind: z.string(),
});
const receiptSchema = workflowRecordSchema.extend({
  report: z.object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.string(),
    owner: z.string(),
    noticeId: z.string().nullable(),
  }),
  notice: noticeSchema.nullable(),
  discussion: z.array(discussionSchema),
});
const publishedSchema = z.object({
  notice: noticeSchema,
  basis: z.enum(["firsthand", "other_source"]),
  observedInterval: z.object({
    from: z.string(),
    to: z.string(),
    precision: z.string(),
  }),
  updates: z.array(
    z.object({
      id: z.string(),
      revision: z.number(),
      summary: z.string(),
      createdAt: z.string(),
      synthetic: z.literal(true),
    }),
  ),
});
const viewSchema = z.object({
  reports: z.array(receiptSchema),
  discussion: z.array(discussionSchema),
  published: z.array(publishedSchema),
});
type Receipt = z.infer<typeof receiptSchema>;
type View = z.infer<typeof viewSchema>;
class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const response = await fetch(`/api/community-workflow${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new WorkspaceError(
      result?.error?.message || "This action is unavailable. Try again.",
      response.status,
    );
  if (result?.schemaVersion !== "1.0" || !result.data)
    throw new WorkspaceError("The server response is invalid. Try again.");
  return result.data as unknown;
}
const time = (value: string) => new Date(value).toLocaleString("en-GB");
const localTime = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const labels = (value: string) => value.replaceAll("_", " ");
const initialIntake = (pilotId: PilotId): Intake => ({
  pilotId,
  category: "infrastructure",
  title: "",
  place: "",
  observedFrom: new Date(Date.now() - 3600000).toISOString(),
  observedTo: new Date().toISOString(),
  timePrecision: "time_window",
  basis: "firsthand",
  sourceDescription: "",
  narrative: "",
  publication: "private_only",
  synthetic: true,
});

function IntakeForm({
  pilotId,
  initial,
  submit,
  cancel,
}: {
  pilotId: PilotId;
  initial?: Intake;
  submit: (input: Intake) => Promise<void>;
  cancel?: () => void;
}) {
  const [draft, setDraft] = useState<Intake>(initial ?? initialIntake(pilotId));
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const set = <K extends keyof Intake>(key: K, value: Intake[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const valid = () => {
    const result = intakeSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the report fields.");
      return null;
    }
    return result.data;
  };
  function prepare(event: FormEvent) {
    event.preventDefault();
    if (valid()) {
      setError("");
      setReview(true);
    }
  }
  async function save() {
    if (pending.current) return;
    const value = valid();
    if (!value) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await submit(value);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The observation could not be saved.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="cw-panel">
      <h2>{initial ? "Correct observation" : "Share an observation"}</h2>
      {error && (
        <p className="cw-error" role="alert">
          {error}
        </p>
      )}
      {review ? (
        <div className="cw-review">
          <h3>Review before saving</h3>
          <dl>
            <dt>Title</dt>
            <dd>{draft.title}</dd>
            <dt>Approximate place</dt>
            <dd>{draft.place}</dd>
            <dt>Observed interval</dt>
            <dd>
              {time(draft.observedFrom)} to {time(draft.observedTo)} ·{" "}
              {labels(draft.timePrecision)}
            </dd>
            <dt>Source basis</dt>
            <dd>{labels(draft.basis)}</dd>
            <dt>Publication preference</dt>
            <dd>
              {draft.publication === "private_only"
                ? "Private review only. Do not publish."
                : "A moderator may publish a redacted summary."}
            </dd>
            <dt>Optional narrative</dt>
            <dd>{draft.narrative || "Not supplied"}</dd>
          </dl>
          {initial && (
            <p>
              Saving a correction withdraws any previous public summary until
              another review is complete.
            </p>
          )}
          <div className="cw-actions">
            <button disabled={saving} onClick={() => setReview(false)}>
              Back to fields
            </button>
            <button
              className="cw-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving..." : "Confirm private submission"}
            </button>
          </div>
        </div>
      ) : (
        <form className="cw-form" onSubmit={prepare}>
          <label>
            Category
            <select
              value={draft.category}
              onChange={(e) =>
                set("category", e.target.value as Intake["category"])
              }
            >
              {["infrastructure", "transport", "access", "community"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Short title
            <input
              required
              minLength={5}
              maxLength={100}
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label>
            Approximate public place
            <input
              required
              minLength={3}
              maxLength={100}
              value={draft.place}
              onChange={(e) => set("place", e.target.value)}
            />
          </label>
          <div className="cw-form-columns">
            <label>
              Observed from
              <input
                type="datetime-local"
                required
                value={localTime(draft.observedFrom)}
                onChange={(e) => {
                  if (e.target.value)
                    set("observedFrom", new Date(e.target.value).toISOString());
                }}
              />
            </label>
            <label>
              Observed until
              <input
                type="datetime-local"
                required
                value={localTime(draft.observedTo)}
                onChange={(e) => {
                  if (e.target.value)
                    set("observedTo", new Date(e.target.value).toISOString());
                }}
              />
            </label>
          </div>
          <label>
            Time precision
            <select
              value={draft.timePrecision}
              onChange={(e) =>
                set("timePrecision", e.target.value as Intake["timePrecision"])
              }
            >
              <option value="approximate_time">Approximate time</option>
              <option value="time_window">Time window</option>
              <option value="day">Day only</option>
            </select>
          </label>
          <label>
            How you know
            <select
              value={draft.basis}
              onChange={(e) => set("basis", e.target.value as Intake["basis"])}
            >
              <option value="firsthand">I experienced or witnessed it</option>
              <option value="other_source">Another source described it</option>
            </select>
          </label>
          {draft.basis === "other_source" && (
            <label>
              Other source description
              <input
                required
                minLength={5}
                maxLength={300}
                value={draft.sourceDescription}
                onChange={(e) => set("sourceDescription", e.target.value)}
              />
            </label>
          )}
          <label>
            Factual narrative (optional)
            <textarea
              maxLength={600}
              value={draft.narrative}
              onChange={(e) => set("narrative", e.target.value)}
            />
          </label>
          <label>
            Publication preference
            <select
              value={draft.publication}
              onChange={(e) =>
                set("publication", e.target.value as Intake["publication"])
              }
            >
              <option value="private_only">Private review only</option>
              <option value="reviewed_public">
                Allow a reviewed public summary
              </option>
            </select>
          </label>
          <p>
            Use fictional details. Do not include names, private addresses,
            contact details, photos, or case references. This does not notify
            police.
          </p>
          <div className="cw-actions">
            {cancel && (
              <button type="button" onClick={cancel}>
                Cancel correction
              </button>
            )}
            <button className="cw-primary">Review observation</button>
          </div>
        </form>
      )}
    </section>
  );
}

function ReviewForm({
  record,
  submit,
}: {
  record: Receipt;
  submit: (body: unknown) => Promise<void>;
}) {
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const options = ["withdrawn", "resolved", "retracted"].includes(record.status)
    ? []
    : record.status === "published"
      ? ["resolve", "retract"]
      : [
          "start_review",
          "clarify",
          record.intake.publication === "private_only"
            ? "review_private"
            : "approve",
          "reject",
        ];
  const selected = options.includes(action) ? action : options[0];
  if (!selected) return <p>No further review action is available.</p>;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await submit({
        expectedRevision: record.revision,
        action: selected,
        reason,
        publicSummary: summary,
      });
      setReason("");
      setSummary("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="cw-form" onSubmit={save}>
      <h3>Record a review</h3>
      <label>
        Review decision
        <select
          value={selected}
          onChange={(e) => setAction(e.target.value)}
          disabled={busy}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {labels(option)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Private review reason
        <textarea
          required
          minLength={5}
          maxLength={600}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {["approve", "resolve", "retract"].includes(selected) && (
        <label>
          Public-safe summary
          <textarea
            required
            minLength={5}
            maxLength={600}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
      )}
      <p>
        Publication review does not confirm an incident or council action.
        Reasons stay private.
      </p>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      <button className="cw-primary" disabled={busy}>
        {busy ? "Recording..." : "Save review decision"}
      </button>
    </form>
  );
}
function PrivateMessage({
  action,
  submit,
}: {
  action: "respond" | "appeal";
  submit: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await submit(message);
      setMessage("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Message failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="cw-form" onSubmit={save}>
      <label>
        {action === "appeal" ? "Private appeal" : "Clarification response"}
        <textarea
          required
          minLength={5}
          maxLength={600}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {error && (
        <p className="cw-error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy}>
        {action === "appeal"
          ? "Request another review"
          : "Send private clarification"}
      </button>
    </form>
  );
}
function DiscussionReview({
  item,
  submit,
}: {
  item: z.infer<typeof discussionSchema>;
  submit: (body: unknown) => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("approve");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await submit({
        expectedRevision: item.revision,
        action: decision,
        reason,
        publicSummary: summary,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Discussion review failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="cw-form" onSubmit={save}>
      <label>
        Discussion decision
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="approve">Approve redacted update</option>
          <option value="reject">Reject update</option>
        </select>
      </label>
      <label>
        Private discussion reason
        <textarea
          required
          minLength={5}
          maxLength={600}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {decision === "approve" && (
        <label>
          Redacted public update
          <textarea
            required
            minLength={5}
            maxLength={600}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      <button disabled={busy}>Save discussion review</button>
    </form>
  );
}
function AddDiscussion({
  submit,
}: {
  submit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await submit(text);
      setText("");
      setMessage("Update saved privately for moderation.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Update could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="cw-form" onSubmit={save}>
      <label>
        Add a fictional update
        <textarea
          required
          minLength={5}
          maxLength={600}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button disabled={busy}>Submit update for review</button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function CommunityWorkspace({
  persona,
  pilotId,
  onExit,
}: {
  persona: Persona;
  pilotId: PilotId;
  onExit?: () => void;
}) {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("reports");
  const [selected, setSelected] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [receiptView, setReceiptView] = useState<
    "report" | "evidence" | "changes"
  >("report");
  useEffect(() => setReceiptView("report"), [selected, pilotId, persona]);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<{ id: string; path: string } | null>(null);
  const keys = useRef(new Map<string, string>());
  const active = useRef(0);
  const mutation = useRef(false);
  const generation = useRef(0);
  const detailsRef = useRef<HTMLElement>(null);
  async function load() {
    const current = ++generation.current;
    const result = viewSchema.parse(await request(`?area=${pilotId}`));
    if (current === generation.current) setData(result);
    return result;
  }
  useEffect(() => {
    const controller = ++active.current;
    generation.current++;
    setData(null);
    setSelected(null);
    setCorrecting(false);
    setShare(null);
    setError("");
    setStatus("");
    setLoading(true);
    setTab(
      new URLSearchParams(window.location.search).has("notice")
        ? "published"
        : "reports",
    );
    load()
      .catch((failure) => {
        if (active.current === controller)
          setError(
            failure instanceof Error
              ? failure.message
              : "Community data is unavailable.",
          );
      })
      .finally(() => {
        if (active.current === controller) setLoading(false);
      });
    return () => {
      active.current++;
      generation.current++;
    };
  }, [persona, pilotId]);
  useEffect(() => {
    if (selected) {
      detailsRef.current?.focus({ preventScroll: true });
      detailsRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, [selected]);
  async function action(path: string, method: string, body: unknown) {
    if (mutation.current)
      throw new WorkspaceError("Wait for the current action to finish.");
    const fingerprint = JSON.stringify([persona, path, method, body]);
    if (!keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const sessionGeneration = active.current;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        path,
        method,
        body,
        keys.current.get(fingerprint),
      );
      if (sessionGeneration !== active.current)
        throw new WorkspaceError(
          "The session changed. Reload to inspect your saved action.",
        );
      const acknowledged = receiptSchema.safeParse(result);
      if (acknowledged.success) {
        const receipt = acknowledged.data;
        setData((old) => {
          if (!old) return old;
          const previous = old.reports.find((item) => item.id === receipt.id);
          return {
            ...old,
            reports: [
              ...old.reports.filter((item) => item.id !== receipt.id),
              receipt,
            ],
            published: old.published.filter(
              (item) => item.notice.id !== previous?.notice?.id,
            ),
            discussion: old.discussion
              .filter((item) => item.workflowId !== receipt.id)
              .concat(receipt.discussion),
          };
        });
      } else {
        const discussion = discussionSchema.safeParse(result);
        if (discussion.success)
          setData((old) =>
            old
              ? {
                  ...old,
                  discussion: [
                    ...old.discussion.filter(
                      (item) => item.id !== discussion.data.id,
                    ),
                    discussion.data,
                  ],
                  published: old.published.map((item) => ({
                    ...item,
                    updates: item.updates.filter(
                      (update) => update.id !== discussion.data.id,
                    ),
                  })),
                }
              : old,
          );
      }
      setStatus("Your action was saved.");
      try {
        await load();
      } catch {
        setError(
          "Your action was saved. Reload this workspace to see its latest state.",
        );
      }
      return result;
    } catch (failure) {
      if (failure instanceof WorkspaceError && failure.status === 409) {
        try {
          await load();
        } catch {}
        setError(
          "This item changed. Your draft is retained. Review the latest revision before retrying.",
        );
      }
      throw failure;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    setLoading(true);
    try {
      await load();
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Reload failed.");
    } finally {
      setLoading(false);
    }
  }
  const record = data?.reports.find((item) => item.id === selected);
  const moderator = persona === "moderator";
  async function withdraw() {
    if (!record) return;
    try {
      const next = receiptSchema.parse(
        await action(`/reports/${record.id}`, "PATCH", {
          action: "withdraw",
          expectedRevision: record.revision,
        }),
      );
      setData((old) =>
        old
          ? {
              ...old,
              reports: old.reports.map((item) =>
                item.id === next.id ? next : item,
              ),
            }
          : old,
      );
      setStatus(
        "Observation withdrawn. Derived public content is unavailable.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Withdrawal failed.",
      );
    }
  }
  async function shareNotice(notice: z.infer<typeof noticeSchema>) {
    setShare(null);
    try {
      const result = z
        .object({
          path: z.string().startsWith("/?"),
          notice: noticeSchema,
          synthetic: z.literal(true),
        })
        .parse(
          await request(`/notices/${notice.id}/share`, "POST", {
            expectedRevision: notice.revision,
          }),
        );
      setShare({ id: notice.id, path: result.path });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This notice cannot be shared.",
      );
    }
  }
  const requestedNotice = new URLSearchParams(window.location.search).get(
    "notice",
  );
  return (
    <section className="community-workspace" aria-label="Community workspace">
      <header className="cw-heading">
        <h1>Community workspace</h1>
        {onExit && (
          <button onClick={onExit} disabled={busy}>
            Back to area
          </button>
        )}
      </header>
      <p className="cw-fiction">
        Fictional demonstration. Reports, reviews, appeals, and discussion
        remain separate from official reporting.
      </p>
      <p className="cw-role">
        {moderator ? "Fictional moderator" : "Fictional member"}: {persona} ·{" "}
        {labels(pilotId)}
      </p>
      <nav className="cw-tabs" aria-label="Community sections">
        {[
          ...(!moderator ? [["create", "Share observation"]] : []),
          ["reports", moderator ? "Review queue" : "My reports"],
          ["discussion", moderator ? "Discussion queue" : "My updates"],
          ["published", "Reviewed updates"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            disabled={busy}
            onClick={() => {
              setTab(id);
              setCorrecting(false);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="cw-error">
          <p>{error}</p>
          <button onClick={() => void retry()} disabled={loading || busy}>
            Reload workspace
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {loading && <p role="status">Loading community records...</p>}
      {requestedNotice &&
        data &&
        !data.published.some((item) => item.notice.id === requestedNotice) && (
          <p role="status">
            This shared notice is no longer available. Removed summaries are not
            displayed.
          </p>
        )}
      {tab === "create" && !moderator && (
        <IntakeForm
          key={`${persona}:${pilotId}`}
          pilotId={pilotId}
          submit={async (input) => {
            const receipt = receiptSchema.parse(
              await action("/reports", "POST", input),
            );
            setData((old) =>
              old
                ? {
                    ...old,
                    reports: [
                      ...old.reports.filter((item) => item.id !== receipt.id),
                      receipt,
                    ],
                  }
                : { reports: [receipt], discussion: [], published: [] },
            );
            setSelected(receipt.id);
            setTab("reports");
            setStatus(
              "Observation saved for private review. No official report was sent.",
            );
          }}
        />
      )}
      {tab === "reports" && data && (
        <div className="cw-layout">
          <section className="cw-panel">
            <h2>{moderator ? "Review queue" : "My reports"}</h2>
            {data.reports.length ? (
              <ul className="cw-record-list">
                {data.reports.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        setSelected(item.id);
                        setCorrecting(false);
                      }}
                      aria-pressed={selected === item.id}
                      disabled={busy}
                    >
                      <strong>{item.intake.title}</strong>
                      <span>
                        {labels(item.status)} · revision {item.revision}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No community workspace reports are available for this area.</p>
            )}
          </section>
          {record && (
            <section
              className="cw-panel cw-detail"
              ref={detailsRef}
              tabIndex={-1}
              aria-label="Private report receipt"
            >
              <h2>{record.intake.title}</h2>
              <p className="cw-state">
                {labels(record.status)} · revision {record.revision}
              </p>
              <nav className="cw-journey" aria-label="Report journey">
                {(["report", "evidence", "changes"] as const).map((step) => (
                  <button
                    key={step}
                    type="button"
                    aria-pressed={receiptView === step}
                    aria-controls={`receipt-${step}`}
                    onClick={() => setReceiptView(step)}
                  >
                    {step === "report"
                      ? "Report"
                      : step === "evidence"
                        ? "Evidence"
                        : "Changes"}
                  </button>
                ))}
              </nav>
              <div id="receipt-report" hidden={receiptView !== "report"}>
                <dl>
                  <dt>Receipt reference</dt>
                  <dd>{record.id}</dd>
                  <dt>Report reference</dt>
                  <dd>{record.report.id}</dd>
                  <dt>Saved</dt>
                  <dd>{time(record.createdAt)}</dd>
                  <dt>Publication preference</dt>
                  <dd>{labels(record.intake.publication)}</dd>
                  <dt>Approximate place</dt>
                  <dd>{record.intake.place}</dd>
                  <dt>Observed interval</dt>
                  <dd>
                    {time(record.intake.observedFrom)} to{" "}
                    {time(record.intake.observedTo)} ·{" "}
                    {labels(record.intake.timePrecision)}
                  </dd>
                  <dt>Source basis</dt>
                  <dd>{labels(record.intake.basis)}</dd>
                  {record.intake.sourceDescription && (
                    <>
                      <dt>Private source description</dt>
                      <dd>{record.intake.sourceDescription}</dd>
                    </>
                  )}
                  <dt>Optional narrative</dt>
                  <dd>{record.intake.narrative || "Not supplied"}</dd>
                </dl>
                {record.notice && (
                  <a
                    href={`/?demo=1&workspace=community&area=${pilotId}&notice=${record.notice.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setTab("published");
                    }}
                  >
                    Open reviewed public summary
                  </a>
                )}
              </div>
              <section
                id="receipt-evidence"
                hidden={receiptView !== "evidence"}
                aria-label="Area evidence"
              >
                <h3>Area evidence</h3>
                <p>
                  Explore published sources for this area. These sources do not
                  confirm your observation or describe the same event.
                </p>
                <a
                  className="cw-journey-link"
                  href={`/?public=1&workspace=graph&area=${pilotId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open area graph (new tab)
                </a>
                <p>
                  Your private report stays here. No report details are included
                  in the link.
                </p>
              </section>
              <section
                id="receipt-changes"
                hidden={receiptView !== "changes"}
                aria-label="Report changes"
              >
                <h3>Private status history</h3>
                <ol className="cw-history">
                  {[...record.history].reverse().map((item) => (
                    <li key={item.revision}>
                      <strong>
                        {labels(item.action)} · revision {item.revision}
                      </strong>
                      <span>
                        {item.actor} · {time(item.at)}
                      </span>
                      <p>{item.message}</p>
                    </li>
                  ))}
                </ol>
                <p>
                  This history records review activity. It does not confirm
                  action by police or the council.
                </p>
              </section>
              <a
                className="cw-journey-link"
                href={`/?public=1&tab=help&area=${pilotId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get help (new tab)
              </a>
              {moderator ? (
                <ReviewForm
                  key={record.id}
                  record={record}
                  submit={(body) =>
                    action(`/reports/${record.id}/review`, "POST", body).then(
                      () => {},
                    )
                  }
                />
              ) : (
                <>
                  {record.status === "needs_clarification" && (
                    <PrivateMessage
                      action="respond"
                      submit={(message) =>
                        action(`/reports/${record.id}`, "PATCH", {
                          action: "respond",
                          expectedRevision: record.revision,
                          message,
                        }).then(() => {})
                      }
                    />
                  )}
                  {record.status === "rejected" && (
                    <PrivateMessage
                      action="appeal"
                      submit={(message) =>
                        action(`/reports/${record.id}`, "PATCH", {
                          action: "appeal",
                          expectedRevision: record.revision,
                          message,
                        }).then(() => {})
                      }
                    />
                  )}
                  {!["withdrawn", "retracted", "resolved"].includes(
                    record.status,
                  ) && (
                    <div className="cw-actions">
                      <button
                        disabled={busy}
                        onClick={() => setCorrecting(true)}
                      >
                        Correct observation
                      </button>
                      <button disabled={busy} onClick={() => void withdraw()}>
                        Withdraw observation
                      </button>
                    </div>
                  )}
                  {correcting && (
                    <IntakeForm
                      key={`${record.id}:correction`}
                      pilotId={pilotId}
                      initial={record.intake}
                      cancel={() => setCorrecting(false)}
                      submit={async (changes) => {
                        await action(`/reports/${record.id}`, "PATCH", {
                          action: "correct",
                          expectedRevision: record.revision,
                          changes,
                        });
                        setCorrecting(false);
                      }}
                    />
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}
      {tab === "discussion" && data && (
        <section className="cw-panel">
          <h2>{moderator ? "Discussion review" : "My private updates"}</h2>
          {data.discussion.length ? (
            data.discussion.map((item) => (
              <article className="cw-discussion" key={item.id}>
                <p>
                  <strong>{labels(item.status)}</strong> · revision{" "}
                  {item.revision}
                </p>
                <p>{item.text || "Content removed"}</p>
                {item.reviewReason && (
                  <p>Private reason: {item.reviewReason}</p>
                )}
                {moderator && item.status === "submitted" && (
                  <DiscussionReview
                    item={item}
                    submit={(body) =>
                      action(
                        `/discussion/${item.id}/review`,
                        "POST",
                        body,
                      ).then(() => {})
                    }
                  />
                )}
                {!moderator && item.status !== "withdrawn" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(`/discussion/${item.id}`, "PATCH", {
                        expectedRevision: item.revision,
                      }).catch((failure) => setError(failure.message))
                    }
                  >
                    Withdraw update
                  </button>
                )}
              </article>
            ))
          ) : (
            <p>No discussion updates are available.</p>
          )}
        </section>
      )}
      {tab === "published" && data && (
        <section className="cw-panel">
          <h2>Reviewed updates</h2>
          {data.published.length ? (
            data.published.map((item) => (
              <article className="cw-public" key={item.notice.id}>
                <h3>{item.notice.title}</h3>
                <p>{item.notice.summary}</p>
                <p>
                  {labels(item.basis)} · observed{" "}
                  {time(item.observedInterval.from)} to{" "}
                  {time(item.observedInterval.to)} ·{" "}
                  {labels(item.observedInterval.precision)}
                </p>
                <p>
                  {item.notice.place} · revision {item.notice.revision} ·{" "}
                  {time(item.notice.updatedAt)}
                </p>
                <p>
                  Fictional community statement. Publication review does not
                  establish independent confirmation.
                </p>
                <button onClick={() => void shareNotice(item.notice)}>
                  Prepare current notice link
                </button>
                {share?.id === item.notice.id && (
                  <div className="cw-share">
                    <p>
                      This fictional link works in the current demonstration
                      session.
                    </p>
                    <a href={share.path}>Open current notice link</a>
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(
                            new URL(share.path, window.location.origin).href,
                          )
                          .then(() => setStatus("Current notice link copied."))
                          .catch(() =>
                            setError(
                              "Copy failed. Use the current notice link.",
                            ),
                          )
                      }
                    >
                      Copy current notice link
                    </button>
                  </div>
                )}
                <h4>Moderated discussion</h4>
                {item.updates.length ? (
                  item.updates.map((update) => (
                    <p key={update.id}>
                      {update.summary} · {time(update.createdAt)}
                    </p>
                  ))
                ) : (
                  <p>No approved discussion updates.</p>
                )}
                {!moderator && (
                  <AddDiscussion
                    submit={(text) =>
                      action(`/notices/${item.notice.id}/discussion`, "POST", {
                        expectedRevision: item.notice.revision,
                        text,
                      }).then(() => {})
                    }
                  />
                )}
              </article>
            ))
          ) : (
            <p>
              No current reviewed community updates. This does not confirm that
              conditions are clear.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
