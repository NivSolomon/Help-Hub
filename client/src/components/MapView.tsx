// src/components/MapView.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  Circle,
  Pane,
} from "react-leaflet";
import type { Marker as LeafletMarker } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useSupercluster from "use-supercluster";

import type { HelpRequest } from "../lib/types";
import { haversineKm } from "../lib/geo";

import { auth } from "../lib/firebase";
import { fetchUserProfile } from "../lib/users";

/* ------------------------------------------------------------------------- */
/* Types                                                                      */
/* ------------------------------------------------------------------------- */

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type Props = {
  center: { lat: number; lng: number };
  requests: HelpRequest[];
  className?: string;
  userLoc?: { lat: number; lng: number };
  selectedId?: string;
  selectedTick?: number;
  onOpenChat?: (req: HelpRequest) => void;
  onAccept?: (req: HelpRequest) => void;
  onLocated?: (loc: { lat: number; lng: number }) => void;
  onBoundsChange?: (b: MapBounds) => void;
  radiusKm?: number;
  onMarkDone?: (req: HelpRequest) => void;
  onOpenProfile?: (uid: string) => void;
  onNavigate?: (req: HelpRequest) => void;
  onDelete?: (req: HelpRequest) => void;
  isAdmin?: boolean;
};

/* ------------------------------------------------------------------------- */
/* User mini hook                                                             */
/* ------------------------------------------------------------------------- */

function useUserMini(uid?: string | null) {
  const [name, setName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!uid) {
      setName(null);
      return;
    }

    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      if (stop) return;
      try {
        const data = await fetchUserProfile(uid);
        if (!stop) {
          setName(
            data.displayName ??
              data.firstName ??
              data.lastName ??
              "Unknown user"
          );
        }
      } catch (error) {
        console.error("[MapView] failed to fetch user mini", error);
        if (!stop) setName("Unknown user");
      } finally {
        if (!stop) {
          timer = setTimeout(load, 15000);
        }
      }
    };

    void load();

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [uid]);

  return name;
}

/* ------------------------------------------------------------------------- */
/* Address format                                                             */
/* ------------------------------------------------------------------------- */

type AnyAddress =
  | string
  | {
      city?: string | null;
      street?: string | null;
      house?: string | number | null;
    }
  | null
  | undefined;

function formatAddress(addr: AnyAddress): string | null {
  if (!addr) return null;
  if (typeof addr === "string") {
    const s = addr.trim?.() ?? "";
    return s.length ? s : null;
  }
  const city = addr.city ? String(addr.city).trim() : "";
  const street = addr.street ? String(addr.street).trim() : "";
  const house = addr.house != null ? String(addr.house).trim() : "";
  const parts: string[] = [];
  if (city) parts.push(city);
  if (street) parts.push(house ? `${street} ${house}` : street);
  return parts.length ? parts.join(", ") : null;
}

/* ------------------------------------------------------------------------- */
/* Icons                                                                      */
/* ------------------------------------------------------------------------- */

