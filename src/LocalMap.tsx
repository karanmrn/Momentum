import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Area, HelpCard } from "../packages/contracts/index.js";
import type {
  TrafficCameraSnapshot,
  TransportSnapshot,
} from "../packages/transport/index.js";
import "./local-map.css";

// Layer selection and shared point details adapt londonszn at 6d50b4b.
// This component uses Leaflet and the application's validated source records.
export interface LocalMapProps {
  area: Area;
  help: HelpCard[];
  transport?: TransportSnapshot;
  cameras?: TrafficCameraSnapshot;
}

export type LocalMapLayer = "help" | "transport" | "cameras";
export type LocalMapLayers = Record<LocalMapLayer, boolean>;
export interface LocalMapItem {
  id: string;
  layer: LocalMapLayer;
  name: string;
  coordinates: [number, number];
  markerLabel: string;
  description: string;
  availability: string;
  sourceLabel: string;
  sourceUrl: string | null;
  fetchedAt: string | null;
  dateLabel: "Checked" | "Retrieved";
  limitations: string[];
}

const layerLabels: Record<LocalMapLayer, string> = {
  help: "Help locations",
  transport: "Transport",
  cameras: "Traffic cameras",
};
const layerOrder: LocalMapLayer[] = ["help", "transport", "cameras"];
const defaultLayers: LocalMapLayers = {
  help: true,
  transport: true,
  cameras: false,
};

