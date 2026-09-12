import { ReportEditor } from "./ReportEditor";
import { ScenarioPicker, type ScenarioDraft } from "./ScenarioPicker";
import { DatasetCoverage } from "./DatasetCoverage";
import { SemanticGraph } from "./SemanticGraph";
import { AreaShare } from "./AreaShare";
import { entryArea, publicBrowse, rememberArea } from "./entry";
import { ResearchPanel } from "../packages/recruitment/ResearchPanel";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { LocalMap } from "./LocalMap";
import { TransportPanel, useLocalTransport } from "./TransportPanel";
import {
  Bell,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Compass,
  Map as MapIcon,
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
  HistoricalCoverage,
  Notice,
  Notification,
  Persona,
  Preferences,
  Report,
  SourceCard,
} from "../packages/contracts";
import { areas as pilotAreas } from "../packages/contracts";
import { api, ApiError } from "./api";
import "./styles.css";

type Tab = "now" | "community" | "help" | "history";
type View =
  "dashboard" | "reports" | "moderation" | "inbox" | "preferences" | "research";
type AreaData = {
  notices: Notice[];
  help: HelpCard[];
  sources: SourceCard[];
  history: HistoricalCoverage | null;
  errors: Partial<Record<"notices" | "help" | "sources" | "history", string>>;
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
const currentEntryArea = () =>
  entryArea(typeof window === "undefined" ? "" : window.location.search);
const emptyAreaData = (): AreaData => ({
  notices: [],
  help: [],
  sources: [],
  history: null,
  errors: {},
});

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
function Unavailable({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry: () => void;
}) {
  return (
    <div className="empty" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      <button className="button secondary" onClick={retry}>
        Retry area data
      </button>
    </div>
  );
}
function AreaChooser({ choose }: { choose: (areaId: Area["id"]) => void }) {
  return (
    <main className="map-fallback area-chooser">
      <div>
        <h1>Choose a pilot area</h1>
        <p>The area link is not recognised.</p>
        <div className="actions">
          {pilotAreas.map((area) => (
            <button
              className="button"
              key={area.id}
              onClick={() => choose(area.id)}
            >
              {area.name}
            </button>
          ))}
        </div>
      </div>
    </main>
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

function NoticeCard({
  notice,
  onInspect,
  canInspect = true,
}: {
  notice: Notice;
  onInspect: (notice: Notice) => void;
  canInspect?: boolean;
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
      </div>
      <h3>{notice.title}</h3>
      <p>{notice.summary}</p>
      <p>
        <strong>{notice.place}</strong> · observed {observed}
      </p>
      <p className="notice-facts">
        {notice.category} · {notice.status} ·{" "}
        {source?.sourceKind.replaceAll("_", " ") || "Source not supplied"}
      </p>
      <p className="notice-facts">
        {source?.precision.replaceAll("_", " ") || "Precision unknown"} ·{" "}
        {notice.reviewStatus.replaceAll("_", " ")}
      </p>
      {canInspect && (
        <div className="actions">
          <button
            className="button secondary"
            onClick={() => onInspect(notice)}
          >
            Source and history <ChevronRight size={14} />
          </button>
        </div>
      )}
    </article>
  );
}

const relationLabel = (predicate: string) =>
  (
    ({
      AFFECTS_PLACE: "Applies to",
      DERIVED_FROM: "Supported by",
      ISSUED_BY: "Published by",
      REPLACES: "Replaces",
    }) as Record<string, string>
  )[predicate] || predicate.replaceAll("_", " ").toLowerCase();

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
                  aria-label={`${relationLabel(edge.predicate)} relation`}
                >
                  →
                </span>
                <div className="node">
                  {to?.label || "Public record"}
                  <br />
                  <small>{to?.type || "unknown"}</small>
                </div>
                <small className="edge-detail">
                  <strong>{relationLabel(edge.predicate)}</strong> ·{" "}
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
  const formRef = useRef<HTMLFormElement>(null);
  function useScenario(draft: ScenarioDraft) {
    const form = formRef.current;
    if (!form) return;
    const date = new Date(draft.observedAt);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    for (const [name, value] of Object.entries({
      ...draft,
      observedAt: local,
    })) {
      const field = form.elements.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
        field.value = value;
    }
  }
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
        <form ref={formRef} className="form-grid" onSubmit={submit}>
          <div className="synthetic">
            <CircleAlert size={17} /> Demonstration only. This is not an
            official report.
          </div>
          <ScenarioPicker
            key={area.id}
            areaId={area.id}
            disabled={saving}
            onUse={useScenario}
          />
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

function Sources({
  sources,
  compact = false,
}: {
  sources: SourceCard[];
  compact?: boolean;
}) {
  return (
    <div className="stack">
      {sources.length ? (
        sources.map((source) => (
          <article
            className={`source ${compact ? "source-compact" : ""}`}
            key={source.id}
          >
            <p className="source-line">
              {source.sourceKind.replaceAll("_", " ")} ·{" "}
              {source.status === "link_only" ? "Link only" : source.status}
            </p>
            <h3>{source.title}</h3>
            <p>{source.summary}</p>
            {source.coverage && (
              <p className="source-fact">
                <strong>Coverage:</strong>{" "}
                {source.coverage === "sample"
                  ? "Retrieved sample"
                  : source.coverage.replaceAll("_", " ")}
              </p>
            )}
            {typeof source.recordCount === "number" &&
              source.coverage === "sample" && (
                <p className="source-fact">
                  <strong>
                    {source.recordCountLabel || "Records in this sample"}:
                  </strong>{" "}
                  {source.recordCount}
                </p>
              )}
            <p>
              {source.publishedAt
                ? `Published ${new Date(source.publishedAt).toLocaleString("en-GB")}`
                : "Publication time unavailable"}{" "}
              ·{" "}
              {source.fetchedAt
                ? `retrieved ${new Date(source.fetchedAt).toLocaleString("en-GB")}`
                : "retrieval time unavailable"}
            </p>
            {source.checkedAt && !compact && (
              <p className="source-fact">
                Checked {new Date(source.checkedAt).toLocaleString("en-GB")}
              </p>
            )}
            {source.attribution && !compact && (
              <p className="source-fact">{source.attribution}</p>
            )}
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
  mapOpen,
  toggleMap,
  retryArea,
  isPublic,
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
  mapOpen: boolean;
  toggleMap: () => void;
  retryArea: () => void;
  isPublic: boolean;
}) {
  const transportData = useLocalTransport(area.id, tab === "now");
  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, id: Tab) => {
    const current = tabs.findIndex(([tabId]) => tabId === id);
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? current === last
          ? 0
          : current + 1
        : event.key === "ArrowLeft"
          ? current === 0
            ? last
            : current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const nextId = tabs[next][0];
    setTab(nextId);
    requestAnimationFrame(() => {
      document.getElementById(`area-tab-${nextId}`)?.focus();
    });
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Area information">
        {tabs.map(([id, label]) => (
          <button
            id={`area-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="area-information-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => moveTab(event, id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="page-heading area-heading">
        <div>
          <span className="eyebrow">Local information</span>
          <h1>{area.shortName}</h1>
          <p className="subtle">{area.place} · boundary review pending</p>
        </div>
        <div className="heading-actions">
          {(tab === "now" || tab === "community") && (
            <div className="map-switcher" aria-label="Map and list view">
              <button
                className="button secondary"
                onClick={() => mapOpen && toggleMap()}
                aria-pressed={!mapOpen}
              >
                List view
              </button>
              <button
                className="button secondary"
                onClick={() => !mapOpen && toggleMap()}
                aria-pressed={mapOpen}
              >
                Map view
              </button>
            </div>
          )}
          {canReport && (
            <button className="button" onClick={report}>
              <Plus size={16} /> Share observation
            </button>
          )}
        </div>
      </div>
      <div
        id="area-information-panel"
        role="tabpanel"
        aria-labelledby={`area-tab-${tab}`}
      >
        {tab === "now" && (
          <div className={`now-view ${mapOpen ? "map-open" : ""}`}>
            <div className="now-layout">
              <section className="panel map-panel local-map-panel">
                <LocalMap
                  area={area}
                  help={data.help}
                  transport={transportData.transport ?? undefined}
                  cameras={transportData.cameras ?? undefined}
                />
              </section>
              <section className="panel feed-panel source-panel">
                <TransportPanel area={area.id} data={transportData} />
                <div className="panel-title">
                  <h2>Local source updates</h2>
                  <span className="count">Source-backed</span>
                </div>
                {data.errors.sources ? (
                  <Unavailable
                    title="Local source updates are unavailable"
                    message={data.errors.sources}
                    retry={retryArea}
                  />
                ) : loading ? (
                  <Empty title="Loading local sources">
                    Checking source coverage.
                  </Empty>
                ) : (
                  <Sources sources={data.sources} compact />
                )}
              </section>
            </div>
            <section className="panel feed-panel section now-community">
              <div className="panel-title">
                <h2>Reviewed community update</h2>
                <span className="count">{notices.length} shown</span>
              </div>
              <div className="stack">
                {data.errors.notices ? (
                  <Unavailable
                    title="Reviewed community updates are unavailable"
                    message={data.errors.notices}
                    retry={retryArea}
                  />
                ) : loading ? (
                  <Empty title="Loading reviewed updates">
                    Checking the current projection.
                  </Empty>
                ) : notices.length ? (
                  notices.map((notice) => (
                    <NoticeCard
                      notice={notice}
                      onInspect={inspect}
                      canInspect={!isPublic}
                      key={notice.id}
                    />
                  ))
                ) : (
                  <Empty title="No published notices">
                    {isPublic
                      ? "Community updates are not collected in public browsing."
                      : "No current item was returned. This does not show that conditions are clear."}
                  </Empty>
                )}
              </div>
            </section>
          </div>
        )}
        {tab === "community" && (
          <>
            <div className={`dashboard ${mapOpen ? "map-open" : ""}`}>
              <section className="panel map-panel local-map-panel">
                <LocalMap
                  area={area}
                  help={data.help}
                  transport={transportData.transport ?? undefined}
                  cameras={transportData.cameras ?? undefined}
                />
              </section>
              <section className="panel feed-panel">
                <div className="panel-title">
                  <h2>Reviewed community</h2>
                  <span className="count">{notices.length} shown</span>
                </div>
                <div className="stack">
                  {data.errors.notices ? (
                    <Unavailable
                      title="Reviewed community updates are unavailable"
                      message={data.errors.notices}
                      retry={retryArea}
                    />
                  ) : loading ? (
                    <Empty title="Loading notices">
                      Checking the current projection.
                    </Empty>
                  ) : notices.length ? (
                    notices.map((notice) => (
                      <NoticeCard
                        notice={notice}
                        onInspect={inspect}
                        canInspect={!isPublic}
                        key={notice.id}
                      />
                    ))
                  ) : (
                    <Empty title="No published notices">
                      {isPublic
                        ? "Community updates are not collected in public browsing."
                        : "No current item was returned. This does not show that conditions are clear."}
                    </Empty>
                  )}
                </div>
              </section>
            </div>
            <section className="panel feed-panel section">
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
          </>
        )}
        {tab === "help" && (
          <div className="grid section">
            <section className="panel feed-panel">
              <h2>Help directory</h2>
              <div className="stack">
                {data.errors.help ? (
                  <Unavailable
                    title="Help directory is unavailable"
                    message={data.errors.help}
                    retry={retryArea}
                  />
                ) : data.help.length ? (
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
              {data.errors.sources ? (
                <Unavailable
                  title="Source status is unavailable"
                  message={data.errors.sources}
                  retry={retryArea}
                />
              ) : (
                <Sources sources={data.sources} />
              )}
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
            {data.errors.history ? (
              <Unavailable
                title="Historical coverage is unavailable"
                message={data.errors.history}
                retry={retryArea}
              />
            ) : data.history ? (
              <>
                <p>{data.history.explanation}</p>
                {data.history.latestMonth && (
                  <p>
                    <strong>Latest published month:</strong>{" "}
                    {data.history.latestMonth}
                  </p>
                )}
                {data.history.availableMonths?.length ? (
                  <details className="published-periods">
                    <summary>
                      {data.history.availableMonths.length} published months
                    </summary>
                    <p>{data.history.availableMonths.join(", ")}</p>
                  </details>
                ) : null}
                {data.history.fetchedAt && (
                  <p className="source-fact">
                    Checked{" "}
                    {new Date(data.history.fetchedAt).toLocaleString("en-GB")}
                  </p>
                )}
                {data.history.sourceUrl && (
                  <a
                    href={data.history.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open historical data source
                  </a>
                )}
                <p>
                  <strong>Area totals:</strong> Unavailable. Pilot boundaries
                  still need review.
                </p>
              </>
            ) : (
              <p className="subtle">Loading historical coverage.</p>
            )}
            <p className="subtle">
              Historical records are separate from current observations. This
              view does not estimate a person's risk.
            </p>
            <DatasetCoverage pilotId={area.id} />
            {area.id === "camden_town" && (
              <a
                className="button secondary"
                href={`/?evidence=camden&area=camden_town${isPublic ? "&public=1" : "&demo=1"}`}
              >
                Explore Camden evidence example
              </a>
            )}
            <SemanticGraph area={area.id} isPublic={isPublic} />
          </section>
        )}
      </div>
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
      {item.address && (
        <p className="source-fact">
          <strong>Address:</strong> {item.address}
        </p>
      )}
      {item.services?.length ? (
        <p className="source-fact">
          <strong>Services:</strong> {item.services.join(", ")}
        </p>
      ) : null}
      {item.schedule && (
        <p>
          <strong>Published schedule:</strong> {item.schedule}
        </p>
      )}
      {item.sourceLabel && (
        <p className="source-fact">Source: {item.sourceLabel}</p>
      )}
      {item.checkedAt && (
        <p className="source-fact">
          Checked {new Date(item.checkedAt).toLocaleString("en-GB")}
        </p>
      )}
      <a href={item.url} target="_blank" rel="noreferrer">
        Open source
      </a>
    </article>
  );
}
function Reports({
  reports,
  area,
  report,
  edit,
  withdraw,
}: {
  reports: Report[];
  area: Area;
  report: () => void;
  edit: (report: Report) => void;
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
              {item.status === "submitted" && item.noticeId === null && (
                <button className="button secondary" onClick={() => edit(item)}>
                  Edit observation
                </button>
              )}
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
          Streetwise Safety does not send an official report. Use the relevant
          route yourself if you choose to report an issue.
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

const AccountAccess = lazy(() =>
  import("./AccountPanel").then((module) => ({
    default: module.AccountAccess,
  })),
);

function App() {
  const personaPending = useRef(false);
  const areaRequestGeneration = useRef(0);
  const [switchingPersona, setSwitchingPersona] = useState(false);
  const [session, setSession] = useState<{ persona: Persona } | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState(() => currentEntryArea().areaId);
  const [invalidArea, setInvalidArea] = useState(
    () => publicBrowse && currentEntryArea().invalid,
  );
  const [tab, setTab] = useState<Tab>("now");
  const [view, setView] = useState<View>("dashboard");
  const [mapOpen, setMapOpen] = useState(false);
  const [data, setData] = useState<AreaData>(emptyAreaData);
  const [reports, setReports] = useState<Report[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [personalFeed, setPersonalFeed] = useState<Notice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState<Notice | null>(null);
  const [moderation, setModeration] = useState<Report[]>([]);
  const selected = areas.find((area) => area.id === areaId) || areas[0];
  const chooseArea = (id: Area["id"]) => {
    setAreaId(id);
    setInvalidArea(false);
    if (publicBrowse) rememberArea(id);
  };
  const clearPrivate = () => {
    setReports([]);
    setPreferences(null);
    setPersonalFeed([]);
    setNotifications([]);
    setModeration([]);
    setReportOpen(false);
    setEditingReport(null);
  };
  const loadArea = async (id: string) => {
    const generation = ++areaRequestGeneration.current;
    setData(emptyAreaData());
    const [notices, help, sources, history] = await Promise.allSettled([
      api.feed(id),
      api.help(id),
      api.sources(id),
      api.history(id),
    ]);
    if (generation === areaRequestGeneration.current) {
      setData({
        notices: notices.status === "fulfilled" ? notices.value : [],
        help: help.status === "fulfilled" ? help.value : [],
        sources: sources.status === "fulfilled" ? sources.value : [],
        history: history.status === "fulfilled" ? history.value : null,
        errors: {
          ...(notices.status === "rejected"
            ? { notices: errorText(notices.reason) }
            : {}),
          ...(help.status === "rejected"
            ? { help: errorText(help.reason) }
            : {}),
          ...(sources.status === "rejected"
            ? { sources: errorText(sources.reason) }
            : {}),
          ...(history.status === "rejected"
            ? { history: errorText(history.reason) }
            : {}),
        },
      });
    }
  };
  const retryArea = async () => {
    setLoading(true);
    setError("");
    try {
      await loadArea(areaId);
    } finally {
      setLoading(false);
    }
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
        if (!publicBrowse && isMember(nextSession.persona)) {
          await loadMember();
        } else if (!publicBrowse) {
          clearPrivate();
          setModeration(await api.moderation(nextArea));
        } else {
          clearPrivate();
        }
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!invalidArea) void reload();
  }, [invalidArea]);
  useEffect(() => {
    if (!session || invalidArea) return;
    setLoading(true);
    Promise.all([
      loadArea(areaId),
      !publicBrowse && session.persona === "moderator"
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
    if (publicBrowse || personaPending.current || loading) return;
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
  if (invalidArea) return <AreaChooser choose={chooseArea} />;
  if (loading && !session)
    return (
      <main className="map-fallback">
        <div>
          <RefreshCw />
          <p>
            <strong>Opening Streetwise Safety</strong>
          </p>
          <p>Loading local information.</p>
        </div>
      </main>
    );
  if (!session || !selected)
    return (
      <main className="map-fallback">
        <div>
          <p>
            <strong>Streetwise Safety is unavailable</strong>
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
          Streetwise Safety
        </div>
        <nav className="nav" aria-label="Website navigation">
          {(publicBrowse
            ? tabs.map(([id, label]) => ({
                id,
                label,
                icon: MapIcon,
              }))
            : navItems
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={
                  publicBrowse
                    ? view === "dashboard" && tab === item.id
                      ? "active"
                      : ""
                    : view === item.id
                      ? "active"
                      : ""
                }
                onClick={() => {
                  if (publicBrowse) {
                    setView("dashboard");
                    setTab(item.id as Tab);
                  } else {
                    setView(item.id as View);
                  }
                }}
                key={item.id}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        {!publicBrowse && (
          <div className="side-note">
            <strong>Report trial</strong>
            <br />
            Community reports and operator actions are fictional. Local sources
            have their own dates and links.
          </div>
        )}
      </aside>
      <main className="main">
        <div className="synthetic" role="status">
          <CircleAlert size={17} />{" "}
          {publicBrowse
            ? "Pilot information. Not an emergency service."
            : "Community reports and reviews are fictional. This is not an emergency service."}
        </div>
        <header className="topbar">
          <button
            className="button secondary"
            onClick={() => setAccountOpen(true)}
          >
            Account
          </button>
          <div className="mobile-brand">Streetwise Safety</div>
          <div className="area-control">
            <span className="eyebrow">Pilot area</span>
            <select
              value={areaId}
              onChange={(event) => chooseArea(event.target.value as Area["id"])}
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
          {!publicBrowse && (
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
          )}
          {publicBrowse && (
            <div className="public-actions">
              <a
                className="button secondary"
                href={`/?updates=1&area=${selected.id}${import.meta.env.DEV ? "&public=1" : ""}`}
              >
                Local updates
              </a>
              <AreaShare
                areaId={selected.id}
                canonicalOrigin={import.meta.env.VITE_PUBLIC_SITE_URL}
              />
              <a
                className="button secondary presentation-entry"
                href={`/?presentation=1&area=${selected.id}${import.meta.env.DEV ? "&public=1" : ""}`}
              >
                Presentation
              </a>
              {import.meta.env.VITE_DEMO_ENABLED === "true" && (
                <a
                  className="button"
                  href={`/api/demo?area=${encodeURIComponent(selected.id)}`}
                >
                  Try invited demo
                </a>
              )}
            </div>
          )}
          {!publicBrowse && isMember(session.persona) && (
            <div className="mobile-utilities" aria-label="More sections">
              <button
                className="utility-button"
                onClick={() => setView("preferences")}
              >
                Preferences
              </button>
              <button
                className="utility-button"
                onClick={() => setView("research")}
              >
                Research
              </button>
            </div>
          )}
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
            canReport={!publicBrowse && isMember(session.persona)}
            report={() => setReportOpen(true)}
            inspect={setNoticeOpen}
            mapOpen={mapOpen}
            toggleMap={() => setMapOpen((open) => !open)}
            retryArea={() => void retryArea()}
            isPublic={publicBrowse}
          />
        )}
        {!publicBrowse && view === "reports" && isMember(session.persona) && (
          <Reports
            reports={reports}
            edit={setEditingReport}
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
        {!publicBrowse &&
          view === "moderation" &&
          session.persona === "moderator" && (
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
        {!publicBrowse && view === "inbox" && isMember(session.persona) && (
          <Inbox
            notifications={notifications}
            personalFeed={personalFeed}
            dispatch={async () => setNotifications(await api.dispatch())}
            inspect={inspectNotice}
            onError={setError}
          />
        )}
        {!publicBrowse &&
          view === "preferences" &&
          isMember(session.persona) &&
          preferences && (
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
        {!publicBrowse && view === "research" && (
          <ResearchPanel
            key={session.persona}
            actor={session.persona}
            pilotId={selected.id}
          />
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {publicBrowse
          ? tabs.map(([id, label]) => (
              <button
                className={view === "dashboard" && tab === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setView("dashboard");
                  setTab(id);
                }}
              >
                <MapIcon size={18} />
                {label}
              </button>
            ))
          : isMember(session.persona)
            ? [
                {
                  id: "dashboard" as View,
                  label: "Explore",
                  icon: MapIcon,
                  action: () => {
                    setView("dashboard");
                    setTab("now");
                  },
                },
                {
                  id: "reports" as View,
                  label: "My reports",
                  icon: ClipboardList,
                  action: () => setView("reports"),
                },
                {
                  id: "inbox" as View,
                  label: "Updates",
                  icon: Bell,
                  action: () => setView("inbox"),
                },
                {
                  id: "help" as View,
                  label: "Get help",
                  icon: Compass,
                  action: () => {
                    setView("dashboard");
                    setTab("help");
                  },
                },
              ].map((item) => {
                const Icon = item.icon;
                const active =
                  item.label === "Get help"
                    ? view === "dashboard" && tab === "help"
                    : view === item.id;
                return (
                  <button
                    className={active ? "active" : ""}
                    key={item.id}
                    onClick={item.action}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })
            : navItems.map((item) => {
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
      {!publicBrowse && reportOpen && isMember(session.persona) && (
        <ReportForm
          area={selected}
          onClose={() => setReportOpen(false)}
          onCreated={refreshMember}
        />
      )}
      {!publicBrowse &&
        editingReport &&
        isMember(session.persona) &&
        editingReport.owner === session.persona && (
          <Modal
            title="Edit observation"
            onClose={() => setEditingReport(null)}
          >
            <ReportEditor
              key={editingReport.id}
              report={editingReport}
              onSaved={async () => {
                await refreshMember();
                setEditingReport(null);
              }}
            />
          </Modal>
        )}
      {!publicBrowse && noticeOpen && (
        <Inspector notice={noticeOpen} onClose={() => setNoticeOpen(null)} />
      )}
      {accountOpen && (
        <Modal title="Account" onClose={() => setAccountOpen(false)}>
          <Suspense fallback={<p role="status">Loading account...</p>}>
            <AccountAccess embedded />
          </Suspense>
        </Modal>
      )}
    </div>
  );
}
const RecentUpdates = lazy(() =>
  import("./RecentUpdates").then((module) => ({
    default: module.RecentUpdates,
  })),
);
const Presentation = lazy(() =>
  import("./Presentation").then((module) => ({ default: module.Presentation })),
);
const CamdenEvidence = lazy(() =>
  import("./CamdenEvidence").then((module) => ({
    default: module.CamdenEvidence,
  })),
);
function Entry() {
  const query = new URLSearchParams(window.location.search);
  const entry = entryArea(window.location.search);
  if (query.get("updates") === "1" && !entry.invalid) {
    return (
      <Suspense
        fallback={
          <main className="map-fallback">Loading local updates...</main>
        }
      >
        <RecentUpdates
          areaId={entry.areaId}
          onExit={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("updates");
            window.location.assign(url.href);
          }}
        />
      </Suspense>
    );
  }
  if (query.get("evidence") === "camden") {
    return (
      <Suspense
        fallback={
          <main className="map-fallback">Loading Camden evidence...</main>
        }
      >
        <CamdenEvidence
          onExit={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("evidence");
            url.searchParams.set("area", "camden_town");
            window.location.assign(url.href);
          }}
        />
      </Suspense>
    );
  }
  if (query.get("presentation") === "1" && !entry.invalid) {
    return (
      <Suspense
        fallback={<main className="map-fallback">Opening presentation.</main>}
      >
        <Presentation
          areaId={entry.areaId}
          canonicalOrigin={import.meta.env.VITE_PUBLIC_SITE_URL}
          onExit={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("presentation");
            window.location.assign(url.href);
          }}
        />
      </Suspense>
    );
  }
  return <App />;
}
createRoot(document.getElementById("root")!).render(<Entry />);
