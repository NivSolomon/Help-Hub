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
import { markDone } from "../lib/requests";
import { haversineKm } from "../lib/geo";
import { auth, db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

// ---------- User mini-profile ----------
function useUserMini(uid?: string | null) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data() as any | undefined;
        setName(d?.displayName ?? d?.name ?? d?.profile?.displayName ?? null);
      },
      () => setName(null)
    );
    return () => unsub();
  }, [uid]);
  return name;
}

// ---------- Address handling ----------
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
    const s = (addr as string)?.trim?.() ?? "";
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

// ---------- Icons ----------
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
    <div style="background:${color};color:#fff;width:${size}px;height:${size}px;border-radius:9999px;
    display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(255,255,255,0.8);
    font-weight:600;">${count}</div>`;
  return L.divIcon({
    html,
    className: "cluster-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ---------- Map controls ----------
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
      const container = L.DomUtil.create("div", "leaflet-bar locate-btn");
      const btn = L.DomUtil.create("button", "locate-btn-el", container);
      btn.title = "My location";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, "click", async () => {
        if (userLoc) {
          map.flyTo([userLoc.lat, userLoc.lng], Math.max(map.getZoom(), 15), {
            animate: true,
          });
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
            map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 15), {
              animate: true,
            });
            onLocate(loc);
          } catch {}
        }
      });
      return container;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map, position, userLoc, onLocate]);
  return null;
}

