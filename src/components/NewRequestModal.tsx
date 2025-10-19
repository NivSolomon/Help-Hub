import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { createRequest } from "../lib/requests";
import { auth } from "../lib/firebase";
import { CATEGORIES, type Category } from "../lib/types";

/* ─────────────────────── Types ─────────────────────── */

type Props = {
  open: boolean;
  onClose: () => void;
  userLocation?: { lat: number; lng: number };
};

type LatLng = { lat: number; lng: number };

type Address = {
  city: string;
  street: string;
  houseNumber: string;
  notes: string;
};

type Suggestion = { label: string; lat?: number; lon?: number };
type Validity = "idle" | "checking" | "valid" | "invalid";

/* ───────────────────── Helpers ───────────────────── */

const NOMINATIM_HEADERS = { Accept: "application/json" };

function useDebounced<T extends (...args: any[]) => void>(fn: T, ms: number) {
  const timer = useRef<number | undefined>();
  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => fn(...(args as Parameters<T>)), ms);
    },
    [fn, ms]
  );
}

function shortName(x: any): string {
  const a = x?.address ?? {};
  const first =
    a.road ||
    a.pedestrian ||
    x?.display_name?.split(",")[0] ||
    a.city ||
    a.town ||
    a.village ||
    "";
  const city = a.city || a.town || a.village || a.municipality || "";
  return city && first && first !== city ? `${first}, ${city}` : first || city;
}

/* User location pulsing dot */
const userDotIcon = L.divIcon({
  className: "user-dot-wrap",
  html: `<span class="user-dot"></span><span class="user-dot-pulse"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/* Simple marker icon */
const pickIcon = new L.Icon({
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 48' width='32' height='48'>
         <path d='M16 0C8.28 0 2 6.28 2 14c0 9.66 12.04 22.83 13.01 23.86a1.4 1.4 0 0 0 1.98 0C17.96 36.83 30 23.66 30 14 30 6.28 23.72 0 16 0z' fill='#ef4444'/>
         <circle cx='16' cy='14' r='6' fill='white'/>
       </svg>`
    ),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -30],
});

/* Locate control (button) */
function LocateControl({
  userLoc,
  onLocate,
  position = "topleft",
}: {
  userLoc?: LatLng;
  onLocate: (loc: LatLng) => void;
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
            /* ignore */
          }
        }
      });
      return container;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map, position, userLoc, onLocate]);
  return null;
}

/* Component to fly map when center changes */
function FlyTo({ center }: { center?: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [center, map]);
  return null;
}

