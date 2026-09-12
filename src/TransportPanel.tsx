import { useCallback, useEffect, useId, useState } from "react";
import { z } from "zod";
import { pilotSchema, type PilotId } from "../packages/contracts";
import {
  transportSnapshotSchema,
  trafficCameraSnapshotSchema,
  type TransportSnapshot,
  type TrafficCameraSnapshot,
} from "../packages/transport";
import "./transport-panel.css";

const POLL_MS = 30_000;
const MIN_POLL_MS = 1_000;
const EXPIRY_MARGIN_MS = 25;
const REQUEST_TIMEOUT_MS = 15_000;
const envelopeSchema = z.object({
  schemaVersion: z.literal("1.0"),
  synthetic: z.literal(false),
  generatedAt: z.string().datetime(),
  data: z.unknown(),
  coverage: z.array(z.unknown()),
});

interface LocalTransportState {
  area: PilotId;
  transport: TransportSnapshot | null;
  cameras: TrafficCameraSnapshot | null;
  loading: boolean;
  camerasLoading: boolean;
  error: string | null;
  cameraError: string | null;
}

function emptyState(area: PilotId): LocalTransportState {
  return {
    area,
    transport: null,
    cameras: null,
    loading: true,
    camerasLoading: true,
    error: null,
    cameraError: null,
  };
}

