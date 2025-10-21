import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useSupercluster from "use-supercluster";
import type { HelpRequest } from "../lib/types";
import { markDone } from "../lib/requests";
import { haversineKm } from "../lib/geo";
import { auth } from "../lib/firebase";

const userDotIcon = L.divIcon({
  className: "user-dot-wrap",
  html: `<span class="user-dot"></span><span class="user-dot-pulse"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function statusIcon(status: HelpRequest["status"]) {
  const color = status === "open" ? "#16a34a" : "#f59e0b";
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

function FlyToSelected({
  selectedId,
  selectedTick,
  requests,
}: {
  selectedId?: string;
  selectedTick?: number;
  requests: HelpRequest[];
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const req = requests.find((r) => r.id === selectedId && r.location);
    if (!req?.location) return;
    map.flyTo([req.location.lat, req.location.lng], 16, { animate: true });
  }, [selectedId, selectedTick, requests, map]);
  return null;
}

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
}: Props) {
  const myId = auth.currentUser?.uid ?? null;

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
    useMapEvents({
      moveend: () => {
        const b = map.getBounds();
        setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        setZoom(map.getZoom());
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
        <FlyToSelected
          selectedId={selectedId}
          selectedTick={selectedTick}
          requests={requests}
        />
        <LocateControl userLoc={userLoc} onLocate={(loc) => onLocated?.(loc)} />

        {userLoc && (
          <Marker position={[userLoc.lat, userLoc.lng]} icon={userDotIcon} />
        )}

        {clusters.map((c: any) => {
          const [lng, lat] = c.geometry.coordinates;
          if (c.properties.cluster)
            return (
              <Marker
                key={`cluster-${c.id}`}
                position={[lat, lng]}
                icon={clusterIcon(c.properties.point_count)}
              />
            );

          const req = requests.find((r) => r.id === c.properties.requestId);
          if (!req?.location) return null;

          const distance =
            userLoc && req.location
              ? haversineKm(userLoc, req.location).toFixed(1)
              : null;
          const iAmParticipant =
            myId && (req.requesterId === myId || req.helperId === myId);

          return (
            <Marker
              key={req.id}
              position={[req.location.lat, req.location.lng]}
              icon={statusIcon(req.status)}
            >
              <Tooltip>{req.title}</Tooltip>
              <Popup>
                <div className="popup-card">
                  {/* Head */}
                  <div className="popup-head">
                    <div className="popup-title">{req.title}</div>
                    <span
                      className={`popup-pill ${
                        req.status === "open" ? "pill-open" : "pill-active"
                      }`}
                      title={`Status: ${req.status}`}
                    >
                      {req.status === "open" ? "Open" : "In progress"}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="popup-body">
                    {req.description && (
                      <div className="popup-desc">{req.description}</div>
                    )}

                    <div className="popup-meta">
                      {/* Category */}
                      <span className="meta-chip" title="Category">
                        <svg viewBox="0 0 24 24" className="chip-ico">
                          <path d="M12 3l9 6-9 6-9-6 9-6zm0 12l9 6-9 6-9-6 9-6z" />
                        </svg>
                        {req.category}
                      </span>

                      {/* Reward */}
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

                      {/* Distance */}
                      {distance && (
                        <span className="meta-chip" title="Approx distance">
                          <svg viewBox="0 0 24 24" className="chip-ico">
                            <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z" />
                            <circle
                              cx="12"
                              cy="9"
                              r="2.5"
                              fill="currentColor"
                            />
                          </svg>
                          ~{distance} km
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="popup-actions">
                    {req.status === "open" &&
                      myId &&
                      myId !== req.requesterId && (
                        <button
                          onClick={() => onAccept?.(req)}
                          className="btn btn-primary"
                        >
                          I can help
                        </button>
                      )}

                    {(req.status === "accepted" ||
                      req.status === "in_progress") &&
                      iAmParticipant && (
                        <button
                          onClick={() => onOpenChat?.(req)}
                          className="btn btn-ghost"
                        >
                          Open chat
                        </button>
                      )}

                    {(req.status === "accepted" ||
                      req.status === "in_progress") &&
                      req.helperId === myId && (
                        <button
                          onClick={() => markDone(req.id)}
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
        })}
      </MapContainer>

      <style>{`
        .user-dot-wrap { position: relative; }
        .user-dot { width: 10px; height: 10px; border-radius: 50%; background:#2563eb; display:inline-block; }
        .user-dot-pulse { position:absolute; left:50%; top:50%; width:14px; height:14px; transform:translate(-50%,-50%);
          border:2px solid #3b82f6; border-radius:50%; animation:pulse 1.5s infinite; }
        @keyframes pulse { 0%{opacity:.7;transform:translate(-50%,-50%)scale(1);} 70%{opacity:0;transform:translate(-50%,-50%)scale(2);} 100%{opacity:0;} }
        .locate-btn-el { background:#fff; border:none; font-size:18px; cursor:pointer; width:34px; height:34px; }
        .locate-btn-el:hover { background:#f3f4f6; }
        .leaflet-top .leaflet-control.locate-btn { margin-top: 80px; } /* ✅ fixed selector */
      `}</style>
    </div>
  );
}
