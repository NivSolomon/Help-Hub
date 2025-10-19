import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import type { HelpRequest } from "../lib/types";
import { acceptRequest, markDone } from "../lib/requests";
import { haversineKm } from "../lib/geo";
import { auth } from "../lib/firebase";

/** ---------- Marker icons by status ---------- */
function statusIcon(status: HelpRequest["status"]) {
  const color =
    status === "open" ? "#2563eb" : // blue
    status === "accepted" ? "#f59e0b" : // amber
    "#16a34a"; // green (done)

  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
      <path d="M16 0C8.28 0 2 6.28 2 14c0 9.66 12.04 22.83 13.01 23.86a1.4 1.4 0 0 0 1.98 0C17.96 36.83 30 23.66 30 14 30 6.28 23.72 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="14" r="6" fill="white"/>
    </svg>
  `);

  return new L.Icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${svg}`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -30],
    tooltipAnchor: [12, -16],
  });
}

/** ---------- User location pulsing dot (divIcon) ---------- */
const userDotIcon = L.divIcon({
  className: "user-dot-wrap",
  html:
    `<span class="user-dot"></span>` +
    `<span class="user-dot-pulse"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** ---------- Fit the map to markers on first render ---------- */
function FitOnFirstRender({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [30, 30] });
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** ---------- "My location" control ---------- */
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
    const control = L.control({ position });

    control.onAdd = () => {
      const container = L.DomUtil.create("div", "leaflet-bar locate-btn");
      const btn = L.DomUtil.create("button", "locate-btn-el", container);
      btn.title = "My location";
      // icon via inline SVG background (blue target)
      btn.innerHTML = "";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, "click", async () => {
        // Prefer prop userLoc; otherwise use geolocation
        if (userLoc) {
          map.flyTo([userLoc.lat, userLoc.lng], Math.max(map.getZoom(), 15), { animate: true });
          onLocate(userLoc);
          return;
        }
        if ("geolocation" in navigator) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
              })
            );
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 15), { animate: true });
            onLocate(loc);
          } catch {
            // silent — user may have denied permission
          }
        }
      });
      return container;
    };

    control.addTo(map);
    return () => control.remove();
  }, [map, position, userLoc, onLocate]);

  return null;
}

/** ---------- Props ---------- */
type Props = {
  center: { lat: number; lng: number };
  requests: HelpRequest[];
  className?: string;
  userLoc?: { lat: number; lng: number };
  onOpenChat?: (req: HelpRequest) => void;
};

export default function MapView({
  center,
  requests,
  className,
  userLoc,
  onOpenChat,
}: Props) {
  const myId = auth.currentUser?.uid ?? null;

  // local mirror so the Locate control can set location even if parent didn't pass one
  const [myLoc, setMyLoc] = useState<typeof userLoc | undefined>(userLoc);
  useEffect(() => setMyLoc(userLoc), [userLoc?.lat, userLoc?.lng]); // sync when prop changes

  const points: Array<[number, number]> = useMemo(
    () =>
      requests.filter((r) => !!r.location).map((r) => [r.location!.lat, r.location!.lng]),
    [requests]
  );

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: 380, width: "100%", borderRadius: "0.75rem" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Locate control */}
        <LocateControl
          userLoc={userLoc}
          onLocate={(loc) => setMyLoc(loc)}
          position="topleft"
        />

        {/* Auto-fit on first render when we have markers */}
        {points.length > 0 && <FitOnFirstRender points={points} />}

        {/* User location pulsing dot */}
        {myLoc && <Marker position={[myLoc.lat, myLoc.lng]} icon={userDotIcon} />}

        {/* Requests */}
        {requests
          .filter((r) => !!r.location)
          .map((r) => {
            const pos: [number, number] = [r.location!.lat, r.location!.lng];
            const iAmParticipant =
              myId != null && (r.requesterId === myId || r.helperId === myId);
            const distance =
              myLoc && r.location ? haversineKm(myLoc, r.location).toFixed(1) : null;

            return (
              <Marker key={r.id} position={pos} icon={statusIcon(r.status)}>
                <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                  {r.title}
                </Tooltip>
                <Popup autoPan maxWidth={280}>
                  <div className="space-y-1">
                    <div className="font-semibold">{r.title}</div>
                    <div className="text-sm text-gray-700">{r.description}</div>
                    <div className="text-xs text-gray-500">
                      Status: <span className="capitalize">{r.status}</span>
                      {r.reward ? ` • Reward: ${r.reward}` : ""}
                      {distance != null ? ` • ~${distance} km` : ""}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.status === "open" && myId && myId !== r.requesterId && (
                        <button
                          onClick={() => acceptRequest(r.id, myId)}
                          className="rounded bg-black px-2 py-1 text-xs text-white hover:opacity-90"
                        >
                          I can help
                        </button>
                      )}

                      {r.status === "accepted" && myId && r.helperId === myId && (
                        <button
                          onClick={() => markDone(r.id)}
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          Mark done
                        </button>
                      )}

                      {r.status === "accepted" && iAmParticipant && onOpenChat && (
                        <button
                          onClick={() => onOpenChat(r)}
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          Open chat
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
