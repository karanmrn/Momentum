import { ResearchPanel } from "../packages/recruitment/ResearchPanel";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import * as L from "leaflet";
import {
  Bell,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Compass,
  Map as MapIcon,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  Area,
  EvidenceGraph,
  HelpCard,
  Notice,
  Notification,
  Persona,
  Preferences,
  Report,
  SourceCard,
} from "../packages/contracts";
import { api, ApiError } from "./api";
import "./styles.css";

type Tab = "now" | "community" | "help" | "history";
type View =
  "dashboard" | "reports" | "moderation" | "inbox" | "preferences" | "research";
type AreaData = {
  notices: Notice[];
  help: HelpCard[];
  sources: SourceCard[];
  history: { status: string; estimate: null; explanation: string } | null;
};
type MemberPersona = Exclude<Persona, "moderator">;
const tabs: Array<[Tab, string]> = [
  ["now", "Now"],
  ["community", "Community"],
  ["help", "Get help"],
  ["history", "Historical context"],
];
const memberNav: Array<{ id: View; label: string; icon: typeof MapIcon }> = [
  { id: "dashboard", label: "Explore", icon: MapIcon },
  { id: "reports", label: "My reports", icon: ClipboardList },
  { id: "inbox", label: "Inbox", icon: Bell },
  { id: "preferences", label: "Preferences", icon: Settings },
  { id: "research", label: "Research", icon: Compass },
];
const errorText = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "We could not load this information. Try again.";
const isMember = (persona: Persona): persona is MemberPersona =>
  persona !== "moderator";
const localDateTime = (value = new Date()) => {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
function StatusTag({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && onClose()}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          ref={closeRef}
          className="close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={22} />
        </button>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

function PilotMap({ area }: { area: Area }) {
  const element = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    setFailed(false);
    let map: L.Map | undefined;
    try {
      map = L.map(element.current, { zoomControl: false }).setView(
        area.center,
        14,
      );
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const tiles = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      ).addTo(map);
      tiles.on("tileerror", () => setFailed(true));
      L.marker(area.center, {
        icon: L.divIcon({
          className: "",
          html: '<div class="anchor" aria-hidden="true"></div>',
          iconSize: [15, 15],
          iconAnchor: [7, 7],
        }),
      })
        .addTo(map)
        .bindPopup(
          `<strong>${area.shortName}</strong><br>Approximate pilot-area anchor`,
        );
    } catch {
      setFailed(true);
    }
    return () => {
      map?.remove();
    };
  }, [area]);
  return failed ? (
    <div className="map-fallback">
      <div>
        <MapPin size={28} />
        <p>
          <strong>Map tiles are unavailable</strong>
        </p>
        <p>
          The list remains available. {area.shortName} is an approximate
          pilot-area anchor.
        </p>
      </div>
    </div>
  ) : (
    <div
      className="map"
      ref={element}
      aria-label={`Map centred on the approximate ${area.name} pilot-area anchor`}
    />
  );
}

function NoticeCard({
  notice,
  onInspect,
}: {
  notice: Notice;
  onInspect: (notice: Notice) => void;
}) {
  const source = notice.evidence[0];
  const observed = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(notice.observedAt));
  return (
    <article className="notice">
      <div className="notice-head">
        <StatusTag tone="orange">Synthetic</StatusTag>
        <StatusTag>{notice.category}</StatusTag>
        <StatusTag tone={notice.status === "active" ? "dark" : ""}>
          {notice.status}
        </StatusTag>
      </div>
      <h3>{notice.title}</h3>
      <p>{notice.summary}</p>
      <p>
        <strong>{notice.place}</strong> · observed {observed}
      </p>
      <div className="tag-row">
        <StatusTag>
          {source?.sourceKind.replaceAll("_", " ") || "Source not supplied"}
        </StatusTag>
        <StatusTag>
          {source?.precision.replaceAll("_", " ") || "Precision unknown"}
        </StatusTag>
        <StatusTag>{notice.reviewStatus.replaceAll("_", " ")}</StatusTag>
      </div>
      <div className="actions">
        <button className="button secondary" onClick={() => onInspect(notice)}>
          Source and history <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}