/* Handle map clicks to pick a location */
function ClickPicker({
  onPick,
}: {
  onPick: (latlng: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/* ───────────────────── Component ───────────────────── */

export default function NewRequestModal({ open, onClose, userLocation }: Props) {
  // Form basics
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [reward, setReward] = useState("");

  // Location & address
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [myLoc, setMyLoc] = useState<LatLng | undefined>(userLocation);
  useEffect(() => setMyLoc(userLocation), [userLocation?.lat, userLocation?.lng]);

  const [address, setAddress] = useState<Address>({
    city: "",
    street: "",
    houseNumber: "",
    notes: "",
  });

  // Suggestions
  const [citySugs, setCitySugs] = useState<Suggestion[]>([]);
  const [streetSugs, setStreetSugs] = useState<Suggestion[]>([]);
  const [showCitySugs, setShowCitySugs] = useState(false);
  const [showStreetSugs, setShowStreetSugs] = useState(false);

  // Validation state (stable)
  const [addrValidity, setAddrValidity] = useState<Validity>("idle");
  const [addrMsg, setAddrMsg] = useState("");
  const dirtyRef = useRef(false);
  const validatingRef = useRef(false);
  const versionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const updatingFromMapRef = useRef(false); // clicking map shouldn't set dirty

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTitle(""); setDesc(""); setCategory("other"); setReward("");
      setPicked(null);
      setAddress({ city: "", street: "", houseNumber: "", notes: "" });
      setCitySugs([]); setStreetSugs([]); setShowCitySugs(false); setShowStreetSugs(false);
      setAddrValidity("idle"); setAddrMsg("");
      dirtyRef.current = false; validatingRef.current = false; versionRef.current = 0;
      abortRef.current?.abort(); abortRef.current = null;
    }
  }, [open]);

  const canCreate =
    !!title.trim() &&
    !!description.trim() &&
    !!picked &&
    !!address.city.trim() &&
    !!address.street.trim() &&
    addrValidity === "valid";

  /* ── Reverse geocode (map → text) without making it dirty ── */
  async function reverseGeocode(lat: number, lng: number) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      const res = await fetch(url, { headers: NOMINATIM_HEADERS } as RequestInit);
      if (!res.ok) return;
      const data = await res.json();
      const a = data?.address ?? {};

      updatingFromMapRef.current = true;
      setAddress(prev => ({
        ...prev,
        street: a.road || a.pedestrian || a.footway || prev.street,
        houseNumber: a.house_number || prev.houseNumber,
        city: a.city || a.town || a.village || a.municipality || prev.city,
      }));
      updatingFromMapRef.current = false;

      setAddrValidity("valid");
      setAddrMsg("");
      dirtyRef.current = false;
    } catch { /* ignore */ }
  }

  const onPickFromMap = useCallback((loc: LatLng) => {
    setPicked(loc);
    reverseGeocode(loc.lat, loc.lng);
  }, []);

  /* ── Forward geocode (text → marker) with stability ── */
  const runValidation = useCallback(async (city: string, street: string, house: string) => {
    if (validatingRef.current || !dirtyRef.current) return;

    if (city.length < 2 || street.length < 2) {
      setAddrValidity("idle"); setAddrMsg("");
      return;
    }

    validatingRef.current = true;
    setAddrValidity("checking");
    setAddrMsg("Checking address…");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const myVersion = ++versionRef.current;

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      const q = [street, house, city].filter(Boolean).join(" ");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "il");

      const res = await fetch(url.toString(), {
        headers: NOMINATIM_HEADERS,
        signal: controller.signal,
      });

      if (myVersion !== versionRef.current) return;

      const arr = res.ok ? ((await res.json()) as any[]) : [];
      if (arr.length === 0) {
        setAddrValidity("invalid");
        setAddrMsg("Address not found. Please refine.");
      } else {
        const hit = arr[0];
        const lat = Number(hit.lat);
        const lon = Number(hit.lon);

        setPicked({ lat, lng: lon }); // update marker
        // also set a bit of normalized address
        const a = hit.address ?? {};
        updatingFromMapRef.current = true;
        setAddress(prev => ({
          ...prev,
          city: a.city || a.town || a.village || a.municipality || prev.city,
          street: a.road || a.pedestrian || prev.street,
          houseNumber: a.house_number || prev.houseNumber,
        }));
        updatingFromMapRef.current = false;

        setAddrValidity("valid");
        setAddrMsg("");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setAddrValidity("invalid");
        setAddrMsg("Could not validate address right now.");
      }
    } finally {
      if (myVersion === versionRef.current) {
        validatingRef.current = false;
        dirtyRef.current = false;
      }
    }
  }, []);

  const debouncedRunValidation = useDebounced(
    (c: string, s: string, h: string) => runValidation(c, s, h),
    450
  );

  useEffect(() => {
    if (!open) return;
    debouncedRunValidation(
      address.city.trim(),
      address.street.trim(),
      address.houseNumber.trim()
    );
  }, [address.city, address.street, address.houseNumber, open, debouncedRunValidation]);

  /* ── Autocomplete ── */
  const debouncedFetchCity = useDebounced(async (q: string) => {
    if (q.length < 2) return setCitySugs([]);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "3");
      url.searchParams.set("countrycodes", "il");
      const res = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
      const arr = res.ok ? ((await res.json()) as any[]) : [];
      setCitySugs(
        arr
          .map((x) => ({
            label:
              x.address?.city ||
              x.address?.town ||
              x.address?.village ||
              x.address?.municipality ||
              shortName(x),
            lat: x.lat ? Number(x.lat) : undefined,
            lon: x.lon ? Number(x.lon) : undefined,
          }))
          .filter((s) => s.label && s.label.toLowerCase().startsWith(q.toLowerCase()))
          .slice(0, 3)
      );
    } catch { setCitySugs([]); }
  }, 250);

  const debouncedFetchStreet = useDebounced(async (q: string, city: string) => {
    if (q.length < 2 || city.trim().length < 2) return setStreetSugs([]);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", `${q} ${city}`);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "3");
      url.searchParams.set("countrycodes", "il");
      const res = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
      const arr = res.ok ? ((await res.json()) as any[]) : [];
      setStreetSugs(
        arr
          .map((x) => ({
            label: x.address?.road || shortName(x),
            lat: x.lat ? Number(x.lat) : undefined,
            lon: x.lon ? Number(x.lon) : undefined,
          }))
          .filter((s) => s.label)
          .slice(0, 3)
      );
    } catch { setStreetSugs([]); }
  }, 250);

  // user edits → set dirty (map updates won't set dirty)
  function userEdit<K extends keyof Address>(key: K, value: Address[K]) {
    if (!updatingFromMapRef.current) {
      dirtyRef.current = true;
      abortRef.current?.abort();
    }
    setAddress((a) => ({ ...a, [key]: value }));
  }
  function onCityChange(v: string) {
    userEdit("city", v);
    setShowCitySugs(true);
    debouncedFetchCity(v);
  }
  function onStreetChange(v: string) {
    userEdit("street", v);
    setShowStreetSugs(true);
    debouncedFetchStreet(v, address.city);
  }
  function onHouseChange(v: string) {
    userEdit("houseNumber", v);
  }
  function applyCitySuggestion(s: Suggestion) {
    userEdit("city", s.label);
    setShowCitySugs(false);
    if (s.lat && s.lon) setPicked({ lat: s.lat, lng: s.lon });
  }
  function applyStreetSuggestion(s: Suggestion) {
    userEdit("street", s.label);
    setShowStreetSugs(false);
    if (s.lat && s.lon) onPickFromMap({ lat: s.lat, lng: s.lon });
  }

  /* Submit */
  async function submit() {
    const u = auth.currentUser;
    if (!u || !picked) return;

    if (dirtyRef.current && !validatingRef.current) {
      await runValidation(address.city.trim(), address.street.trim(), address.houseNumber.trim());
      if (addrValidity !== "valid") return;
    }

    await createRequest({
      title: title.trim(),
      description: description.trim(),
      category,
      reward: reward.trim() || undefined,
      requesterId: u.uid,
      location: picked,
      address: {
        city: address.city.trim(),
        street: address.street.trim(),
        houseNumber: address.houseNumber.trim(),
        notes: address.notes.trim(),
      },
    } as any);

    onClose();
  }

  if (!open) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const mapCenter: LatLng = useMemo(
    () => picked ?? myLoc ?? { lat: 32.0853, lng: 34.7818 },
    [picked, myLoc]
  );

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        {/* X close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-4 rounded-full border p-1.5 text-gray-600 hover:bg-gray-50"
        >
          ×
        </button>

        <div className="max-h-[85vh] overflow-y-auto p-5">
          <h3 className="mb-4 text-lg font-semibold">New help request</h3>

          {/* Title */}
          <label className="block text-sm font-medium">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-3 mt-1 w-full rounded-lg border p-2 bg-white"
            placeholder="Pick up package"
          />

          {/* Description */}
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            className="mb-3 mt-1 h-24 w-full rounded-lg border p-2 bg-white"
            placeholder="From post office on Dizengoff"
          />

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium">Category</label>
              <select
                value={category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setCategory(e.target.value as Category)
                }
                className="mt-1 w-full rounded-lg border p-2 bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "errand"
                      ? "Errand"
                      : c === "carry"
                      ? "Carry / Move"
                      : c === "fix"
                      ? "Fix"
                      : "Other"}
                  </option>
                ))}
              </select>
            </div>

            {/* Reward */}
            <div>
              <label className="block text-sm font-medium">Reward (optional)</label>
              <input
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="Coffee / 20₪"
              />
            </div>
          </div>

          {/* MAP (always visible) */}
          <div className="rounded-xl border p-2">
            <MapContainer
              center={mapCenter}
              zoom={14}
              style={{ height: 280, width: "100%", borderRadius: "0.75rem" }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {/* locate control */}
              <LocateControl userLoc={myLoc} onLocate={(loc) => setMyLoc(loc)} />
              {/* fly when center changes (after validation) */}
              <FlyTo center={picked ?? myLoc} />
              {/* click to pick */}
              <ClickPicker onPick={onPickFromMap} />
              {/* pulsing user dot */}
              {myLoc && <Marker position={[myLoc.lat, myLoc.lng]} icon={userDotIcon} />}
              {/* picked marker */}
              {picked && <Marker position={[picked.lat, picked.lng]} icon={pickIcon} />}
            </MapContainer>

            <div className="mt-2 text-xs text-gray-600">
              {picked
                ? `Selected: ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
                : `Click the map to drop a marker.`}
            </div>
          </div>

          {/* Address fields & autocomplete */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/* City */}
            <div className="relative">
              <label className="block text-sm font-medium">City</label>
              <input
                value={address.city}
                onChange={(e) => onCityChange(e.target.value)}
                onFocus={() => address.city.length >= 2 && setShowCitySugs(true)}
                onBlur={() => setTimeout(() => setShowCitySugs(false), 120)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="e.g., Tel Aviv"
              />
              {showCitySugs && citySugs.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg border bg-white shadow">
                  {citySugs.map((s, i) => (
                    <li
                      key={`${s.label}-${i}`}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyCitySuggestion(s)}
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Street */}
            <div className="relative">
              <label className="block text-sm font-medium">Street</label>
              <input
                value={address.street}
                onChange={(e) => onStreetChange(e.target.value)}
                onFocus={() => address.street.length >= 2 && setShowStreetSugs(true)}
                onBlur={() => setTimeout(() => setShowStreetSugs(false), 120)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="e.g., Dizengoff"
              />
              {showStreetSugs && streetSugs.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg border bg-white shadow">
                  {streetSugs.map((s, i) => (
                    <li
                      key={`${s.label}-${i}`}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyStreetSuggestion(s)}
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* House # */}
            <div>
              <label className="block text-sm font-medium">House #</label>
              <input
                value={address.houseNumber}
                onChange={(e) => onHouseChange(e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="e.g., 50"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium">Notes (optional)</label>
              <input
                value={address.notes}
                onChange={(e) => userEdit("notes", e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="Entrance code, floor, pickup desk, etc."
              />
            </div>
          </div>

          {/* Validity indicator */}
          <div className="mt-1 text-xs">
            {addrValidity === "checking" && (
              <span className="text-gray-500">{addrMsg || "Checking address…"}</span>
            )}
            {addrValidity === "valid" && <span className="text-green-600">Address OK ✓</span>}
            {addrValidity === "invalid" && (
              <span className="text-red-600">{addrMsg || "Address not found."}</span>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-gray-50">
              Cancel
            </button>
            <button
              disabled={!canCreate}
              onClick={submit}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
              title={!canCreate ? "Fill all fields and pick a valid address" : "Create"}
            >
              Create request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