function sourceHref(value: string): string | null {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function validPoint(
  point: [number, number] | undefined,
): point is [number, number] {
  return Boolean(
    point &&
    point.length === 2 &&
    Number.isFinite(point[0]) &&
    Math.abs(point[0]) <= 90 &&
    Number.isFinite(point[1]) &&
    Math.abs(point[1]) <= 180,
  );
}

function expired(expiresAt: string, now: number): boolean {
  return (
    !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now
  );
}

/** Build the one record set used by both the list and map markers. */
export function buildLocalMapItems(
  { area, help, transport, cameras }: LocalMapProps,
  layers: LocalMapLayers,
  now = Date.now(),
): LocalMapItem[] {
  const items: LocalMapItem[] = [];
  if (layers.help) {
    for (const item of help) {
      if (item.pilotId !== area.id || !validPoint(item.coordinates)) continue;
      items.push({
        id: `help:${item.id}`,
        layer: "help",
        name: item.name,
        coordinates: item.coordinates,
        markerLabel: `${item.name}, council-listed help location`,
        description: [item.address, item.summary, item.schedule]
          .filter(Boolean)
          .join(". "),
        availability: "Availability unconfirmed.",
        sourceLabel: item.sourceLabel || "Council directory",
        sourceUrl: sourceHref(item.url),
        fetchedAt: item.checkedAt ?? null,
        dateLabel: "Checked",
        limitations: [],
      });
    }
  }
  if (layers.transport && transport?.pilotId === area.id) {
    const outOfDate = expired(transport.expiresAt, now);
    for (const station of transport.stations) {
      if (station.pilotId !== area.id || !validPoint(station.coordinates))
        continue;
      const statusUnavailable =
        outOfDate ||
        transport.status === "unavailable" ||
        station.retrievalStatus === "unavailable";
      items.push({
        id: `transport:${station.id}`,
        layer: "transport",
        name: station.name,
        coordinates: station.coordinates,
        markerLabel: `${station.name}, station reference point`,
        description: statusUnavailable
          ? `${outOfDate ? "Transport update expired. " : ""}Service status unknown.`
          : station.description,
        availability: "Station availability unknown.",
        sourceLabel: station.sourceLabel,
        sourceUrl: sourceHref(station.sourceUrl),
        fetchedAt: station.fetchedAt,
        dateLabel: "Retrieved",
        limitations: [
          "Station reference point, not a vehicle position.",
          ...transport.limitations,
        ],
      });
    }
  }
  if (layers.cameras && cameras?.pilotId === area.id) {
    const outOfDate = expired(cameras.expiresAt, now);
    for (const camera of cameras.cameras) {
      if (camera.pilotId !== area.id || !validPoint(camera.coordinates))
        continue;
      items.push({
        id: `cameras:${camera.id}`,
        layer: "cameras",
        name: camera.name,
        coordinates: camera.coordinates,
        markerLabel: `${camera.name}, traffic camera metadata`,
        description: `${outOfDate ? "Camera metadata expired. " : ""}Traffic camera reference point. Images are not loaded.`,
        availability: "Camera availability unknown.",
        sourceLabel: camera.sourceLabel,
        sourceUrl: sourceHref(camera.sourceUrl),
        fetchedAt: camera.fetchedAt,
        dateLabel: "Retrieved",
        limitations: cameras.limitations,
      });
    }
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function LocalMap(props: LocalMapProps) {
  // A new area must never inherit a prior area's selection or map markers.
  return <LocalMapBrowser key={props.area.id} {...props} />;
}

function LocalMapBrowser(props: LocalMapProps) {
  const { area } = props;
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const detail = useRef<HTMLElement>(null);
  const listButtons = useRef(new Map<string, HTMLButtonElement>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [layers, setLayers] = useState<LocalMapLayers>(defaultLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(Date.now);
  const now = Math.max(clockTick, Date.now());
  const items = useMemo(
    () => buildLocalMapItems(props, layers, now),
    [props.area, props.help, props.transport, props.cameras, layers, now],
  );
  const selected = items.find((item) => item.id === selectedId);
  const selectRef = useRef<(id: string) => void>(() => {});
  selectRef.current = (id) => {
    setSelectedId(id);
    if (id === selectedId) detail.current?.focus();
  };

  useEffect(() => {
    const current = Date.now();
    const deadlines = [props.transport, props.cameras]
      .filter((snapshot) => snapshot?.pilotId === area.id)
      .map((snapshot) => Date.parse(snapshot!.expiresAt))
      .filter((deadline) => Number.isFinite(deadline) && deadline > current);
    const refreshClock = () => setClockTick(Date.now());
    const timer = deadlines.length
      ? window.setTimeout(
          refreshClock,
          Math.min(Math.min(...deadlines) - current + 1, 2_147_483_647),
        )
      : undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshClock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    area.id,
    props.transport?.expiresAt,
    props.cameras?.expiresAt,
    clockTick,
  ]);

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  useEffect(() => {
    if (selectedId) detail.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    setReady(false);
    setFailed(false);
    void import("leaflet")
      .then((L) => {
        if (disposed || !element.current) return;
        leafletRef.current = L;
        map = L.map(element.current, { zoomControl: false }).setView(
          area.center,
          14,
        );
        mapRef.current = map;
        L.control.zoom({ position: "bottomright" }).addTo(map);
        const tiles = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        ).addTo(map);
        tiles.on("tileerror", () => {
          if (!disposed) setFailed(true);
        });
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(() =>
            map?.invalidateSize({ animate: false }),
          );
          observer.observe(element.current);
        }
        requestAnimationFrame(() => {
          if (!disposed) map?.invalidateSize({ animate: false });
        });
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      markers.current.clear();
      mapRef.current = null;
      map?.remove();
    };
  }, [area.id, area.center, retry]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    const group = L.layerGroup().addTo(map);
    markers.current.clear();
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `local-map-marker local-map-marker-${item.layer}`;
      button.setAttribute("aria-label", item.markerLabel);
      button.setAttribute("aria-pressed", String(selectedId === item.id));
      button.title = item.markerLabel;
      const dot = document.createElement("span");
      dot.className =
        item.layer === "help" ? "help-anchor" : `local-map-dot-${item.layer}`;
      dot.setAttribute("aria-hidden", "true");
      button.append(dot);
      const marker = L.marker(item.coordinates, {
        keyboard: false,
        icon: L.divIcon({
          className: "local-map-marker-container",
          html: button,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        }),
      }).addTo(group);
      L.DomEvent.disableClickPropagation(button);
      button.addEventListener("click", () => selectRef.current(item.id));
      markers.current.set(item.id, marker);
    }
    return () => {
      group.remove();
      markers.current.clear();
    };
  }, [items, ready, retry]);

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker
        .getElement()
        ?.querySelector("button")
        ?.setAttribute("aria-pressed", String(id === selectedId));
    }
    if (selected && !failed) {
      mapRef.current?.panTo(selected.coordinates, { animate: false });
    }
  }, [selectedId, selected, items, failed]);

  const closeDetail = () => {
    const previous = selectedId;
    setSelectedId(null);
    if (previous) listButtons.current.get(previous)?.focus();
  };
  const transport =
    props.transport?.pilotId === area.id ? props.transport : undefined;
  const cameras =
    props.cameras?.pilotId === area.id ? props.cameras : undefined;
  return (
    <section
      className="local-map-browser"
      aria-label={`${area.shortName} map and locations`}
    >
      <fieldset className="local-map-layers">
        <legend>Map layers</legend>
        <div>
          {layerOrder.map((layer) => (
            <button
              key={layer}
              type="button"
              aria-pressed={layers[layer]}
              onClick={() =>
                setLayers((current) => ({
                  ...current,
                  [layer]: !current[layer],
                }))
              }
            >
              <span
                className={`local-map-key local-map-key-${layer}`}
                aria-hidden="true"
              />
              {layerLabels[layer]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="map-shell">
        <div
          className="local-map-canvas"
          ref={element}
          hidden={failed}
          aria-label={`Map centred on the approximate ${area.name} pilot-area anchor`}
        />
        {failed && (
          <div className="local-map-fallback" role="status">
            <strong>Map tiles are unavailable</strong>
            <p>The location list remains available.</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry map
            </button>
          </div>
        )}
      </div>
      <p className="local-map-caption">
        Approximate map points. Availability is unconfirmed.
      </p>
      {layers.transport &&
        (!transport ||
          transport.status !== "available" ||
          expired(transport.expiresAt, now)) && (
          <p className="local-map-status" role="status">
            {!transport
              ? "Transport data has not loaded."
              : expired(transport.expiresAt, now)
                ? "Transport updates expired. Station reference points remain available."
                : transport.status === "unavailable"
                  ? "Transport updates unavailable. Station reference points remain available."
                  : "Some transport updates are unavailable."}
          </p>
        )}
      {layers.cameras && (
        <p className="local-map-status" role="status">
          {!cameras
            ? "Traffic camera metadata has not loaded."
            : expired(cameras.expiresAt, now)
              ? "Traffic camera metadata expired. Availability is unknown."
              : cameras.status === "unavailable"
                ? "Traffic camera metadata is unavailable."
                : cameras.cameras.length === 0
                  ? "No traffic camera metadata returned for this area."
                  : "Traffic camera metadata only. Images are not loaded."}
        </p>
      )}
      {selected && (
        <section
          className="local-map-detail"
          ref={detail}
          tabIndex={-1}
          aria-label={`${selected.name} details`}
        >
          <div className="local-map-detail-heading">
            <h3>{selected.name}</h3>
            <button
              type="button"
              onClick={closeDetail}
              aria-label="Close location details"
            >
              Close
            </button>
          </div>
          <p>{selected.description}</p>
          <p>
            <strong>{selected.availability}</strong>
          </p>
          <p>{selected.sourceLabel}</p>
          {selected.fetchedAt && (
            <p>
              {selected.dateLabel}{" "}
              {new Date(selected.fetchedAt).toLocaleString("en-GB")}
            </p>
          )}
          {selected.limitations.length > 0 && (
            <ul>
              {selected.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          )}
          {selected.sourceUrl && (
            <a
              href={selected.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source
            </a>
          )}
        </section>
      )}
      <div className="local-map-list-heading">
        <h3>Locations</h3>
        <span aria-live="polite">{items.length} shown</span>
      </div>
      {items.length === 0 ? (
        <p className="local-map-empty">
          No locations match the selected layers. This does not confirm that
          conditions are clear.
        </p>
      ) : (
        <ul className="local-map-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selectedId === item.id}
                ref={(node) => {
                  if (node) listButtons.current.set(item.id, node);
                  else listButtons.current.delete(item.id);
                }}
                onClick={() => selectRef.current(item.id)}
              >
                <span
                  className={`local-map-key local-map-key-${item.layer}`}
                  aria-hidden="true"
                />
                <span>
                  <strong>{item.name}</strong>
                  <span className="local-map-row-kind">
                    {layerLabels[item.layer]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
