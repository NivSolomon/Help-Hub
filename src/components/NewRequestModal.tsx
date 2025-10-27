import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { createRequest } from "../lib/requests";
import { auth } from "../lib/firebase";
import { CATEGORIES, type Category } from "../lib/types";

/* ───────────────────── Types ───────────────────── */

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

type Suggestion = {
  label: string;
  lat?: number;
  lon?: number;
  // [west, south, east, north] for scoping street search
  bbox?: [number, number, number, number];
};

type Validity = "idle" | "checking" | "valid" | "invalid";

/* ───────────────── Nominatim + Utils ───────────────── */

const COUNTRY = "il";
const DEBOUNCE_MS = 750;

// Nominatim policy: include a contact email in the query
const NOMINATIM_EMAIL = "nivsolomon3@gmail.com";
const NOMINATIM_HEADERS = { Accept: "application/json" } as const;

// tiny in-memory cache to avoid repeat network calls
const geoCache = new Map<string, unknown>();

async function fetchJson(url: URL, abort?: AbortSignal) {
  if (!url.searchParams.has("format")) url.searchParams.set("format", "jsonv2");
  if (!url.searchParams.has("email"))
    url.searchParams.set("email", NOMINATIM_EMAIL);
  if (!url.searchParams.has("accept-language"))
    url.searchParams.set("accept-language", "he,en");

  const key = url.toString();
  if (geoCache.has(key)) return geoCache.get(key);

  const attempt = async (tries = 2): Promise<unknown> => {
    const res = await fetch(key, { headers: NOMINATIM_HEADERS, signal: abort });
    if (res.status === 429 || res.status === 503) {
      if (tries > 0) {
        await new Promise((r) => setTimeout(r, 600));
        return attempt(tries - 1);
      }
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Geocode HTTP ${res.status} ${t.slice(0, 120)}`);
    }
    const json = await res.json();
    geoCache.set(key, json);
    return json;
  };

  return attempt();
}

function useDebounced<T extends (...args: any[]) => void>(fn: T, ms: number) {
  const timer = useRef<number | undefined>();
  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => fn(...(args as Parameters<T>)),
        ms
      );
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

function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ───────────────── Map helpers ───────────────── */

const userDotIcon = L.divIcon({
  className: "user-dot-wrap",
  html: `<span class="user-dot"></span><span class="user-dot-pulse"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

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

/**
 * LocateControl
 * Custom round "target" button that does not hide on hover.
 * Same visual language as MapView version.
 */
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
      const container = L.DomUtil.create("div", "leaflet-control-locate");
      const btn = L.DomUtil.create("button", "locate-btn-el", container);

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
            const loc = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 15), {
              animate: true,
            });
            onLocate(loc);
          } catch {
            /* swallow geolocation errors */
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

function FlyTo({ center }: { center?: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 15), {
      animate: true,
    });
  }, [center, map]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/* ───────────────── Component ───────────────── */