/** Poll public transport only while the selected view and document are visible. */
export function useLocalTransport(area: PilotId, enabled = true) {
  const [state, setState] = useState<LocalTransportState>(() =>
    emptyState(area),
  );
  const [revision, setRevision] = useState(0);
  const [, updateClock] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const pilotId = pilotSchema.parse(area);
    setState(emptyState(pilotId));
    if (!enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let transportController: AbortController | undefined;
    let cameraController: AbortController | undefined;
    let camerasRequested = false;
    let scheduleGeneration = 0;
    let expiredRetryMs = MIN_POLL_MS;

    async function readSnapshot(path: string, controller: AbortController) {
      const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(
          `${path}?area=${encodeURIComponent(pilotId)}`,
          {
            signal: controller.signal,
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        );
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("source_unavailable");
        return envelopeSchema.parse(body).data;
      } finally {
        clearTimeout(deadline);
      }
    }

    async function readTransport() {
      transportController?.abort();
      const controller = new AbortController();
      transportController = controller;
      setState((current) => ({ ...current, loading: true }));
      try {
        const snapshot = transportSnapshotSchema.parse(
          await readSnapshot("/api/public/transport", controller),
        );
        if (
          snapshot.pilotId !== pilotId ||
          Date.parse(snapshot.fetchedAt) > Date.now()
        ) {
          throw new Error("invalid_snapshot");
        }
        if (
          !stopped &&
          transportController === controller &&
          document.visibilityState === "visible"
        ) {
          setState((current) => ({
            ...current,
            transport: snapshot,
            error: null,
          }));
          return Date.parse(snapshot.expiresAt);
        }
        return null;
      } catch {
        if (
          !stopped &&
          transportController === controller &&
          document.visibilityState === "visible"
        ) {
          setState((current) => ({
            ...current,
            transport: null,
            error: "Transport status is unavailable.",
          }));
        }
        return null;
      } finally {
        if (!stopped && transportController === controller) {
          setState((current) => ({ ...current, loading: false }));
        }
      }
    }

    async function readCameras() {
      const controller = new AbortController();
      cameraController = controller;
      camerasRequested = true;
      setState((current) => ({ ...current, camerasLoading: true }));
      try {
        const snapshot = trafficCameraSnapshotSchema.parse(
          await readSnapshot("/api/public/traffic-cameras", controller),
        );
        if (
          snapshot.pilotId !== pilotId ||
          Date.parse(snapshot.fetchedAt) > Date.now()
        ) {
          throw new Error("invalid_snapshot");
        }
        if (
          !stopped &&
          cameraController === controller &&
          document.visibilityState === "visible"
        ) {
          setState((current) => ({
            ...current,
            cameras: snapshot,
            cameraError: null,
          }));
        }
      } catch {
        if (
          !stopped &&
          cameraController === controller &&
          document.visibilityState === "visible"
        ) {
          setState((current) => ({
            ...current,
            cameras: null,
            cameraError: "Traffic camera metadata is unavailable.",
          }));
        }
      } finally {
        if (!stopped && cameraController === controller) {
          cameraController = undefined;
          setState((current) => ({ ...current, camerasLoading: false }));
        }
      }
    }

    async function schedule() {
      clearTimeout(timer);
      const generation = ++scheduleGeneration;
      if (stopped || document.visibilityState !== "visible") return;
      const transportRead = readTransport();
      if (!camerasRequested) void readCameras();
      const expiresAt = await transportRead;
      if (
        stopped ||
        generation !== scheduleGeneration ||
        document.visibilityState !== "visible"
      )
        return;
      // A shared cache can return a snapshot with only milliseconds left.
      // Wait past its expiry, with a minimum delay for repeated expired responses.
      const alreadyExpired = expiresAt !== null && expiresAt <= Date.now();
      const delay =
        expiresAt === null
          ? POLL_MS
          : alreadyExpired
            ? expiredRetryMs
            : Math.max(
                MIN_POLL_MS,
                Math.min(POLL_MS, expiresAt - Date.now() + EXPIRY_MARGIN_MS),
              );
      expiredRetryMs = alreadyExpired
        ? Math.min(POLL_MS, expiredRetryMs * 2)
        : MIN_POLL_MS;
      timer = setTimeout(() => void schedule(), delay);
    }

    function visibilityChanged() {
      if (document.visibilityState === "visible") {
        void schedule();
      } else {
        clearTimeout(timer);
        transportController?.abort();
        cameraController?.abort();
        // Retry an interrupted metadata read when the document becomes visible.
        if (cameraController?.signal.aborted) camerasRequested = false;
      }
      updateClock((value) => value + 1);
    }

    document.addEventListener("visibilitychange", visibilityChanged);
    void schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      transportController?.abort();
      cameraController?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [area, enabled, revision]);

  const current = state.area === area && enabled ? state : emptyState(area);
  const now = Date.now();
  const stale =
    current.transport !== null &&
    Date.parse(current.transport.expiresAt) <= now;
  const camerasStale =
    current.cameras !== null && Date.parse(current.cameras.expiresAt) <= now;

  useEffect(() => {
    const expiries = [current.transport?.expiresAt, current.cameras?.expiresAt]
      .filter((value): value is string => Boolean(value))
      .map(Date.parse)
      .filter((value) => value > Date.now());
    if (!enabled || !expiries.length) return;
    const timer = setTimeout(
      () => updateClock((value) => value + 1),
      Math.min(
        Math.max(1, Math.min(...expiries) - Date.now() + 1),
        2_147_483_647,
      ),
    );
    return () => clearTimeout(timer);
  }, [current.transport, current.cameras, enabled, stale, camerasStale]);

  return {
    transport: current.transport,
    cameras: current.cameras,
    loading: enabled && current.loading,
    camerasLoading: enabled && current.camerasLoading,
    error: current.error,
    cameraError: current.cameraError,
    stale,
    camerasStale,
    refresh,
  };
}

function fetchedTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function TransportPanel({
  area,
  data,
}: {
  area: PilotId;
  data: ReturnType<typeof useLocalTransport>;
}) {
  const titleId = useId();
  const transport = data.transport?.pilotId === area ? data.transport : null;
  const cameras = data.cameras?.pilotId === area ? data.cameras : null;
  const expired =
    transport !== null &&
    (data.stale || Date.parse(transport.expiresAt) <= Date.now());
  const cameraExpired =
    cameras !== null &&
    (data.camerasStale || Date.parse(cameras.expiresAt) <= Date.now());
  const unavailable = transport?.status === "unavailable";

  return (
    <section
      className="transport-panel"
      aria-labelledby={titleId}
      aria-busy={data.loading}
    >
      <div className="transport-panel-header">
        <h2 id={titleId}>Transport status</h2>
        <button
          className="button secondary"
          type="button"
          onClick={data.refresh}
          disabled={data.loading || data.camerasLoading}
        >
          Refresh transport
        </button>
      </div>
      {data.loading && <p role="status">Refreshing transport status.</p>}
      {data.error && (
        <p className="transport-panel-warning" role="status">
          {data.error}
        </p>
      )}
      {expired && (
        <p className="transport-panel-warning" role="status">
          Transport snapshot expired. Current status is unknown.
        </p>
      )}
      {!data.loading && !data.error && (!transport || unavailable) && (
        <p className="transport-panel-warning" role="status">
          Transport status is unavailable.
        </p>
      )}
      {transport && (
        <>
          <p className="transport-panel-meta">
            Retrieved{" "}
            <time dateTime={transport.fetchedAt}>
              {fetchedTime(transport.fetchedAt)}
            </time>
          </p>
          {transport.status === "partial" && (
            <p className="transport-panel-warning">
              Some transport sources are unavailable.
            </p>
          )}
          {!unavailable && (
            <>
              {transport.lines.length === 0 && (
                <p>Line status is unavailable.</p>
              )}
              <ul className="transport-lines">
                {transport.lines.map((line) => (
                  <li className="transport-line" key={line.id}>
                    <div className="transport-line-heading">
                      <h3>{line.name}</h3>
                      <span className="transport-line-state">
                        {expired
                          ? "Expired report"
                          : line.status === "unknown"
                            ? "Status unknown"
                            : "Operator report"}
                      </span>
                    </div>
                    <p>{line.description}</p>
                    <p className="transport-panel-meta">Whole-line report</p>
                    <a
                      href={line.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`TfL source for ${line.name}`}
                    >
                      {line.sourceLabel}
                    </a>
                  </li>
                ))}
                {transport.stations.map((station) => (
                  <li className="transport-line" key={station.id}>
                    <div className="transport-line-heading">
                      <h3>{station.name}</h3>
                      <span className="transport-line-state">
                        {expired
                          ? "Expired report"
                          : station.retrievalStatus === "unavailable"
                            ? "Source unavailable"
                            : station.status === "reported_disruption"
                              ? "Reported disruption"
                              : "Availability unknown"}
                      </span>
                    </div>
                    <p>{station.description}</p>
                    <a
                      href={station.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`TfL source for ${station.name}`}
                    >
                      {station.sourceLabel}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {unavailable && (
            <a href={transport.sourceUrl} target="_blank" rel="noreferrer">
              {transport.sourceLabel}
            </a>
          )}
        </>
      )}
      <details>
        <summary>Traffic camera metadata</summary>
        {data.camerasLoading ? (
          <p role="status">Loading camera metadata.</p>
        ) : data.cameraError ? (
          <p>{data.cameraError}</p>
        ) : !cameras || cameras.status === "unavailable" ? (
          <p>Traffic camera metadata is unavailable.</p>
        ) : (
          <>
            {cameraExpired && (
              <p className="transport-panel-warning">
                Camera metadata expired.
              </p>
            )}
            <p>
              {cameras.cameras.length} camera references in the research circle.
            </p>
            {cameras.status === "partial" && (
              <p className="transport-panel-warning">
                Camera metadata coverage is partial. Additional records may be
                omitted.
              </p>
            )}
            <p className="transport-panel-meta">
              Retrieved{" "}
              <time dateTime={cameras.fetchedAt}>
                {fetchedTime(cameras.fetchedAt)}
              </time>
            </p>
            <p>
              These references do not include images or confirm camera
              operation.
            </p>
          </>
        )}
        {cameras && (
          <a
            href={cameras.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="TfL traffic camera metadata source"
          >
            {cameras.sourceLabel}
          </a>
        )}
      </details>
    </section>
  );
}