const userDotIcon = L.divIcon({
  className: "user-dot-wrap",
  html: `<span class="user-dot"></span><span class="user-dot-pulse"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function statusIcon(status: HelpRequest["status"]) {
  const color =
    status === "open" ? "#16a34a" : status === "done" ? "#6b7280" : "#f59e0b";
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
      <path d="M16 0C8.28 0 2 6.28 2 14c0 9.66 12.04 22.83 13.01 23.86a1.4 1.4 0 0 0 1.98 0C17.96 36.83 30 23.66 30 14 30 6.28 23.72 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="14" r="6" fill="white"/>
    </svg>`);
  return new L.Icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${svg}`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -30],
    tooltipAnchor: [12, -16],
  });
}

function clusterIcon(count: number) {
  const size = count < 10 ? 30 : count < 50 ? 36 : 44;
  const color = count < 10 ? "#2563eb" : count < 50 ? "#7c3aed" : "#dc2626";
  const html = `
    <div style="
      background:${color};
      color:#fff;
      width:${size}px;
      height:${size}px;
      border-radius:9999px;
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow:0 0 0 3px rgba(255,255,255,0.8);
      font-weight:600;">
      ${count}
    </div>`;
  return L.divIcon({
    html,
    className: "cluster-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function ZoomButtons({ position = "topright" }: { position?: L.ControlPosition }) {
  const map = useMap();

  useEffect(() => {
    const ctrl = L.control({ position });

    ctrl.onAdd = () => {
      const container = L.DomUtil.create("div", "map-zoom-btns");
      const zoomIn = L.DomUtil.create("button", "map-zoom-btn", container);
      zoomIn.setAttribute("aria-label", "Zoom in");
      zoomIn.textContent = "+";
      const zoomOut = L.DomUtil.create("button", "map-zoom-btn", container);
      zoomOut.setAttribute("aria-label", "Zoom out");
      zoomOut.textContent = "−";

      const stopPropagation = (el: HTMLElement) => {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      };
      stopPropagation(container);

      L.DomEvent.on(zoomIn, "click", () => map.zoomIn());
      L.DomEvent.on(zoomOut, "click", () => map.zoomOut());

      return container;
    };

    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map, position]);

  return null;
}

/* ------------------------------------------------------------------------- */
/* Map controls / location button                                            */
/* ------------------------------------------------------------------------- */

function LocateControl({
  userLoc,
  onLocate,
  position = "topleft",
}: {
  userLoc?: { lat: number; lng: number };
  onLocate: (loc: { lat: number; lng: number }) => void;
  position?: L.ControlPosition;
}) {
  const map = useMap();

  useEffect(() => {
    const ctrl = L.control({ position });

    ctrl.onAdd = () => {
      // outer wrapper Leaflet expects
      const container = L.DomUtil.create("div", "leaflet-control-locate");

      // actual clickable button
      const btn = L.DomUtil.create("button", "locate-btn-el", container);

      // use aria-label instead of title so we don't spawn a browser tooltip
      btn.setAttribute("aria-label", "My location");
      btn.innerHTML = `
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 2v3"></path>
          <path d="M12 19v3"></path>
          <path d="M2 12h3"></path>
          <path d="M19 12h3"></path>
          <circle cx="12" cy="12" r="9"></circle>
        </svg>
      `;

      // stop map drag when clicking
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, "click", async () => {
        if (userLoc) {
          panToWithOffset(map, userLoc.lat, userLoc.lng, 0.25);
          onLocate(userLoc);
          return;
        }
        if ("geolocation" in navigator) {
          try {
            const pos = await new Promise<GeolocationPosition>(
              (resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 10000,
                  maximumAge: 0,
                })
            );
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            panToWithOffset(map, loc.lat, loc.lng, 0.25);
            onLocate(loc);
          } catch {
            /* ignore */
          }
        }
      });

      return container;
    };

    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map, position, userLoc, onLocate]);

  return null;
}

/* ------------------------------------------------------------------------- */
/* Radius overlay                                                             */
/* ------------------------------------------------------------------------- */

function RadiusOverlay({
  userLoc,
  radiusKm,
}: {
  userLoc?: { lat: number; lng: number };
  radiusKm: number;
}) {
  const map = useMap();
  const circleRef = useRef<L.Circle | null>(null);

  // auto-zoom to fit circle
  useEffect(() => {
    if (!userLoc || !radiusKm || radiusKm <= 0) return;
    const c = circleRef.current;
    if (!c) return;
    try {
      const b = c.getBounds();
      map.fitBounds(b, { padding: [36, 36] });
    } catch {
      /* ignore */
    }
  }, [radiusKm, userLoc, map]);

  if (!userLoc || !radiusKm || radiusKm <= 0) return null;

  return (
    <Pane name="radius-overlay" style={{ zIndex: 200 }}>
      <Circle
        ref={circleRef as any}
        center={[userLoc.lat, userLoc.lng]}
        radius={radiusKm * 1000}
        pathOptions={{ color: "#ef4444", weight: 2, fillOpacity: 0.08 }}
      />
    </Pane>
  );
}

/* ------------------------------------------------------------------------- */
/* Utility: panToWithOffset                                                   */
/* ------------------------------------------------------------------------- */
/*
  We don't want the marker dead-center because the popup sits above it.
  We'll pan so the marker sits ~offsetFromTop (0 = top, 1 = bottom).
  Ex: 0.6 means place marker a bit lower, so popup fits.
*/
function panToWithOffset(
  map: L.Map,
  lat: number,
  lng: number,
  offsetFromTop = 0.6,
  zoom?: number
) {
  const mapSize = map.getSize(); // pixels
  const targetPoint = map.project([lat, lng], zoom ?? map.getZoom());

  // y shift: move marker down so popup space is above it.
  const desiredY = mapSize.y * offsetFromTop;
  const deltaY = desiredY - mapSize.y / 2;

  const shiftedPoint = L.point(targetPoint.x, targetPoint.y + deltaY);
  const shiftedLatLng = map.unproject(shiftedPoint, zoom ?? map.getZoom());

  if (zoom != null) {
    map.setView(shiftedLatLng, zoom, { animate: true });
  } else {
    map.panTo(shiftedLatLng, { animate: true });
  }
}

/* ------------------------------------------------------------------------- */
/* RequestMarker                                                              */
/* ------------------------------------------------------------------------- */

function RequestMarker({
  req,
  myId,
  userLoc,
  onAccept,
  onOpenChat,
  onOpenProfile,
  onMarkDone,
  onNavigate,
  onDelete,
  setRef,
  isAdmin,
}: {
  req: HelpRequest;
  myId: string | null;
  userLoc?: { lat: number; lng: number };
  onAccept?: (req: HelpRequest) => void;
  onOpenChat?: (req: HelpRequest) => void;
  onOpenProfile?: (uid: string) => void;
  onMarkDone?: (req: HelpRequest) => void;
  onNavigate?: (req: HelpRequest) => void;
  onDelete?: (req: HelpRequest) => void;
  setRef?: (m: LeafletMarker | null) => void;
  isAdmin?: boolean;
}) {
  const requesterName = useUserMini(req.requesterId);

  const locationLabel =
    formatAddress((req as any).address) ?? "Address not provided";

  const distance =
    userLoc && req.location
      ? haversineKm(userLoc, req.location).toFixed(1)
      : null;

  const iAmParticipant =
    myId != null && (req.requesterId === myId || req.helperId === myId);
  const iAmRequester = myId != null && req.requesterId === myId;
  const canDelete =
    Boolean(isAdmin) || (iAmRequester && req.status === "open" && !req.helperId);

  return (
    <Marker
      ref={setRef as any}
      position={[req.location!.lat, req.location!.lng]}
      icon={statusIcon(req.status)}
    >
      <Tooltip>{req.title}</Tooltip>

      <Popup keepInView={false}>
        <div className="popup-card popup-animate">
          {/* header row */}
          <div className="popup-head">
            <div className="popup-title flex items-start gap-1">
              <span role="img" aria-hidden className="text-[14px]">
                📦
              </span>
              <span className="leading-snug break-words">{req.title}</span>
            </div>

            <span
              className={`popup-pill ${
                req.status === "open"
                  ? "pill-open"
                  : req.status === "done"
                  ? "pill-done"
                  : "pill-active"
              }`}
            >
              {req.status.replace("_", " ")}
            </span>
          </div>

          {/* mini requester card */}
          <button
            className="requester-chip text-left"
            onClick={() => onOpenProfile?.(req.requesterId)}
          >
            <div className="avatar-circle">👤</div>
            <div className="flex min-w-0 flex-col">
              <div className="truncate text-[13px] font-medium text-gray-900">
                {requesterName ?? "Unknown user"}
              </div>
              <div className="truncate text-[11px] text-gray-500">
                Requester
              </div>
            </div>
          </button>

          {/* location + distance */}
          <div className="byline">
            <div className="byline-row">
              <span className="chip-emoji">📍</span>
              <span className="byline-text">{locationLabel}</span>
            </div>

            {distance && (
              <div className="byline-row">
                <span className="chip-emoji">📏</span>
                <span className="byline-text">~{distance} km away</span>
              </div>
            )}
          </div>

          {/* description */}
          {req.description && (
            <div className="popup-desc break-words">{req.description}</div>
          )}

          {/* category / reward */}
          <div className="popup-meta">
            <span className="meta-chip" title="Category">
              <span className="chip-emoji">🏷️</span>
              <span className="truncate">{req.category}</span>
            </span>

            {((typeof req.reward === "number" && !Number.isNaN(req.reward)) ||
              (typeof req.reward === "string" && req.reward.trim() !== "")) && (
              <span className="meta-chip" title="Reward / thanks">
                <span className="chip-emoji">💰</span>
                <span className="truncate">{req.reward}</span>
              </span>
            )}
          </div>

          {/* actions */}
          <div className="popup-actions">
            {canDelete && (
              <button
                onClick={() => onDelete?.(req)}
                className="btn"
                style={{ borderColor: '#fecdd3', color: '#b91c1c' }}
              >
                🗑️ Delete
              </button>
            )}
            {req.status === "open" && myId && myId !== req.requesterId && (
              <button
                onClick={() => onAccept?.(req)}
                className="btn btn-primary"
              >
                I can help
              </button>
            )}

            {(req.status === "accepted" || req.status === "in_progress") &&
              iAmParticipant && (
                <button
                  onClick={() => onOpenChat?.(req)}
                  className="btn btn-ghost"
                >
                  💬 Chat
                </button>
              )}

            {(req.status === "accepted" || req.status === "in_progress") &&
              (Boolean(isAdmin) || myId === req.requesterId) && (
                <button
                  onClick={() => onMarkDone?.(req)}
                  className="btn btn-outline"
                >
                  ✅ Mark done
                </button>
              )}

            {req.location && (
              <button
                onClick={() => onNavigate?.(req)}
                className="btn btn-ghost"
              >
                🧭 Navigate
              </button>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

/* ------------------------------------------------------------------------- */
/* FocusManager: strong zoom + reliable popup open                            */
/* ------------------------------------------------------------------------- */

function FocusManager({
  selectedId,
  selectedTick,
  coordsByIdRef,
  markerRefs,
}: {
  selectedId?: string;
  selectedTick?: number;
  coordsByIdRef: React.MutableRefObject<
    Record<string, { lat: number; lng: number }>
  >;
  markerRefs: React.MutableRefObject<Record<string, LeafletMarker | null>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;

    const loc = coordsByIdRef.current[selectedId];
    if (!loc) return;

    const targetZoom = Math.max(map.getZoom(), 18); // ensure strong zoom-in

    // compute offset at targetZoom and set view there
    const mapSize = map.getSize();
    const currentPoint = map.project([loc.lat, loc.lng], targetZoom);
    const offsetFromTop = 0.6;
    const desiredY = mapSize.y * offsetFromTop;
    const deltaY = desiredY - mapSize.y / 2;
    const shiftedPoint = L.point(currentPoint.x, currentPoint.y + deltaY);
    const shiftedLatLng = map.unproject(shiftedPoint, targetZoom);

    map.setView(shiftedLatLng, targetZoom, { animate: true });

    // open the popup after the animation settles
    const t = window.setTimeout(() => {
      const marker = markerRefs.current[selectedId];
      if (marker) marker.openPopup();
    }, 300);

    return () => window.clearTimeout(t);
  }, [selectedId, selectedTick, map, coordsByIdRef, markerRefs]);

  return null;
}

/* ------------------------------------------------------------------------- */
/* BoundsTracker: tell parent when bounds change                             */
/* ------------------------------------------------------------------------- */

function BoundsTracker({
  onBoundsChange,
  setBoundsState,
  setZoomState,
}: {
  onBoundsChange?: (b: MapBounds) => void;
  setBoundsState: React.Dispatch<
    React.SetStateAction<[number, number, number, number] | undefined>
  >;
  setZoomState: React.Dispatch<React.SetStateAction<number>>;
}) {
  const map = useMap();
  const rafRef = useRef<number | null>(null);

  useMapEvents({
    moveend: () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const b = map.getBounds();
        setBoundsState([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        setZoomState(map.getZoom());
        onBoundsChange?.({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        });
      });
    },
  });

  return null;
}

/* ------------------------------------------------------------------------- */
/* Main MapView                                                               */
/* ------------------------------------------------------------------------- */

export default function MapView({
  center,
  requests,
  className,
  userLoc,
  selectedId,
  selectedTick,
  onOpenChat,
  onAccept,
  onLocated,
  onBoundsChange,
  radiusKm = 0,
  onMarkDone,
  onOpenProfile,
  onNavigate,
  onDelete,
  isAdmin = false,
}: Props) {
  const myId = auth.currentUser?.uid ?? null;

  // Safety visibility filter (matches Home logic)
  const visibleRequests = useMemo(() => {
    return requests.filter((r) => {
      if (r.status === "open") return true;
      if (r.status === "done") return false;
      if (r.status === "in_progress" || r.status === "accepted") {
        if (!myId) return false;
        return r.requesterId === myId || r.helperId === myId;
      }
      return false;
    });
  }, [requests, myId]);

  // refs for programmatic focus/open
  const coordsByIdRef = useRef<Record<string, { lat: number; lng: number }>>(
    {}
  );
  useEffect(() => {
    const map: Record<string, { lat: number; lng: number }> = {};
    for (const r of visibleRequests) {
      if (r.location) map[r.id] = r.location;
    }
    coordsByIdRef.current = map;
  }, [visibleRequests]);

  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});
  const makeMarkerRef = (id: string) => (m: LeafletMarker | null) => {
    markerRefs.current[id] = m;
  };

  // clustering input
  const [bounds, setBounds] = useState<[number, number, number, number]>();
  const [zoom, setZoom] = useState(13);

  const points = useMemo(
    () =>
      visibleRequests
        .filter((r) => r.location)
        .map((r) => ({
          type: "Feature" as const,
          properties: { cluster: false, requestId: r.id },
          geometry: {
            type: "Point" as const,
            coordinates: [r.location!.lng, r.location!.lat],
          },
        })),
    [visibleRequests]
  );

  const { clusters } = useSupercluster({
    points,
    bounds,
    zoom,
    options: { radius: 55, maxZoom: 19 },
  });

  const counts = useMemo(() => {
    let open = 0;
    let active = 0;
    for (const r of visibleRequests) {
      if (r.status === "open") open += 1;
      if (r.status === "accepted" || r.status === "in_progress") active += 1;
    }
    return {
      open,
      active,
      total: visibleRequests.length,
    };
  }, [visibleRequests]);

  const wrapperClass = [
    "map-shell relative w-full overflow-hidden rounded-[32px] border border-white/50 bg-white/90 shadow-xl backdrop-blur",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />
        <span className="absolute right-[-18%] top-24 h-80 w-80 rounded-full bg-emerald-200/35 blur-3xl" />
        <span className="absolute bottom-[-20%] left-[30%] h-72 w-72 rounded-full bg-purple-200/30 blur-3xl" />
      </div>

      <div className="relative h-[420px]">
        <MapContainer
          center={center}
          zoom={13}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
          className="rounded-[32px]"
        >
          <TileLayer
            attribution="© OpenStreetMap contributors, © CARTO"
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {/* react to bounds changes, sync for clustering, send up to parent */}
          <BoundsTracker
            onBoundsChange={onBoundsChange}
            setBoundsState={setBounds}
            setZoomState={setZoom}
          />

          {/* user radius overlay */}
          <RadiusOverlay userLoc={userLoc} radiusKm={radiusKm} />

          {/* manage focus from list click: pan & open popup */}
          <FocusManager
            selectedId={selectedId}
            selectedTick={selectedTick}
            coordsByIdRef={coordsByIdRef}
            markerRefs={markerRefs}
          />

          {/* map controls */}
          <ZoomButtons position="topright" />
          <LocateControl
            userLoc={userLoc}
            onLocate={(loc) => onLocated?.(loc)}
            position="topright"
          />
          {userLoc && (
            <Marker position={[userLoc.lat, userLoc.lng]} icon={userDotIcon} />
          )}

          {/* render clusters & markers */}
          {clusters.map((c: any) => {
            const [lng, lat] = c.geometry.coordinates;

            if (c.properties.cluster) {
              return (
                <Marker
                  key={`cluster-${c.id}`}
                  position={[lat, lng]}
                  icon={clusterIcon(c.properties.point_count)}
                />
              );
            }

            const req = visibleRequests.find(
              (r) => r.id === c.properties.requestId
            );
            if (!req?.location) return null;

            return (
              <RequestMarker
                key={req.id}
                req={req}
                myId={myId}
                userLoc={userLoc}
                onAccept={onAccept}
                onOpenChat={onOpenChat}
                onOpenProfile={onOpenProfile}
                onMarkDone={onMarkDone}
                onNavigate={onNavigate}
                onDelete={onDelete}
                isAdmin={isAdmin}
                setRef={makeMarkerRef(req.id)}
              />
            );
          })}
        </MapContainer>

        <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="pointer-events-auto inline-flex items-center gap-3 rounded-3xl border border-white/50 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">📡</span>
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-indigo-500">Live map</span>
              <span className="text-sm text-gray-600">
                Showing {counts.total} request{counts.total === 1 ? "" : "s"} in view
              </span>
            </div>
          </div>
          <div className="pointer-events-auto flex gap-2 text-xs text-gray-600">
            <div className="map-pill">
              <span className="map-dot bg-emerald-500" /> {counts.open} open
            </div>
            <div className="map-pill">
              <span className="map-dot bg-amber-500" /> {counts.active} active
            </div>
            {radiusKm > 0 && (
              <div className="map-pill">
                <span className="map-dot bg-sky-500" /> Radius {radiusKm.toFixed(1)} km
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
  .map-shell .leaflet-container {
    font-family: 'Inter', system-ui, -apple-system, Segoe UI, sans-serif;
  }

  /* custom locate control */
  .leaflet-control-locate {
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.18);
    border-radius: 9999px;
    background: transparent;
    margin-top: 72px;
    margin-right: 12px;
  }

  .locate-btn-el {
    display:flex;
    align-items:center;
    justify-content:center;
    width:36px;
    height:36px;
    border-radius:9999px;
    background:#ffffff;
    border:1px solid rgba(148, 163, 184, 0.45);
    cursor:pointer;
    line-height:1;
    padding:0;

    color:#1f2937;
    box-shadow:0 6px 18px rgba(15, 23, 42, 0.16);
    transition:background .12s, box-shadow .12s, border-color .12s;
  }

  .locate-btn-el:hover {
    background:#f4f6ff;
    border-color:#818cf8;
    box-shadow:0 7px 20px rgba(99, 102, 241, 0.22);
  }

  .map-zoom-btns {
    display:flex;
    flex-direction:column;
    gap:6px;
    background:transparent;
    margin-top:12px;
    margin-right:12px;
  }

  .map-zoom-btn {
    width:36px;
    height:36px;
    border-radius:9999px;
    border:1px solid rgba(148, 163, 184, 0.45);
    background:white;
    font-size:18px;
    font-weight:600;
    color:#1f2937;
    box-shadow:0 6px 18px rgba(15, 23, 42, 0.14);
    cursor:pointer;
    transition:all .15s ease;
  }

  .map-zoom-btn:hover {
    background:#f4f6ff;
    border-color:#818cf8;
    color:#4338ca;
  }

  /* user location pulse marker */
  .user-dot-wrap { position: relative; }
  .user-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background:#2563eb;
    display:inline-block;
    box-shadow:0 0 0 2px #fff;
  }
  .user-dot-pulse {
    position:absolute;
    left:50%; top:50%;
    width:14px; height:14px;
    transform:translate(-50%,-50%);
    border:2px solid #3b82f6;
    border-radius:50%;
    animation:pulse 1.5s infinite;
  }
  @keyframes pulse {
    0%   {opacity:.7; transform:translate(-50%,-50%) scale(1);}
    70%  {opacity:0;  transform:translate(-50%,-50%) scale(2);}
    100% {opacity:0;}
  }

  /* popup animation */
  @keyframes popupFadeUp {
    0% { opacity:0; transform:translateY(4px) scale(0.98); }
    100% { opacity:1; transform:translateY(0) scale(1); }
  }

  .popup-card {
    min-width: 260px;
    max-width: 320px;
    font-family: system-ui, ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    background:white;
  }
  .popup-animate { animation: popupFadeUp .18s ease-out both; }

  .popup-head { display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem; }
  .popup-title { font-weight:700; font-size:14px; line-height:1.2; color:#111827; word-break:break-word; }
  .popup-pill { font-size:11px; padding:2px 8px; border-radius:9999px; border:1px solid transparent; line-height:1.2; font-weight:500; }
  .pill-open { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
  .pill-active { background:#fffbeb; color:#92400e; border-color:#fed7aa; }
  .pill-done { background:#f3f4f6; color:#374151; border-color:#e5e7eb; }

  .requester-chip {
    margin-top:.75rem;
    display:flex; align-items:center; gap:.5rem;
    border:1px solid #e5e7eb;
    background:linear-gradient(to right,#f9fafb,#fff);
    border-radius:12px; padding:.5rem .75rem; cursor:pointer;
    box-shadow:0 1px 2px rgba(0,0,0,.04); transition: background .12s; width:100%;
  }
  .requester-chip:hover { background:linear-gradient(to right,#eef2ff,#fff); }
  .avatar-circle {
    flex-shrink:0; width:32px; height:32px; border-radius:9999px;
    background:#e0e7ff; display:flex; align-items:center; justify-content:center; font-size:14px; line-height:1;
  }

  .byline { margin-top:.75rem; display:grid; gap:.4rem; }
  .byline-row { display:flex; align-items:center; gap:.4rem; font-size:12px; color:#4b5563; }
  .chip-emoji { font-size:13px; line-height:1; flex:0 0 auto; }
  .byline-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .popup-desc { margin-top:.75rem; font-size:13px; color:#374151; line-height:1.4; word-break: break-word; }

  .popup-meta { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.75rem; }
  .meta-chip {
    display:inline-flex; min-width:0; max-width:100%; align-items:center; gap:.35rem;
    font-size:11px; padding:4px 8px; border-radius:9999px;
    background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; line-height:1.2;
  }

  .popup-actions { margin-top:1rem; display:flex; flex-wrap:wrap; gap:.5rem; }
  .btn {
    border-radius:8px; font-size:12px; padding:6px 10px; border:1px solid #e5e7eb; background:white;
    display:inline-flex; align-items:center; gap:.4rem; line-height:1.2; font-weight:500; color:#1f2937;
  }
  .btn:hover { background:#f9fafb; }
  .btn-primary { background:#111827; color:white; border-color:#111827; }
  .btn-primary:hover { opacity:.9; }
  .btn-outline { background:white; }
  .btn-ghost { background:white; }

  .map-pill {
    display:inline-flex;
    align-items:center;
    gap:0.4rem;
    border-radius:9999px;
    padding:6px 12px;
    background:rgba(255,255,255,0.92);
    border:1px solid rgba(148, 163, 184, 0.35);
    box-shadow:0 6px 18px rgba(15, 23, 42, 0.16);
  }

  .map-dot {
    width:10px;
    height:10px;
    border-radius:9999px;
  }
`}</style>
    </div>
  );
}