export default function NewRequestModal({
  open,
  onClose,
  userLocation,
}: Props) {
  if (!open) return null;

  // Form
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [reward, setReward] = useState("");

  // Location state
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [myLoc, setMyLoc] = useState<LatLng | undefined>(userLocation);
  useEffect(
    () => setMyLoc(userLocation),
    [userLocation?.lat, userLocation?.lng]
  );

  // Address & suggestions
  const [address, setAddress] = useState<Address>({
    city: "",
    street: "",
    houseNumber: "",
    notes: "",
  });

  const [citySugs, setCitySugs] = useState<Suggestion[]>([]);
  const [streetSugs, setStreetSugs] = useState<Suggestion[]>([]);
  const [showCitySugs, setShowCitySugs] = useState(false);
  const [showStreetSugs, setShowStreetSugs] = useState(false);

  // Selected city bbox
  const cityBBoxRef = useRef<[number, number, number, number] | null>(null);

  // Validation
  const [addrValidity, setAddrValidity] = useState<Validity>("idle");
  const [addrMsg, setAddrMsg] = useState("");
  const dirtyRef = useRef(false);
  const validatingRef = useRef(false);
  const versionRef = useRef(0);
  const lastValidatedRef = useRef<{
    city: string;
    street: string;
    house: string;
  } | null>(null);
  const updatingFromMapRef = useRef(false);

  // AbortControllers for fetches
  const abortFwdRef = useRef<AbortController | null>(null);
  const abortRevRef = useRef<AbortController | null>(null);

  const canCreate =
    !!title.trim() &&
    !!description.trim() &&
    !!picked &&
    !!address.city.trim() &&
    !!address.street.trim() &&
    addrValidity === "valid";

  /* ── Reverse geocode (map → inputs) ── */
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      abortRevRef.current?.abort();
      const controller = new AbortController();
      abortRevRef.current = controller;

      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("addressdetails", "1");

      const data = (await fetchJson(url, controller.signal)) as any;
      const a = data?.address ?? {};

      updatingFromMapRef.current = true;
      setAddress((prev) => {
        const next = {
          ...prev,
          street: a.road || a.pedestrian || a.footway || prev.street,
          houseNumber: a.house_number || prev.houseNumber,
          city: a.city || a.town || a.village || a.municipality || prev.city,
        };
        lastValidatedRef.current = {
          city: next.city || "",
          street: next.street || "",
          house: next.houseNumber || "",
        };
        return next;
      });
      updatingFromMapRef.current = false;

      setAddrValidity("valid");
      setAddrMsg("");
      dirtyRef.current = false;
    } catch {
      setAddrValidity("idle");
    }
  }, []);

  const onPickFromMap = useCallback(
    (loc: LatLng) => {
      const prev = picked;
      setPicked(loc);
      if (!prev || metersBetween(prev, loc) >= 10)
        reverseGeocode(loc.lat, loc.lng);
    },
    [picked, reverseGeocode]
  );

  /* ── Forward geocode (inputs → marker) ── */
  const runValidation = useCallback(
    async (city: string, street: string, house: string) => {
      if (validatingRef.current || !dirtyRef.current) return;

      const snap = lastValidatedRef.current;
      if (
        snap &&
        snap.city === city &&
        snap.street === street &&
        snap.house === house
      )
        return;

      if (city.length < 2 || street.length < 2) {
        setAddrValidity("idle");
        setAddrMsg("");
        return;
      }

      validatingRef.current = true;
      setAddrValidity("checking");
      setAddrMsg("Checking address…");

      abortFwdRef.current?.abort();
      const controller = new AbortController();
      abortFwdRef.current = controller;

      const myVersion = ++versionRef.current;

      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        const q = [street, house, city].filter(Boolean).join(" ");
        url.searchParams.set("q", q);
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "1");
        url.searchParams.set("countrycodes", COUNTRY);

        const bbox = cityBBoxRef.current;
        if (bbox) {
          const [west, south, east, north] = bbox;
          url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
          url.searchParams.set("bounded", "1");
        }

        const arr = (await fetchJson(url, controller.signal)) as any[];
        if (myVersion !== versionRef.current) return;

        if (!Array.isArray(arr) || arr.length === 0) {
          setAddrValidity("invalid");
          setAddrMsg("Address not found. Please refine.");
        } else {
          const hit = arr[0];
          const lat = Number(hit.lat);
          const lon = Number(hit.lon);

          setPicked({ lat, lng: lon });

          const a = hit.address ?? {};
          updatingFromMapRef.current = true;
          setAddress((prev) => ({
            ...prev,
            city: a.city || a.town || a.village || a.municipality || city,
            street: a.road || a.pedestrian || street,
            houseNumber: a.house_number || house,
          }));
          updatingFromMapRef.current = false;

          lastValidatedRef.current = { city, street, house };
          setAddrValidity("valid");
          setAddrMsg("");
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setAddrValidity("invalid");
          setAddrMsg(
            "Could not validate now (rate limit or network). Try again."
          );
        }
      } finally {
        validatingRef.current = false;
        dirtyRef.current = false;
      }
    },
    []
  );

  const debouncedRunValidation = useDebounced(
    (c: string, s: string, h: string) => runValidation(c, s, h),
    DEBOUNCE_MS
  );

  useEffect(() => {
    debouncedRunValidation(
      address.city.trim(),
      address.street.trim(),
      address.houseNumber.trim()
    );
  }, [
    address.city,
    address.street,
    address.houseNumber,
    debouncedRunValidation,
  ]);

  /* ── Autocomplete ── */

  const debouncedFetchCity = useDebounced(async (q: string) => {
    if (q.length < 2) return setCitySugs([]);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", COUNTRY);

      const arr = (await fetchJson(url)) as any[];
      const sugs: Suggestion[] = (arr || [])
        .map((x) => {
          let bbox: [number, number, number, number] | undefined;
          if (Array.isArray(x.boundingbox) && x.boundingbox.length === 4) {
            const [south, north, west, east] = x.boundingbox.map(Number);
            bbox = [west, south, east, north]; // [west, south, east, north]
          }
          return {
            label:
              x.address?.city ||
              x.address?.town ||
              x.address?.village ||
              x.address?.municipality ||
              shortName(x),
            lat: x.lat ? Number(x.lat) : undefined,
            lon: x.lon ? Number(x.lon) : undefined,
            bbox,
          };
        })
        .filter(
          (s) => s.label && s.label.toLowerCase().startsWith(q.toLowerCase())
        )
        .slice(0, 3);

      setCitySugs(sugs);
    } catch {
      setCitySugs([]);
    }
  }, 300);

  const debouncedFetchStreet = useDebounced(async (q: string, city: string) => {
    if (q.length < 2 || city.trim().length < 2) return setStreetSugs([]);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", `${q} ${city}`);
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", COUNTRY);

      const bbox = cityBBoxRef.current;
      if (bbox) {
        const [west, south, east, north] = bbox;
        url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
        url.searchParams.set("bounded", "1");
      }

      const arr = (await fetchJson(url)) as any[];
      const sugs: Suggestion[] = (arr || [])
        .map((x) => ({
          label: x.address?.road || shortName(x),
          lat: x.lat ? Number(x.lat) : undefined,
          lon: x.lon ? Number(x.lon) : undefined,
        }))
        .filter((s) => s.label)
        .slice(0, 3);

      setStreetSugs(sugs);
    } catch {
      setStreetSugs([]);
    }
  }, 300);

  /* user edits → mark dirty (map-driven edits do not) */
  function userEdit<K extends keyof Address>(key: K, value: Address[K]) {
    if (!updatingFromMapRef.current) {
      dirtyRef.current = true;
      abortFwdRef.current?.abort();
    }
    setAddress((a) => ({ ...a, [key]: value }));
  }
  function onCityChange(v: string) {
    userEdit("city", v);
    setShowCitySugs(true);
    if (v.length >= 2) {
      debouncedFetchCity(v);
    } else {
      setCitySugs([]);
    }
  }
  function onStreetChange(v: string) {
    userEdit("street", v);
    setShowStreetSugs(true);
    if (v.length >= 2 && address.city.trim().length >= 2) {
      debouncedFetchStreet(v, address.city);
    } else {
      setStreetSugs([]);
    }
  }
  function onHouseChange(v: string) {
    // digits only, max 3 chars
    const sanitized = v.replace(/\D/g, "").slice(0, 3);
    userEdit("houseNumber", sanitized);
  }
  function applyCitySuggestion(s: Suggestion) {
    userEdit("city", s.label);
    setShowCitySugs(false);

    if (s.bbox) {
      cityBBoxRef.current = s.bbox;
    }
    if (s.lat && s.lon) {
      const loc = { lat: s.lat, lng: s.lon };
      setPicked((prev) => (prev && metersBetween(prev, loc) < 10 ? prev : loc));
    }
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

    const cur = {
      city: address.city.trim(),
      street: address.street.trim(),
      house: address.houseNumber.trim(),
    };
    const snap = lastValidatedRef.current;
    if (
      !snap ||
      snap.city !== cur.city ||
      snap.street !== cur.street ||
      snap.house !== cur.house
    ) {
      await runValidation(cur.city, cur.street, cur.house);
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

  /* Map center */
  const mapCenter: LatLng = useMemo(
    () => picked ?? myLoc ?? { lat: 32.0853, lng: 34.7818 },
    [picked, myLoc]
  );

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border text-gray-600 hover:bg-gray-50"
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
              <label className="block text-sm font-medium">
                Reward (optional)
              </label>
              <input
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="Coffee / 20₪"
              />
            </div>
          </div>

          {/* Map */}
          <div className="rounded-xl border p-2">
            <MapContainer
              center={mapCenter}
              zoom={14}
              style={{ height: 280, width: "100%", borderRadius: "0.75rem" }}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <LocateControl
                userLoc={myLoc}
                onLocate={(loc) => setMyLoc(loc)}
              />

              <FlyTo center={picked ?? myLoc} />
              <ClickPicker onPick={onPickFromMap} />

              {myLoc && (
                <Marker position={[myLoc.lat, myLoc.lng]} icon={userDotIcon} />
              )}
              {picked && (
                <Marker position={[picked.lat, picked.lng]} icon={pickIcon} />
              )}
            </MapContainer>

            <div className="mt-2 text-xs text-gray-600">
              {picked
                ? `Selected: ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
                : `Click the map to place a marker.`}
            </div>
          </div>

          {/* Address fields */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/* City */}
            <div className="relative">
              <label className="block text-sm font-medium">City</label>
              <input
                value={address.city}
                onChange={(e) => onCityChange(e.target.value)}
                onFocus={() =>
                  address.city.length >= 2 && setShowCitySugs(true)
                }
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
                onFocus={() =>
                  address.street.length >= 2 && setShowStreetSugs(true)
                }
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

            {/* House number */}
            <div>
              <label className="block text-sm font-medium">House</label>
              <input
                value={address.houseNumber}
                onChange={(e) => onHouseChange(e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 bg-white"
                placeholder="e.g., 50"
                inputMode="numeric"
                pattern="\d{1,3}"
                maxLength={3}
                aria-describedby="house-hint"
              />
              <p id="house-hint" className="mt-1 text-xs text-gray-500">
                Up to 3 digits (e.g., 7, 25, 120).
              </p>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium">
                Notes (optional)
              </label>
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
              <span className="text-gray-500">
                {addrMsg || "Checking address…"}
              </span>
            )}
            {addrValidity === "valid" && (
              <span className="text-green-600">Address OK ✓</span>
            )}
            {addrValidity === "invalid" && (
              <span className="text-red-600">
                {addrMsg ||
                  "Could not validate now (rate limit or network). Try again."}
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={!canCreate}
              onClick={submit}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
              title={
                !canCreate
                  ? "Fill all fields and pick a valid address"
                  : "Create"
              }
            >
              Create request
            </button>
          </div>
        </div>

        {/* styles for mini-map locate button & pulse marker */}
        <style>{`
          /* custom locate control button (aligned with main map styling) */
          .leaflet-control-locate {
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
            border-radius: 9999px;
            background: transparent;
            margin-top: 40px;   /* sit under zoom +/- in small map */
            margin-left: 10px;
          }

          .locate-btn-el {
            display:flex;
            align-items:center;
            justify-content:center;
            width:32px;
            height:32px;
            border-radius:9999px;
            background:#ffffff;
            border:1px solid #d1d5db;
            cursor:pointer;
            line-height:1;
            padding:0;

            color:#1f2937;
            box-shadow:0 2px 4px rgba(0,0,0,0.08);
            transition:background .12s, box-shadow .12s, border-color .12s;
          }

          .locate-btn-el:hover {
            background:#f9fafb;
            border-color:#9ca3af;
            box-shadow:0 3px 6px rgba(0,0,0,0.12);
          }

          /* "you are here" animated blue dot */
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
            left:50%;
            top:50%;
            width:14px;
            height:14px;
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
        `}</style>
      </div>
    </div>
  );
}
