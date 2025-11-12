import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
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
import { motion } from "framer-motion";

import { createRequest } from "../lib/requests";
import { auth } from "../lib/firebase";
import { CATEGORIES, type Category } from "../lib/types";

const CATEGORY_META: Record<
  Category,
  { label: string; helper: string; icon: string; tone: string }
> = {
  errand: {
    label: "Errand",
    helper: "Quick pickups or deliveries",
    icon: "📦",
    tone: "bg-amber-100 text-amber-700",
  },
  carry: {
    label: "Carry / Move",
    helper: "Lift or move something heavy",
    icon: "💪",
    tone: "bg-blue-100 text-blue-700",
  },
  fix: {
    label: "Fix",
    helper: "Repair or troubleshoot",
    icon: "🛠️",
    tone: "bg-emerald-100 text-emerald-700",
  },
  other: {
    label: "Other",
    helper: "Anything else",
    icon: "✨",
    tone: "bg-purple-100 text-purple-700",
  },
};

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
  useEffect(() => {
    return () => {
      cityAbortRef.current?.abort();
      streetAbortRef.current?.abort();
    };
  }, []);

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
  const [cityLoading, setCityLoading] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const [streetError, setStreetError] = useState<string | null>(null);
  const [cityActiveIndex, setCityActiveIndex] = useState(-1);
  const [streetActiveIndex, setStreetActiveIndex] = useState(-1);

  // Selected city bbox
  const cityBBoxRef = useRef<[number, number, number, number] | null>(null);
  const cityAbortRef = useRef<AbortController | null>(null);
  const streetAbortRef = useRef<AbortController | null>(null);

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

  const handleLocate = useCallback(
    (loc: LatLng) => {
      setMyLoc(loc);
      onPickFromMap(loc);
    },
    [onPickFromMap]
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
  useEffect(() => {
    setCityActiveIndex((prev) => {
      if (citySugs.length === 0) return -1;
      return prev >= 0 && prev < citySugs.length ? prev : 0;
    });
  }, [citySugs]);
  useEffect(() => {
    setStreetActiveIndex((prev) => {
      if (streetSugs.length === 0) return -1;
      return prev >= 0 && prev < streetSugs.length ? prev : 0;
    });
  }, [streetSugs]);

  /* ── Autocomplete ── */

  const debouncedFetchCity = useDebounced(async (q: string) => {
    cityAbortRef.current?.abort();

    if (q.length < 2) {
      setCitySugs([]);
      setCityLoading(false);
      setCityError(null);
      return;
    }

    const controller = new AbortController();
    cityAbortRef.current = controller;
    setCityLoading(true);
    setCityError(null);

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", COUNTRY);

      const arr = (await fetchJson(url, controller.signal)) as any[];
      if (controller.signal.aborted) return;

      const lowercase = q.toLowerCase();
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
        .filter((s) => s.label && s.label.toLowerCase().includes(lowercase))
        .slice(0, 5);

      setCitySugs(sugs);
      if (sugs.length === 0) {
        cityBBoxRef.current = null;
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setCityError("Couldn't load cities. Try again.");
      setCitySugs([]);
    } finally {
      if (!controller.signal.aborted) {
        setCityLoading(false);
      }
    }
  }, 300);

  const debouncedFetchStreet = useDebounced(async (q: string, city: string) => {
    streetAbortRef.current?.abort();

    if (q.length < 2 || city.trim().length < 2) {
      setStreetSugs([]);
      setStreetLoading(false);
      setStreetError(null);
      return;
    }

    const controller = new AbortController();
    streetAbortRef.current = controller;
    setStreetLoading(true);
    setStreetError(null);

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

      const arr = (await fetchJson(url, controller.signal)) as any[];
      if (controller.signal.aborted) return;

      const sugs: Suggestion[] = (arr || [])
        .map((x) => ({
          label: x.address?.road || shortName(x),
          lat: x.lat ? Number(x.lat) : undefined,
          lon: x.lon ? Number(x.lon) : undefined,
        }))
        .filter((s) => s.label)
        .slice(0, 5);

      setStreetSugs(sugs);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStreetError("Couldn't load streets. Try again.");
      setStreetSugs([]);
    } finally {
      if (!controller.signal.aborted) {
        setStreetLoading(false);
      }
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
    setCityError(null);
    cityAbortRef.current?.abort();
    if (v.length >= 2) {
      debouncedFetchCity(v);
    } else {
      setCitySugs([]);
      setCityLoading(false);
    }
    streetAbortRef.current?.abort();
    setShowStreetSugs(false);
    setStreetActiveIndex(-1);
    setStreetSugs([]);
    setStreetLoading(false);
    setStreetError(null);
  }
  function onStreetChange(v: string) {
    userEdit("street", v);
    setShowStreetSugs(true);
    setStreetError(null);
    streetAbortRef.current?.abort();
    if (v.length >= 2 && address.city.trim().length >= 2) {
      debouncedFetchStreet(v, address.city);
    } else {
      setStreetSugs([]);
      setStreetLoading(false);
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
    setCityError(null);
    setCityActiveIndex(-1);
    cityAbortRef.current?.abort();
    setCityLoading(false);

    if (s.bbox) {
      cityBBoxRef.current = s.bbox;
    }
    if (s.lat && s.lon) {
      const loc = { lat: s.lat, lng: s.lon };
      setPicked((prev) => (prev && metersBetween(prev, loc) < 10 ? prev : loc));
    }

    streetAbortRef.current?.abort();
    setStreetActiveIndex(-1);
    if (address.street.trim().length >= 2) {
      setShowStreetSugs(true);
      setStreetLoading(true);
      setStreetError(null);
      setStreetSugs([]);
      debouncedFetchStreet(address.street, s.label);
    } else {
      setShowStreetSugs(false);
      setStreetSugs([]);
      setStreetLoading(false);
    }
  }
  function applyStreetSuggestion(s: Suggestion) {
    userEdit("street", s.label);
    setShowStreetSugs(false);
    setStreetError(null);
    setStreetActiveIndex(-1);
    streetAbortRef.current?.abort();
    setStreetLoading(false);
    setStreetSugs([]);
    if (s.lat && s.lon) onPickFromMap({ lat: s.lat, lng: s.lon });
  }
  function handleCityKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowCitySugs(false);
      return;
    }
    if (citySugs.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowCitySugs(true);
      setCityActiveIndex((prev) => {
        const next = prev + 1;
        return next >= citySugs.length ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setShowCitySugs(true);
      setCityActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? citySugs.length - 1 : next;
      });
    } else if (e.key === "Enter" && cityActiveIndex >= 0) {
      e.preventDefault();
      applyCitySuggestion(citySugs[cityActiveIndex]);
    }
  }
  function handleStreetKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowStreetSugs(false);
      return;
    }
    if (streetSugs.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowStreetSugs(true);
      setStreetActiveIndex((prev) => {
        const next = prev + 1;
        return next >= streetSugs.length ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setShowStreetSugs(true);
      setStreetActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? streetSugs.length - 1 : next;
      });
    } else if (e.key === "Enter" && streetActiveIndex >= 0) {
      e.preventDefault();
      applyStreetSuggestion(streetSugs[streetActiveIndex]);
    }
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
    <>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        className="fixed inset-0 z-[101] grid place-items-center px-4 py-6"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
      >
        <div className="relative flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-lg font-semibold text-gray-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-100"
          >
            ×
          </button>

          <div className="flex flex-1 flex-col gap-6 overflow-hidden p-6 sm:p-8">
            <header className="grid gap-2 rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-indigo-600 px-6 py-5 text-white shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/70">
                Create new request
              </p>
              <h2 className="text-2xl font-semibold sm:text-3xl">
                Let neighbors know how they can help
              </h2>
              <p className="text-sm text-white/80">
                Share the essentials and pin the spot. Keep it concise so helpers can respond fast.
              </p>
            </header>

            <div className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <section className="flex flex-col gap-5 overflow-y-auto pr-1">
                <div className="rounded-3xl border border-gray-100 bg-white/90 p-5 shadow-sm">
                  <div className="mb-4 space-y-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Title
                      </label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Pick up package from Dizengoff"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDesc(e.target.value)}
                        className="mt-2 h-28 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="What needs to happen, when, and any must-know details."
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Category
                      </label>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(Object.entries(CATEGORY_META) as Array<[
                          Category,
                          { label: string; helper: string; icon: string; tone: string },
                        ]>).map(([key, meta]) => {
                          const active = category === key;
                          return (
                            <motion.button
                              key={key}
                              type="button"
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setCategory(key)}
                              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left text-sm shadow-sm transition ${
                                active
                                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-indigo-200"
                              }`}
                            >
                              <span className={`inline-flex items-center gap-2 rounded-full px-2 py-[2px] text-[11px] ${meta.tone}`}>
                                <span>{meta.icon}</span>
                                {meta.label}
                              </span>
                              <span className="text-[11px] text-gray-500">
                                {meta.helper}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Reward (optional)
                      </label>
                      <input
                        value={reward}
                        onChange={(e) => setReward(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Coffee / 20₪"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-100 bg-white/90 p-5 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Where is the help needed?
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="relative">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        City
                      </label>
                      <input
                        value={address.city}
                        onChange={(e) => onCityChange(e.target.value)}
                        onKeyDown={handleCityKeyDown}
                        onFocus={() => address.city.length >= 2 && setShowCitySugs(true)}
                        onBlur={() => setTimeout(() => setShowCitySugs(false), 120)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="e.g., Tel Aviv"
                      />
                      {showCitySugs &&
                        (citySugs.length > 0 ||
                          cityLoading ||
                          cityError ||
                          (address.city.trim().length >= 2 && !cityLoading && !cityError)) && (
                          <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-2xl border border-gray-200 bg-white shadow-lg" role="listbox">
                            {cityLoading && (
                              <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>
                            )}
                            {!cityLoading && cityError && (
                              <li className="px-3 py-2 text-sm text-red-500">{cityError}</li>
                            )}
                            {!cityLoading &&
                              !cityError &&
                              citySugs.length === 0 &&
                              address.city.trim().length >= 2 && (
                                <li className="px-3 py-2 text-sm text-gray-500">No matches found</li>
                              )}
                            {citySugs.map((s, i) => (
                              <li
                                key={`${s.label}-${i}`}
                                className={`px-3 py-2 text-sm ${
                                  i === cityActiveIndex
                                    ? "cursor-pointer bg-indigo-100 font-medium text-indigo-700"
                                    : "cursor-pointer text-gray-700 hover:bg-indigo-50"
                                }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setCityActiveIndex(i)}
                                onClick={() => applyCitySuggestion(s)}
                                role="option"
                                aria-selected={i === cityActiveIndex}
                              >
                                {s.label}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>

                    <div className="relative">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Street
                      </label>
                      <input
                        value={address.street}
                        onChange={(e) => onStreetChange(e.target.value)}
                        onKeyDown={handleStreetKeyDown}
                        onFocus={() => address.street.length >= 2 && setShowStreetSugs(true)}
                        onBlur={() => setTimeout(() => setShowStreetSugs(false), 120)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="e.g., Dizengoff"
                      />
                      {showStreetSugs &&
                        (streetSugs.length > 0 ||
                          streetLoading ||
                          streetError ||
                          (address.street.trim().length >= 2 && address.city.trim().length >= 2 && !streetLoading && !streetError)) && (
                          <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-2xl border border-gray-200 bg-white shadow-lg" role="listbox">
                            {streetLoading && (
                              <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>
                            )}
                            {!streetLoading && streetError && (
                              <li className="px-3 py-2 text-sm text-red-500">{streetError}</li>
                            )}
                            {!streetLoading &&
                              !streetError &&
                              streetSugs.length === 0 &&
                              address.street.trim().length >= 2 &&
                              address.city.trim().length >= 2 && (
                                <li className="px-3 py-2 text-sm text-gray-500">No matches found</li>
                              )}
                            {streetSugs.map((s, i) => (
                              <li
                                key={`${s.label}-${i}`}
                                className={`px-3 py-2 text-sm ${
                                  i === streetActiveIndex
                                    ? "cursor-pointer bg-indigo-100 font-medium text-indigo-700"
                                    : "cursor-pointer text-gray-700 hover:bg-indigo-50"
                                }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setStreetActiveIndex(i)}
                                onClick={() => applyStreetSuggestion(s)}
                                role="option"
                                aria-selected={i === streetActiveIndex}
                              >
                                {s.label}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        House number
                      </label>
                      <input
                        value={address.houseNumber}
                        onChange={(e) => onHouseChange(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="e.g., 50"
                        inputMode="numeric"
                        pattern="\d{1,3}"
                        maxLength={3}
                        aria-describedby="house-hint"
                      />
                      <p id="house-hint" className="mt-2 text-xs text-gray-500">
                        Up to 3 digits (e.g., 7, 25, 120).
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Notes (optional)
                      </label>
                      <input
                        value={address.notes}
                        onChange={(e) => userEdit("notes", e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Entrance code, floor, pickup desk, etc."
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs">
                    {addrValidity === "checking" && (
                      <span className="text-gray-500">
                        {addrMsg || "Checking address…"}
                      </span>
                    )}
                    {addrValidity === "valid" && (
                      <span className="text-emerald-600">Address verified ✓</span>
                    )}
                    {addrValidity === "invalid" && (
                      <span className="text-red-500">
                        {addrMsg ||
                          "Could not validate now. Refine the details or try again."}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-4 overflow-hidden rounded-3xl border border-gray-100 bg-white/90 p-5 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Drop the pin where help is needed
                  </h3>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 h-[520px]">
                  <MapContainer
                    center={mapCenter}
                    zoom={14}
                    style={{ height: "100%", width: "100%" }}
                    className="rounded-2xl"
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <LocateControl userLoc={myLoc} onLocate={handleLocate} />
                    <FlyTo center={picked ?? myLoc} />
                    <ClickPicker onPick={onPickFromMap} />

                    {myLoc && <Marker position={[myLoc.lat, myLoc.lng]} icon={userDotIcon} />}
                    {picked && <Marker position={[picked.lat, picked.lng]} icon={pickIcon} />}
                  </MapContainer>
                </div>

                <div className="rounded-2xl bg-indigo-50/70 p-3 text-[11px] text-indigo-700">
                  {picked ? (
                    <span>
                      Pin set to {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}.
                    </span>
                  ) : (
                    <span>Tap the map to drop a pin.</span>
                  )}
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-3 rounded-3xl border border-gray-100 bg-white/90 px-6 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-gray-500">
                You can edit or cancel later from the home screen.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={onClose}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  disabled={!canCreate}
                  onClick={submit}
                  className="rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    !canCreate
                      ? "Fill all fields and pick a valid address"
                      : "Create request"
                  }
                >
                  Publish request
                </button>
              </div>
            </div>
          </div>

          <style>{`
            .leaflet-control-locate {
              box-shadow: 0 1px 3px rgba(0,0,0,0.15);
              border-radius: 9999px;
              background: transparent;
              margin-top: 40px;
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
      </motion.div>
    </>
  );
}