function Graph({ graph }: { graph: EvidenceGraph }) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return (
    <>
      <div className="stack">
        {graph.edges.length ? (
          graph.edges.map((edge) => {
            const from = nodes.get(edge.from);
            const to = nodes.get(edge.to);
            return (
              <div className="graph" key={edge.id}>
                <div className="node">
                  {from?.label || "Public record"}
                  <br />
                  <small>{from?.type || "unknown"}</small>
                </div>
                <span
                  className="edge"
                  aria-label={`${edge.predicate.replaceAll("_", " ")} to`}
                >
                  →
                </span>
                <div className="node">
                  {to?.label || "Public record"}
                  <br />
                  <small>{to?.type || "unknown"}</small>
                </div>
                <small className="edge-detail">
                  <strong>{edge.predicate.replaceAll("_", " ")}</strong> ·{" "}
                  {edge.reason}
                </small>
              </div>
            );
          })
        ) : (
          <Empty title="No public graph links returned">
            The service did not expose any public-safe relationship.
          </Empty>
        )}
      </div>
      {graph.limitations.map((limit) => (
        <p className="subtle" key={limit}>
          <CircleAlert size={14} /> {limit}
        </p>
      ))}
    </>
  );
}

function Inspector({
  notice,
  onClose,
}: {
  notice: Notice;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Notice | null>(null);
  const [graph, setGraph] = useState<EvidenceGraph | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api.notice(notice.id), api.evidence(notice.id)])
      .then(([next, evidence]) => {
        setDetail(next);
        setGraph(evidence);
      })
      .catch((err) => setError(errorText(err)));
  }, [notice.id]);
  const current = detail || notice;
  return (
    <Modal title="Notice record" onClose={onClose}>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="tag-row">
        <StatusTag tone="orange">Synthetic demonstration</StatusTag>
        <StatusTag>{current.status}</StatusTag>
        <StatusTag>revision {current.revision}</StatusTag>
      </div>
      <h3>{current.title}</h3>
      <p className="subtle">{current.summary}</p>
      <div className="section">
        <h3>Evidence and limits</h3>
        {current.evidence.map((item) => (
          <div className="source" key={item.id}>
            <strong>{item.label}</strong>
            <p>
              {item.sourceKind.replaceAll("_", " ")} ·{" "}
              {item.precision.replaceAll("_", " ")}
            </p>
            <p>
              Observed {new Date(item.observedAt).toLocaleString("en-GB")}.{" "}
              {item.fetchedAt
                ? `Retrieved ${new Date(item.fetchedAt).toLocaleString("en-GB")}.`
                : "Retrieval time is unavailable."}
            </p>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                Open source
              </a>
            )}
          </div>
        ))}
      </div>
      <div className="section">
        <h3>How these records relate</h3>
        {graph ? (
          <Graph graph={graph} />
        ) : (
          <p className="subtle">Loading public-safe evidence relations…</p>
        )}
      </div>
      <div className="section">
        <h3>Revision timeline</h3>
        <div className="timeline">
          {current.timeline.map((entry) => (
            <div
              className="timeline-item"
              key={`${entry.revision}-${entry.at}`}
            >
              <strong>
                Revision {entry.revision}: {entry.status}
              </strong>
              <small>{new Date(entry.at).toLocaleString("en-GB")}</small>
              <p>{entry.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ReportForm({
  area,
  onClose,
  onCreated,
}: {
  area: Area;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api.submitReport({
        pilotId: area.id,
        category: String(form.get("category")) as
          "infrastructure" | "transport" | "access" | "community",
        title: String(form.get("title")),
        description: String(form.get("description")),
        place: String(form.get("place")),
        observedAt: new Date(String(form.get("observedAt"))).toISOString(),
        synthetic: true,
      });
      await onCreated();
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Share a local observation" onClose={onClose}>
      {done ? (
        <div className="history">
          <strong>Saved for private review</strong>
          <p className="subtle">
            This synthetic observation is not public. A moderator must review a
            summary before a notice can appear.
          </p>
          <button className="button" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <div className="synthetic">
            <CircleAlert size={17} /> Demonstration only. This is not an
            official report.
          </div>
          <label>
            Category
            <select name="category" defaultValue="infrastructure">
              <option value="infrastructure">Infrastructure</option>
              <option value="transport">Transport</option>
              <option value="access">Access</option>
              <option value="community">Community observation</option>
            </select>
          </label>
          <label>
            Short title
            <input name="title" minLength={5} maxLength={100} required />
          </label>
          <label>
            Approximate place
            <input
              name="place"
              defaultValue={area.place}
              minLength={3}
              maxLength={100}
              required
            />
          </label>
          <label>
            When you observed it
            <input
              name="observedAt"
              type="datetime-local"
              defaultValue={localDateTime()}
              required
            />
          </label>
          <label>
            What you observed
            <textarea
              name="description"
              minLength={5}
              maxLength={600}
              required
            />
          </label>
          <p className="subtle">
            Do not include names, identifying details, or an exact private
            address. If there is an emergency, call 999.
          </p>
          <div className="actions">
            <button className="button" disabled={saving}>
              {saving ? "Saving…" : "Save for review"}
            </button>
            <a
              className="button secondary"
              href={area.reportUrl}
              target="_blank"
              rel="noreferrer"
            >
              Official reporting route
            </a>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}

function Sources({ sources }: { sources: SourceCard[] }) {
  return (
    <div className="stack">
      {sources.length ? (
        sources.map((source) => (
          <article className="source" key={source.id}>
            <div className="tag-row">
              <StatusTag>{source.sourceKind.replaceAll("_", " ")}</StatusTag>
              <StatusTag
                tone={source.status === "available" ? "dark" : "orange"}
              >
                {source.status === "link_only" ? "Link only" : source.status}
              </StatusTag>
            </div>
            <h3>{source.title}</h3>
            <p>{source.summary}</p>
            <p>
              {source.publishedAt
                ? `Published ${new Date(source.publishedAt).toLocaleString("en-GB")}`
                : "Publication time unavailable"}{" "}
              ·{" "}
              {source.fetchedAt
                ? `retrieved ${new Date(source.fetchedAt).toLocaleString("en-GB")}`
                : "retrieval time unavailable"}
            </p>
            <a href={source.url} target="_blank" rel="noreferrer">
              Open source
            </a>
          </article>
        ))
      ) : (
        <Empty title="No source cards returned">
          The service has not confirmed a source status for this area.
        </Empty>
      )}
    </div>
  );
}

function Dashboard({
  area,
  tab,
  setTab,
  data,
  notices,
  loading,
  canReport,
  report,
  inspect,
}: {
  area: Area;
  tab: Tab;
  setTab: (tab: Tab) => void;
  data: AreaData;
  notices: Notice[];
  loading: boolean;
  canReport: boolean;
  report: () => void;
  inspect: (notice: Notice) => void;
}) {
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Area information">
        {tabs.map(([id, label]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="page-heading">
        <div>
          <h1>{area.shortName}</h1>
          <p className="subtle">{area.place} · boundary review pending</p>
        </div>
        {canReport && (
          <button className="button" onClick={report}>
            <Plus size={16} /> Share observation
          </button>
        )}
      </div>
      {(tab === "now" || tab === "community") && (
        <>
          <div className="dashboard">
            <section className="panel map-panel">
              <PilotMap area={area} />
              <div className="map-caption">
                Approximate pilot-area anchor. No incident coordinates.
              </div>
            </section>
            <section className="panel feed-panel">
              <div className="panel-title">
                <h2>
                  {tab === "community"
                    ? "Reviewed community"
                    : "Current notices"}
                </h2>
                <span className="count">{notices.length} shown</span>
              </div>
              <div className="stack">
                {loading ? (
                  <Empty title="Loading notices">
                    Checking the current projection.
                  </Empty>
                ) : notices.length ? (
                  notices.map((notice) => (
                    <NoticeCard
                      notice={notice}
                      onInspect={inspect}
                      key={notice.id}
                    />
                  ))
                ) : (
                  <Empty title="No published notices">
                    No current item was returned. This does not show that
                    conditions are clear.
                  </Empty>
                )}
              </div>
            </section>
          </div>
          <section className="grid section">
            <section className="panel feed-panel">
              <h2>Source status</h2>
              <Sources sources={data.sources} />
            </section>
            <section className="panel feed-panel">
              <h2>What this area covers</h2>
              <p className="subtle">
                {area.name} is a proposed compact pilot. Its boundary and
                station identifiers still need review.
              </p>
              <p className="subtle">
                Map anchors help orientation only. They do not establish an
                event location.
              </p>
            </section>
          </section>
        </>
      )}
      {tab === "help" && (
        <div className="grid section">
          <section className="panel feed-panel">
            <h2>Help directory</h2>
            <div className="stack">
              {data.help.length ? (
                data.help.map((item) => <Help item={item} key={item.id} />)
              ) : (
                <Empty title="No help locations returned">
                  Directory omissions are visible. A listed service is not
                  confirmation that help is available now.
                </Empty>
              )}
            </div>
          </section>
          <section className="panel feed-panel">
            <h2>Source status</h2>
            <Sources sources={data.sources} />
          </section>
        </div>
      )}
      {tab === "history" && (
        <section className="panel history section">
          <div className="tag-row">
            <StatusTag tone="orange">Historical context</StatusTag>
            <StatusTag>not a live warning</StatusTag>
          </div>
          <h2>Comparable history</h2>
          {data.history ? (
            <>
              <p>{data.history.explanation}</p>
              <p>
                <strong>Result:</strong>{" "}
                {data.history.status.replaceAll("_", " ")}
              </p>
            </>
          ) : (
            <p className="subtle">Loading historical coverage.</p>
          )}
          <p className="subtle">
            Historical records are separate from current observations. This view
            does not estimate a person’s risk.
          </p>
        </section>
      )}
    </>
  );
}
function Help({ item }: { item: HelpCard }) {
  const label =
    item.id === "R01"
      ? "Official reporting route"
      : item.id === "C01" || item.id === "C02"
        ? "Council listing"
        : "Directory listing";
  return (
    <article className="help">
      <div className="tag-row">
        <StatusTag>{label}</StatusTag>
        <StatusTag tone="orange">availability {item.availability}</StatusTag>
      </div>
      <h3>{item.name}</h3>
      <p>{item.summary}</p>
      {item.schedule && (
        <p>
          <strong>Published schedule:</strong> {item.schedule}
        </p>
      )}
      <a href={item.url} target="_blank" rel="noreferrer">
        Open source listing
      </a>
    </article>
  );
}
function Reports({
  reports,
  area,
  report,
  withdraw,
}: {
  reports: Report[];
  area: Area;
  report: () => void;
  withdraw: (report: Report) => void;
}) {
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>My reports</h1>
          <p className="subtle">
            Only the current demo persona can see these private observations.
          </p>
        </div>
        <button className="button" onClick={report}>
          <Plus size={16} /> Share observation
        </button>
      </div>
      <div className="stack">
        {reports.length ? (
          reports.map((item) => (
            <article className="report" key={item.id}>
              <div className="tag-row">
                <StatusTag tone="orange">Synthetic</StatusTag>
                <StatusTag>{item.status.replaceAll("_", " ")}</StatusTag>
                <StatusTag>{item.category}</StatusTag>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <p>
                {item.place} · created{" "}
                {new Date(item.createdAt).toLocaleString("en-GB")}
              </p>
              {item.status === "submitted" && (
                <button
                  className="button secondary warn"
                  onClick={() => withdraw(item)}
                >
                  Withdraw this observation
                </button>
              )}
            </article>
          ))
        ) : (
          <Empty title="No observations yet">
            Your reports stay private until a moderator reviews a public
            summary.
          </Empty>
        )}
      </div>
      <section className="panel history section">
        <h2>Official reporting</h2>
        <p>
          Streetwise does not send an official report. Use the relevant route
          yourself if you choose to report an issue.
        </p>
        <a
          className="button secondary"
          href={area.reportUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open official reporting route
        </a>
      </section>
    </section>
  );
}

function Decision({
  report,
  close,
  changed,
}: {
  report: Report;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const options =
    report.status === "submitted"
      ? ([
          ["approve", "Approve summary"],
          ["reject", "Reject"],
        ] as const)
      : report.status === "approved_for_summary"
        ? ([
            ["resolve", "Resolve published notice"],
            ["retract", "Retract published notice"],
          ] as const)
        : ([] as const);
  const [action, setAction] = useState<(typeof options)[number][0]>(
    options[0]?.[0] || "reject",
  );
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.decide(report.id, {
        expectedRevision: report.revision,
        action,
        summary,
      });
      await changed();
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Record a review decision" onClose={close}>
      {options.length ? (
        <form className="form-grid" onSubmit={submit}>
          <div className="synthetic">
            <CircleAlert size={17} /> This applies only to fictional
            demonstration data.
          </div>
          <label htmlFor="moderation-decision">Decision</label>
          <select
            id="moderation-decision"
            value={action}
            onChange={(event) => setAction(event.target.value as typeof action)}
          >
            {options.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <label>
            Public-safe review summary
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              minLength={5}
              maxLength={600}
              required
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button" disabled={saving}>
            {saving ? "Recording…" : "Record decision"}
          </button>
        </form>
      ) : (
        <Empty title="No further decision is available">
          This report has already reached a final review state.
        </Empty>
      )}
    </Modal>
  );
}
function Moderation({
  reports,
  changed,
}: {
  reports: Report[];
  changed: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Report | null>(null);
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Review queue</h1>
          <p className="subtle">
            Fictional moderator actions. Review does not make a claim official.
          </p>
        </div>
        <StatusTag tone="orange">Synthetic operator</StatusTag>
      </div>
      <div className="stack">
        {reports.length ? (
          reports.map((item) => (
            <article className="report" key={item.id}>
              <div className="tag-row">
                <StatusTag>{item.status.replaceAll("_", " ")}</StatusTag>
                <StatusTag>{item.category}</StatusTag>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <p>
                {item.place} · revision {item.revision}
              </p>
              {(item.status === "submitted" ||
                item.status === "approved_for_summary") && (
                <button className="button" onClick={() => setSelected(item)}>
                  Review decision
                </button>
              )}
            </article>
          ))
        ) : (
          <Empty title="No reports need review">
            The queue is empty for this pilot area.
          </Empty>
        )}
      </div>
      {selected && (
        <Decision
          report={selected}
          close={() => setSelected(null)}
          changed={changed}
        />
      )}
    </section>
  );
}
function Inbox({
  notifications,
  personalFeed,
  dispatch,
  inspect,
  onError,
}: {
  notifications: Notification[];
  personalFeed: Notice[];
  dispatch: () => Promise<void>;
  inspect: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await dispatch();
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Inbox</h1>
          <p className="subtle">
            In-app messages only. External delivery is disabled.
          </p>
        </div>
        <button className="button" disabled={busy} onClick={() => void run()}>
          <Send size={16} /> {busy ? "Checking…" : "Check queued items"}
        </button>
      </div>
      <div className="grid">
        <section className="panel feed-panel">
          <h2>Messages</h2>
          <div className="stack">
            {notifications.length ? (
              notifications.map((notice) => (
                <article className="inbox-item" key={notice.id}>
                  <div className="tag-row">
                    <StatusTag>{notice.kind}</StatusTag>
                    <StatusTag>{notice.state}</StatusTag>
                  </div>
                  <p>{notice.message}</p>
                  <small>
                    {new Date(notice.createdAt).toLocaleString("en-GB")}
                  </small>
                  <div className="actions">
                    <button
                      className="button secondary"
                      onClick={() => void inspect(notice.noticeId)}
                    >
                      Open latest notice
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <Empty title="No inbox items">
                There are no messages for this persona.
              </Empty>
            )}
          </div>
        </section>
        <section className="panel feed-panel">
          <h2>Why items appear</h2>
          <div className="stack">
            {personalFeed.length ? (
              personalFeed.map((notice) => (
                <article className="notice" key={notice.id}>
                  <h3>{notice.title}</h3>
                  <p>{notice.reason || "Matches your selected settings."}</p>
                  <StatusTag>{notice.category}</StatusTag>
                </article>
              ))
            ) : (
              <Empty title="No personalised notices">
                Current published items do not match this persona’s settings.
              </Empty>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
function PreferencesPanel({
  preferences,
  saved,
  onError,
}: {
  preferences: Preferences;
  saved: (preferences: Preferences) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [areas, setAreas] = useState(preferences.areas);
  const [categories, setCategories] = useState(preferences.categories);
  const [enabled, setEnabled] = useState(preferences.inAppEnabled);
  const [saving, setSaving] = useState(false);
  const toggle = <T,>(list: T[], item: T, update: (value: T[]) => void) =>
    update(
      list.includes(item)
        ? list.filter((value) => value !== item)
        : [...list, item],
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saved(
        await api.savePreferences({
          expectedRevision: preferences.revision,
          areas,
          categories,
          inAppEnabled: enabled,
        }),
      );
    } catch (error) {
      onError(errorText(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Preferences</h1>
          <p className="subtle">
            Only explicit selections shape this demo persona’s personal feed.
          </p>
        </div>
        <StatusTag>revision {preferences.revision}</StatusTag>
      </div>
      <form className="panel feed-panel form-grid" onSubmit={submit}>
        <fieldset>
          <legend>Follow pilot areas</legend>
          <div className="check-grid">
            {[
              ["hounslow_town_centre", "Hounslow"],
              ["camden_town", "Camden Town"],
              ["west_croydon", "West Croydon"],
            ].map(([id, label]) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={areas.includes(id as never)}
                  onChange={() => toggle(areas, id as never, setAreas)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Notice categories</legend>
          <div className="check-grid">
            {["infrastructure", "transport", "access", "community"].map(
              (item) => (
                <label className="check" key={item}>
                  <input
                    type="checkbox"
                    checked={categories.includes(item as never)}
                    onChange={() =>
                      toggle(categories, item as never, setCategories)
                    }
                  />
                  {item}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <label className="check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable in-app updates
        </label>
        <button
          className="button"
          disabled={saving || !areas.length || !categories.length}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </form>
    </section>
  );
}

function App() {
  const personaPending = useRef(false);
  const [switchingPersona, setSwitchingPersona] = useState(false);
  const [session, setSession] = useState<{ persona: Persona } | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("hounslow_town_centre");
  const [tab, setTab] = useState<Tab>("now");
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<AreaData>({
    notices: [],
    help: [],
    sources: [],
    history: null,
  });
  const [reports, setReports] = useState<Report[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [personalFeed, setPersonalFeed] = useState<Notice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState<Notice | null>(null);
  const [moderation, setModeration] = useState<Report[]>([]);
  const selected = areas.find((area) => area.id === areaId) || areas[0];
  const clearPrivate = () => {
    setReports([]);
    setPreferences(null);
    setPersonalFeed([]);
    setNotifications([]);
    setModeration([]);
    setReportOpen(false);
  };
  const loadArea = async (id: string) => {
    const [notices, help, sources, history] = await Promise.all([
      api.feed(id),
      api.help(id),
      api.sources(id),
      api.history(id),
    ]);
    setData({ notices, help, sources, history });
  };
  const loadMember = async () => {
    const [nextReports, nextPrefs, nextFeed, nextNotes] = await Promise.all([
      api.reports(),
      api.preferences(),
      api.personalFeed(),
      api.notifications(),
    ]);
    setReports(nextReports);
    setPreferences(nextPrefs);
    setPersonalFeed(nextFeed);
    setNotifications(nextNotes);
  };
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const nextSession = await api.session();
      const nextAreas = await api.areas();
      setSession(nextSession);
      setAreas(nextAreas);
      const nextArea = nextAreas.some((area) => area.id === areaId)
        ? areaId
        : nextAreas[0]?.id;
      if (nextArea) {
        setAreaId(nextArea);
        await loadArea(nextArea);
        if (isMember(nextSession.persona)) await loadMember();
        else {
          clearPrivate();
          setModeration(await api.moderation(nextArea));
        }
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    Promise.all([
      loadArea(areaId),
      session.persona === "moderator"
        ? api.moderation(areaId).then(setModeration)
        : Promise.resolve(),
    ])
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [areaId]);
  const notices = useMemo(
    () =>
      tab === "community"
        ? data.notices.filter(
            (item) =>
              item.category === "community" ||
              item.evidence.some(
                (evidence) => evidence.sourceKind === "community_firsthand",
              ),
          )
        : data.notices,
    [data.notices, tab],
  );
  async function persona(persona: Persona) {
    if (personaPending.current || loading) return;
    personaPending.current = true;
    setSwitchingPersona(true);
    setLoading(true);
    setError("");
    clearPrivate();
    setView((current) => (current === "research" ? "research" : "dashboard"));
    try {
      const next = await api.setPersona(persona);
      setSession(next);
      await loadArea(areaId);
      if (isMember(next.persona)) await loadMember();
      else setModeration(await api.moderation(areaId));
    } catch (err) {
      setError(errorText(err));
    } finally {
      personaPending.current = false;
      setSwitchingPersona(false);
      setLoading(false);
    }
  }
  async function refreshMember() {
    await Promise.all([loadMember(), loadArea(areaId)]);
  }
  async function inspectNotice(id: string) {
    try {
      setNoticeOpen(await api.notice(id));
    } catch (err) {
      setError(errorText(err));
    }
  }
  if (loading && !session)
    return (
      <main className="map-fallback">
        <div>
          <RefreshCw />
          <p>
            <strong>Opening Streetwise</strong>
          </p>
          <p>Creating an isolated demonstration session…</p>
        </div>
      </main>
    );
  if (!session || !selected)
    return (
      <main className="map-fallback">
        <div>
          <p>
            <strong>Streetwise is unavailable</strong>
          </p>
          <p>{error || "The session did not return any pilot areas."}</p>
          <button className="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  const navItems =
    session.persona === "moderator"
      ? [
          { id: "dashboard" as View, label: "Explore", icon: MapIcon },
          {
            id: "moderation" as View,
            label: "Review queue",
            icon: ShieldCheck,
          },
          { id: "research" as View, label: "Research", icon: Compass },
        ]
      : memberNav;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Compass size={20} />
          </span>
          Streetwise
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.id ? "active" : ""}
                onClick={() => setView(item.id)}
                key={item.id}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="side-note">
          <strong>Synthetic environment</strong>
          <br />
          All reports, notices, relationships, and operator actions are
          fictional.
        </div>
      </aside>
      <main className="main">
        <div className="synthetic" role="status">
          <CircleAlert size={17} /> Synthetic demonstration. Do not use this
          service for an emergency or as a live safety warning.
        </div>
        <header className="topbar">
          <div className="area-control">
            <span className="eyebrow">Pilot area</span>
            <select
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
              disabled={loading || switchingPersona}
              aria-label="Choose pilot area"
            >
              {areas.map((area) => (
                <option value={area.id} key={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>
          <div className="persona">
            <span className="avatar">
              {session.persona.slice(0, 1).toUpperCase()}
            </span>
            <label>
              <span className="eyebrow">Demo persona</span>
              <select
                value={session.persona}
                onChange={(event) =>
                  void persona(event.target.value as Persona)
                }
                disabled={loading || switchingPersona}
                aria-label="Choose demo persona"
              >
                <option value="alex">Alex</option>
                <option value="sam">Sam</option>
                <option value="moderator">Moderator</option>
              </select>
            </label>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button className="button secondary" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}
        {view === "dashboard" && (
          <Dashboard
            area={selected}
            tab={tab}
            setTab={setTab}
            data={data}
            notices={notices}
            loading={loading}
            canReport={isMember(session.persona)}
            report={() => setReportOpen(true)}
            inspect={setNoticeOpen}
          />
        )}
        {view === "reports" && isMember(session.persona) && (
          <Reports
            reports={reports}
            area={selected}
            report={() => setReportOpen(true)}
            withdraw={async (item) => {
              try {
                await api.withdrawReport(item.id, item.revision);
                await refreshMember();
              } catch (err) {
                setError(errorText(err));
              }
            }}
          />
        )}
        {view === "moderation" && session.persona === "moderator" && (
          <Moderation
            reports={moderation}
            changed={async () => {
              await Promise.all([
                loadArea(areaId),
                api.moderation(areaId).then(setModeration),
              ]);
            }}
          />
        )}
        {view === "inbox" && isMember(session.persona) && (
          <Inbox
            notifications={notifications}
            personalFeed={personalFeed}
            dispatch={async () => setNotifications(await api.dispatch())}
            inspect={inspectNotice}
            onError={setError}
          />
        )}
        {view === "preferences" && isMember(session.persona) && preferences && (
          <PreferencesPanel
            key={session.persona}
            preferences={preferences}
            saved={async (next) => {
              setPreferences(next);
              setPersonalFeed(await api.personalFeed());
            }}
            onError={setError}
          />
        )}
        {view === "research" && (
          <ResearchPanel
            key={session.persona}
            actor={session.persona}
            pilotId={selected.id}
          />
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setView(item.id)}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      {reportOpen && isMember(session.persona) && (
        <ReportForm
          area={selected}
          onClose={() => setReportOpen(false)}
          onCreated={refreshMember}
        />
      )}
      {noticeOpen && (
        <Inspector notice={noticeOpen} onClose={() => setNoticeOpen(null)} />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