// ---------- Radius overlay (red circle) ----------
function RadiusOverlay({
  userLoc,
  radiusKm,
}: {
  userLoc?: { lat: number; lng: number };
  radiusKm: number;
}) {
  const map = useMap();
  const circleRef = useRef<L.Circle | null>(null);

  // Focus on circle whenever radius or user location changes
  useEffect(() => {
    if (!userLoc || !radiusKm || radiusKm <= 0) return;
    const c = circleRef.current;
    if (!c) return;
    // fit to circle bounds with padding; guard if map not ready
    try {
      const b = c.getBounds();
      map.fitBounds(b, { padding: [36, 36] });
    } catch {
      // ignore
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

// ---------- Marker component ----------
function RequestMarker({
  req,
  myId,
  userLoc,
  onAccept,
  onOpenChat,
  onMarkDone,
  setRef,
}: {
  req: HelpRequest;
  myId: string | null;
  userLoc?: { lat: number; lng: number };
  onAccept?: (req: HelpRequest) => void;
  onOpenChat?: (req: HelpRequest) => void;
  setRef?: (m: LeafletMarker | null) => void;
}) {
  const requesterName = useUserMini(req.requesterId);
  const locationLabel =
    formatAddress((req as any).address) ?? "Address not provided";

  const distance =
    userLoc && req.location
      ? haversineKm(userLoc, req.location).toFixed(1)
      : null;
  const iAmParticipant =
    myId && (req.requesterId === myId || req.helperId === myId);

  return (
    <Marker
      ref={setRef as any}
      position={[req.location!.lat, req.location!.lng]}
      icon={statusIcon(req.status)}
    >
      <Tooltip>{req.title}</Tooltip>
      <Popup autoPan={false} keepInView={false}>
        <div className="popup-card">
          <div className="popup-head">
            <div className="popup-title">{req.title}</div>
            <span
              className={`popup-pill ${
                req.status === "open"
                  ? "pill-open"
                  : req.status === "done"
                  ? "pill-done"
                  : "pill-active"
              }`}
              title={`Status: ${req.status}`}
            >
              {req.status.replace("_", " ")}
            </span>
          </div>

          <div className="byline">
            <div className="byline-row" title="Requester">
              <svg viewBox="0 0 24 24" className="chip-ico">
                <path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
              </svg>
              <span className="byline-text">
                {requesterName ?? "Unknown user"}
              </span>
            </div>
            <div className="byline-row" title="Address">
              <svg viewBox="0 0 24 24" className="chip-ico">
                <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z" />
                <circle cx="12" cy="9" r="2.5" fill="currentColor" />
              </svg>
              <span className="byline-text">{locationLabel}</span>
            </div>
          </div>

          {req.description && (
            <div className="popup-desc">{req.description}</div>
          )}

          <div className="popup-meta">
            <span className="meta-chip" title="Category">
              <svg viewBox="0 0 24 24" className="chip-ico">
                <path d="M12 3l9 6-9 6-9-6 9-6zm0 12l9 6-9 6-9-6 9-6z" />
              </svg>
              {req.category}
            </span>

            {typeof req.reward === "number" && (
              <span className="meta-chip" title="Reward">
                <svg viewBox="0 0 24 24" className="chip-ico">
                  <path
                    d="M12 1v22M5 6h9a4 4 0 110 8H6m0 0h8"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
                {req.reward}
              </span>
            )}

            {distance && (
              <span className="meta-chip" title="Approx. distance">
                <svg viewBox="0 0 24 24" className="chip-ico">
                  <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z" />
                  <circle cx="12" cy="9" r="2.5" fill="currentColor" />
                </svg>
                ~{distance} km
              </span>
            )}
          </div>

          <div className="popup-actions">
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
                  Open chat
                </button>
              )}

            {(req.status === "accepted" || req.status === "in_progress") &&
              myId === req.requesterId && (
                <button
                  onClick={() => onMarkDone?.(req)}
                  className="btn btn-outline"
                >
                  Mark done
                </button>
              )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// ---------- Fly & open popup ONLY on selection ----------
function FocusOnSelected({
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

    map.flyTo([loc.lat, loc.lng], 16, { animate: true });

    const openAfter = () => {
      const m = markerRefs.current[selectedId];
      if (m) m.openPopup();
    };
    map.once("moveend", openAfter);
    return () => {
      map.off("moveend", openAfter);
    };
  }, [selectedId, selectedTick, map, coordsByIdRef, markerRefs]);

  return null;
}

// ---------- Main MapView ----------
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
  /** 👇 Pass this from Home so we can show & focus the red circle */
  radiusKm?: number;
  onMarkDone?: (req: HelpRequest) => void;
};

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
}: Props) {
  const myId = auth.currentUser?.uid ?? null;

  // fast lookup of coords by id (used by focus effect)
  const coordsByIdRef = useRef<Record<string, { lat: number; lng: number }>>(
    {}
  );
  useEffect(() => {
    const next: Record<string, { lat: number; lng: number }> = {};
    for (const r of requests) if (r.location) next[r.id] = r.location;
    coordsByIdRef.current = next;
  }, [requests]);

  // marker instances to programmatically open popups
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});
  const makeMarkerRef = (id: string) => (m: LeafletMarker | null) => {
    markerRefs.current[id] = m;
  };

  const points = useMemo(
    () =>
      requests
        .filter((r) => !!r.location)
        .map((r) => ({
          type: "Feature" as const,
          properties: { cluster: false, requestId: r.id },
          geometry: {
            type: "Point" as const,
            coordinates: [r.location!.lng, r.location!.lat],
          },
        })),
    [requests]
  );

  const [bounds, setBounds] = useState<[number, number, number, number]>();
  const [zoom, setZoom] = useState(13);
  const { clusters } = useSupercluster({
    points,
    bounds,
    zoom,
    options: { radius: 55, maxZoom: 19 },
  });

  function BoundsTracker() {
    const map = useMap();
    const t = useRef<number | null>(null);
    useMapEvents({
      moveend: () => {
        if (t.current) cancelAnimationFrame(t.current);
        t.current = requestAnimationFrame(() => {
          const b = map.getBounds();
          setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          setZoom(map.getZoom());
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

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: 380, borderRadius: 12 }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsTracker />

        {/* radius overlay & auto-focus on radius changes */}
        <RadiusOverlay userLoc={userLoc} radiusKm={radiusKm} />

        {/* focus only on explicit selection and open popup afterwards */}
        <FocusOnSelected
          selectedId={selectedId}
          selectedTick={selectedTick}
          coordsByIdRef={coordsByIdRef}
          markerRefs={markerRefs}
        />

        <LocateControl userLoc={userLoc} onLocate={(loc) => onLocated?.(loc)} />

        {userLoc && (
          <Marker position={[userLoc.lat, userLoc.lng]} icon={userDotIcon} />
        )}

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

          const req = requests.find((r) => r.id === c.properties.requestId);
          if (!req?.location) return null;

          return (
            <RequestMarker
              key={req.id}
              req={req}
              myId={myId}
              userLoc={userLoc}
              onAccept={onAccept}
              onOpenChat={onOpenChat}
              onMarkDone={onMarkDone} // ✅ new
              setRef={makeMarkerRef(req.id)}
            />
          );
        })}
      </MapContainer>

      <style>{`
        /* Locate button – no gap */
        .locate-btn { border-radius: 8px; overflow: hidden; }
        .locate-btn-el {
          display:flex; align-items:center; justify-content:center;
          background:#fff; border:1px solid #d1d5db; width:36px; height:36px;
          padding:0; margin:0; line-height:1; cursor:pointer; border-radius:8px;
        }
        .locate-btn-el:hover { background:#f3f4f6; }
        .leaflet-top .leaflet-control.locate-btn { margin-top: 80px; }

        /* User dot */
        .user-dot-wrap { position: relative; }
        .user-dot { width: 10px; height: 10px; border-radius: 50%; background:#2563eb; display:inline-block; }
        .user-dot-pulse { position:absolute; left:50%; top:50%; width:14px; height:14px; transform:translate(-50%,-50%);
          border:2px solid #3b82f6; border-radius:50%; animation:pulse 1.5s infinite; }
        @keyframes pulse { 0%{opacity:.7;transform:translate(-50%,-50%)scale(1);} 70%{opacity:0;transform:translate(-50%,-50%)scale(2);} 100%{opacity:0;} }

        /* Popup styles */
        .popup-card { min-width: 240px; max-width: 300px; font-family: system-ui, ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
        .popup-head { display:flex; align-items:center; justify-content:space-between; gap:.5rem; }
        .popup-title { font-weight: 700; font-size: 14px; line-height: 1.2; }
        .popup-pill { font-size: 11px; padding: 2px 8px; border-radius: 9999px; border: 1px solid transparent; }
        .pill-open { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
        .pill-active { background:#fffbeb; color:#92400e; border-color:#fed7aa; }
        .pill-done { background:#f3f4f6; color:#374151; border-color:#e5e7eb; }

        .popup-desc { margin-top:.5rem; font-size: 13px; color:#374151; }

        .byline { margin-top:.5rem; display:grid; gap:.25rem; }
        .byline-row { display:flex; align-items:center; gap:.4rem; font-size:12px; color:#4b5563; }
        .byline-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        .chip-ico { width:14px; height:14px; color:#6b7280; flex:0 0 auto; }

        .popup-meta { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.6rem; }
        .meta-chip {
          display:inline-flex; align-items:center; gap:.35rem;
          font-size: 11px; padding: 3px 8px; border-radius:9999px;
          background:#f3f4f6; color:#374151; border:1px solid #e5e7eb;
        }

        .popup-actions { margin-top:.75rem; display:flex; flex-wrap:wrap; gap:.5rem; }
        .btn { border-radius:8px; font-size:12px; padding:6px 10px; border:1px solid #e5e7eb; }
        .btn:hover { background:#f9fafb; }
        .btn-primary { background:#111827; color:white; border-color:#111827; }
        .btn-primary:hover { opacity:.9; }
        .btn-outline { background:white; }
        .btn-ghost { background:white; }
      `}</style>
    </div>
  );
}
