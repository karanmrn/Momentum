import { useEffect, useState } from "react";
import { areas, type PilotId } from "../packages/contracts/index.js";
import {
  recentUpdatesSnapshotSchema,
  type RecentUpdatesSnapshot,
} from "../packages/recent-updates/index.js";
import research from "../packages/recent-updates/research.json";
import savedSample from "../packages/recent-updates/sample.json";
import "./recent-updates.css";

const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: /^\d{4}-\d{2}-\d{2}$/.test(value) ? undefined : "short",
    timeZone: "Europe/London",
  }).format(new Date(value));

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: RecentUpdatesSnapshot };
export function RecentUpdates({
  areaId,
  onExit,
}: {
  areaId?: PilotId;
  onExit?: () => void;
}) {
  const [area, setArea] = useState<PilotId | "london">(areaId ?? "london");
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [showSample, setShowSample] = useState(false);
  const reviewed = research.items
    .filter(
      (item) =>
        item.publicationStatus === "reviewed_research" &&
        (area === "london" || item.areaId === area) &&
        Date.parse(item.publishedAt) >= Date.now() - 30 * 86400000 &&
        Date.parse(item.publishedAt) <= Date.now(),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    setLoad({ kind: "loading" });
    fetch("/api/public/recent-updates", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json();
        const data = recentUpdatesSnapshotSchema.parse(body.data ?? body);
        if (!controller.signal.aborted) setLoad({ kind: "ready", data });
      })
      .catch(() => {
        if (!disposed) setLoad({ kind: "error" });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);
  const sampleAvailable =
    Date.parse(savedSample.checkedAt!) >= Date.now() - 30 * 86400000;
  const data = showSample
    ? recentUpdatesSnapshotSchema.parse(savedSample)
    : load.kind === "ready"
      ? load.data
      : null;
  const items =
    data?.items.filter(
      (item) => area === "london" || item.areaIds.includes(area),
    ) ?? [];
  const source = data?.sources[0];
  async function share(
    title: string,
    url: string,
    publishedAt: string,
    context = "",
  ) {
    const text = `${title}\nPublished ${date(publishedAt)}. Published coverage, not a live warning.\n${context}\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        setMessage("Share options closed.");
      } else {
        await navigator.clipboard.writeText(text);
        setMessage("Source link and publication date copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Could not share. Open the source and copy its link.");
    }
  }
  return (
    <main className="recent-updates">
      <header className="ru-heading">
        <h1>Local updates</h1>
        {onExit && <button onClick={onExit}>Back to Streetwise</button>}
      </header>
      <p className="ru-boundary">
        Published coverage from the past 30 days. These are not live incident
        alerts.
      </p>
      <div className="ru-layout">
        <aside className="ru-source" aria-labelledby="ru-refresh">
          <h2 id="ru-refresh">
            {showSample ? "Saved feed sample" : "Daily refresh"}
          </h2>
          {showSample && (
            <p>
              This sample came from a manual source check. It does not confirm
              that the daily job has run.
            </p>
          )}
          <dl>
            <dt>Last check</dt>
            <dd>{data?.checkedAt ? date(data.checkedAt) : "Not available"}</dd>
            <dt>Last successful check</dt>
            <dd>
              {source?.lastSuccessAt
                ? date(source.lastSuccessAt)
                : "No successful refresh recorded"}
            </dd>
            <dt>Source</dt>
            <dd>
              <a
                href="https://www.bbc.com/news"
                target="_blank"
                rel="noopener noreferrer"
              >
                BBC News
              </a>{" "}
              · London
            </dd>
          </dl>
          <p>
            Publication dates do not confirm when an incident happened. News
            coverage is incomplete.
          </p>
        </aside>
        <section aria-labelledby="ru-news">
          <h2 id="ru-news">Recent news</h2>
          {sampleAvailable &&
            (showSample ||
              load.kind === "error" ||
              (load.kind === "ready" &&
                load.data.status === "unavailable")) && (
              <button onClick={() => setShowSample((value) => !value)}>
                {showSample
                  ? "Return to daily feed"
                  : "Show fetched news sample"}
              </button>
            )}
          <div className="ru-filter">
            <label htmlFor="ru-area">Area</label>
            <select
              id="ru-area"
              value={area}
              onChange={(event) =>
                setArea(event.target.value as PilotId | "london")
              }
            >
              <option value="london">London coverage</option>
              {areas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortName} borough coverage
                </option>
              ))}
            </select>
          </div>
          {load.kind === "loading" && (
            <p role="status">Loading published updates...</p>
          )}
          {!showSample && load.kind === "error" && (
            <div role="alert">
              <p>Updates could not be loaded.</p>
              <button onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </button>
            </div>
          )}
          {data?.status === "stale" && (
            <p className="ru-warning" role="status">
              The feed is out of date. These entries came from an earlier
              successful check.
            </p>
          )}
          {data?.status === "unavailable" && (
            <p role="status">
              The feed is unavailable. No recent source check has succeeded.
            </p>
          )}
          {data && data.status !== "unavailable" && !items.length && (
            <p role="status">
              No matching coverage was found in this feed. This does not mean no
              incidents occurred.
            </p>
          )}
          <ol className="ru-list">
            {items.map((item) => (
              <li key={item.id}>
                <article>
                  <p className="ru-meta">BBC News London · News coverage</p>
                  <h3>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.title}
                    </a>
                  </h3>
                  <p>
                    Published{" "}
                    <time dateTime={item.publishedAt}>
                      {date(item.publishedAt)}
                    </time>
                  </p>
                  <p>{item.scopeLabel} · Incident date unknown</p>
                  <button
                    onClick={() =>
                      void share(
                        item.title,
                        item.url,
                        item.publishedAt,
                        item.scopeLabel,
                      )
                    }
                  >
                    Share source
                  </button>
                </article>
              </li>
            ))}
          </ol>
          <section className="ru-research" aria-labelledby="ru-official">
            <h2 id="ru-official">Official updates</h2>
            <p>
              Manually checked on 12 September 2026. These links are separate
              from the daily news feed.
            </p>
            {!reviewed.length && (
              <p>
                No checked official links match this area and publication
                window.
              </p>
            )}
            <ol className="ru-list">
              {reviewed.map((item) => (
                <li key={item.id}>
                  <article>
                    <p className="ru-meta">
                      {item.sourceName} · Official publication
                    </p>
                    <h3>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.title}
                      </a>
                    </h3>
                    <p>
                      Published{" "}
                      <time dateTime={item.publishedAt}>
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                        }).format(new Date(item.publishedAt))}
                      </time>
                    </p>
                    <p>{item.summary}</p>
                    <p>{item.geography}</p>
                    <button
                      onClick={() =>
                        void share(
                          item.title,
                          item.url,
                          item.publishedAt,
                          `${item.summary} ${item.geography}`,
                        )
                      }
                    >
                      Share source
                    </button>
                  </article>
                </li>
              ))}
            </ol>
          </section>
          <p role="status" aria-live="polite">
            {message}
          </p>
        </section>
      </div>
    </main>
  );
}
