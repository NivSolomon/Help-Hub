import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { saveOnboardingProfile } from "../lib/users";
import type { UserProfile } from "../lib/users";
import { API_BASE } from "../lib/api";

type Props = {
  uid: string;
  onSaved: () => void;
  onClose?: () => void; // mostly for dev/debug; in prod we probably force completion
  initialProfile?: Partial<UserProfile> | null;
};

// utility: today minus N years
function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

type Validity = "idle" | "checking" | "valid" | "invalid";

type CitySuggestion = {
  label: string;
  bbox?: [number, number, number, number];
};

type StreetSuggestion = {
  label: string;
};

const ADDRESS_COUNTRY = "il";
const ADDRESS_HEADERS = { Accept: "application/json" } as const;
const ADDRESS_ENDPOINTS = new Set(["search"]);
const addressCache = new Map<string, unknown>();

async function fetchGeoJson(url: URL, abort?: AbortSignal) {
  const endpoint = url.pathname.split("/").pop();
  if (!endpoint || !ADDRESS_ENDPOINTS.has(endpoint)) {
    throw new Error(`Unsupported geocoding endpoint: ${url.pathname}`);
  }

  const proxyUrl = new URL(`${API_BASE}/geo/${endpoint}`);
  url.searchParams.forEach((value, key) => {
    proxyUrl.searchParams.set(key, value);
  });

  const key = proxyUrl.toString();
  if (addressCache.has(key)) return addressCache.get(key);

  const attempt = async (tries = 2): Promise<unknown> => {
    const res = await fetch(key, { headers: ADDRESS_HEADERS, signal: abort });
    if (res.status === 429 || res.status === 503) {
      if (tries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return attempt(tries - 1);
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Geocode HTTP ${res.status} ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    addressCache.set(key, json);
    return json;
  };

  return attempt();
}

function shortName(x: any): string {
  const a = x?.address ?? {};
  const first =
    a.road ||
    a.pedestrian ||
    x?.display_name?.split?.(",")?.[0] ||
    a.city ||
    a.town ||
    a.village ||
    "";
  const city = a.city || a.town || a.village || a.municipality || "";
  return city && first && first !== city ? `${first}, ${city}` : first || city;
}

function useDebounced<T extends (...args: any[]) => void>(fn: T, ms: number) {
  const timer = useRef<number | undefined>(undefined);
  return useCallback(
    (...args: Parameters<T>) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => fn(...args), ms);
    },
    [fn, ms]
  );
}

export default function OnboardingPrompt({
  uid,
  onSaved,
  onClose,
  initialProfile,
}: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [phone, setPhone] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [bio, setBio] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const prefilledRef = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<
        "firstName" | "lastName" | "birthdate" | "phone" | "address" | "bio",
        string
      >
    >
  >({});
  const [addrValidity, setAddrValidity] = useState<Validity>("idle");
  const [addrMessage, setAddrMessage] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<StreetSuggestion[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);
  const addrAbortRef = useRef<AbortController | null>(null);
  const cityAbortRef = useRef<AbortController | null>(null);
  const streetAbortRef = useRef<AbortController | null>(null);
  const addrLastValidatedRef = useRef<{ city: string; street: string } | null>(null);
  const cityBBoxRef = useRef<[number, number, number, number] | null>(null);
  const cityContainerRef = useRef<HTMLDivElement | null>(null);
  const streetContainerRef = useRef<HTMLDivElement | null>(null);

  // lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (prefilledRef.current) return;
    if (!initialProfile) return;

    if (initialProfile.firstName) {
      setFirstName(initialProfile.firstName ?? "");
    }

    if (initialProfile.lastName) {
      setLastName(initialProfile.lastName ?? "");
    } else if (initialProfile.displayName) {
      const [first, ...rest] = initialProfile.displayName.split(" ").filter(Boolean);
      if (!initialProfile.firstName && first && !firstName) {
        setFirstName(first);
      }
      if (!initialProfile.lastName && rest.length && !lastName) {
        setLastName(rest.join(" "));
      }
    }

    if (initialProfile.phone) {
      setPhone(initialProfile.phone ?? "");
    }

    if (initialProfile.address) {
      const prefillAddress = (initialProfile.address ?? "").trim();
      if (prefillAddress) {
        const parts = prefillAddress.split(",").map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2) {
          setAddressStreet(parts[0]);
          setAddressCity(parts.slice(1).join(", "));
          addrLastValidatedRef.current = {
            street: parts[0],
            city: parts.slice(1).join(", "),
          };
          setAddrValidity("valid");
          setAddrMessage("Address confirmed.");
        } else {
          setAddressStreet(prefillAddress);
        }
      }
    }

    if (initialProfile.bio) {
      setBio(initialProfile.bio ?? "");
    }

    if (initialProfile.birthdateISO) {
      const parsed = new Date(initialProfile.birthdateISO);
      if (!Number.isNaN(parsed.getTime())) {
        setBirthdate(parsed);
      }
    }

    prefilledRef.current = true;
  }, [initialProfile, firstName, lastName]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const insideCity =
        cityContainerRef.current &&
        target &&
        cityContainerRef.current.contains(target);
      const insideStreet =
        streetContainerRef.current &&
        target &&
        streetContainerRef.current.contains(target);

      if (!insideCity) {
        setShowCitySuggestions(false);
      }
      if (!insideStreet) {
        setShowStreetSuggestions(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const fetchCitySuggestions = useCallback(
    async (query: string) => {
      cityAbortRef.current?.abort();

      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setCitySuggestions([]);
        setCityLoading(false);
        return;
      }

      const controller = new AbortController();
      cityAbortRef.current = controller;
      setCityLoading(true);

      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", trimmed);
        url.searchParams.set("limit", "5");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("countrycodes", ADDRESS_COUNTRY);

        const data = (await fetchGeoJson(
          url,
          controller.signal
        )) as unknown as any[];
        if (controller.signal.aborted) return;

        const suggestions: CitySuggestion[] = (Array.isArray(data) ? data : [])
          .map((entry) => {
            const label =
              entry?.address?.city ||
              entry?.address?.town ||
              entry?.address?.village ||
              entry?.address?.municipality ||
              shortName(entry);
            if (!label) return null;

            let bbox: [number, number, number, number] | undefined;
            if (
              Array.isArray(entry.boundingbox) &&
              entry.boundingbox.length === 4
            ) {
              const [south, north, west, east] = entry.boundingbox.map(Number);
              bbox = [west, south, east, north];
            }

            return { label, bbox } as CitySuggestion;
          })
          .filter(Boolean)
          .slice(0, 5) as CitySuggestion[];

        setCitySuggestions(suggestions);
        setShowCitySuggestions(suggestions.length > 0);
        if (suggestions.length === 0) {
          setAddrMessage("No matching cities yet. Try refining your search.");
        } else {
          setAddrMessage("");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("City suggestions failed:", err);
        setCitySuggestions([]);
        setAddrMessage("Couldn't reach the map right now. Try again.");
      } finally {
        if (!controller.signal.aborted) {
          setCityLoading(false);
          cityAbortRef.current = null;
        }
      }
    },
    []
  );

  const fetchStreetSuggestions = useCallback(
    async (query: string, city: string) => {
      streetAbortRef.current?.abort();

      const trimmedStreet = query.trim();
      const trimmedCity = city.trim();
      if (trimmedStreet.length < 3 || trimmedCity.length < 2) {
        setStreetSuggestions([]);
        setStreetLoading(false);
        return;
      }

      const controller = new AbortController();
      streetAbortRef.current = controller;
      setStreetLoading(true);

      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", `${trimmedStreet} ${trimmedCity}`);
        url.searchParams.set("limit", "5");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("countrycodes", ADDRESS_COUNTRY);

        const bbox = cityBBoxRef.current;
        if (bbox) {
          const [west, south, east, north] = bbox;
          url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
          url.searchParams.set("bounded", "1");
        }

        const data = (await fetchGeoJson(
          url,
          controller.signal
        )) as unknown as any[];
        if (controller.signal.aborted) return;

        const suggestions: StreetSuggestion[] = (Array.isArray(data)
          ? data
          : [])
          .map((entry) => {
            const a = entry?.address ?? {};
            const road =
              a.road ||
              a.pedestrian ||
              a.cycleway ||
              a.footway ||
              shortName(entry);
            const number = a.house_number;
            const label = [road, number].filter(Boolean).join(" ");
            return label ? { label } : null;
          })
          .filter(Boolean)
          .slice(0, 5) as StreetSuggestion[];

        setStreetSuggestions(suggestions);
        setShowStreetSuggestions(suggestions.length > 0);
        if (suggestions.length === 0) {
          setAddrMessage("No street match yet. Try a nearby landmark.");
        } else {
          setAddrMessage("");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Street suggestions failed:", err);
        setStreetSuggestions([]);
        setAddrMessage("Couldn't reach the map right now. Try again.");
      } finally {
        if (!controller.signal.aborted) {
          setStreetLoading(false);
          streetAbortRef.current = null;
        }
      }
    },
    []
  );

  const debouncedFetchCity = useDebounced(fetchCitySuggestions, 300);
  const debouncedFetchStreet = useDebounced(
    (street: string, city: string) => fetchStreetSuggestions(street, city),
    350
  );

  const runAddressValidation = useCallback(
    async (city: string, street: string) => {
      const trimmedCity = city.trim();
      const trimmedStreet = street.trim();

      if (!trimmedCity || !trimmedStreet) {
        setAddrValidity("invalid");
        setAddrMessage("City and street are both required.");
        return false;
      }

      const last = addrLastValidatedRef.current;
      if (last && last.city === trimmedCity && last.street === trimmedStreet) {
        setAddrValidity("valid");
        setAddrMessage("Address confirmed.");
        return true;
      }

      addrAbortRef.current?.abort();
      const controller = new AbortController();
      addrAbortRef.current = controller;
      setAddrValidity("checking");
      setAddrMessage("Checking address…");
      setStreetLoading(true);

      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", `${trimmedStreet} ${trimmedCity}`);
        url.searchParams.set("limit", "1");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("countrycodes", ADDRESS_COUNTRY);

        const bbox = cityBBoxRef.current;
        if (bbox) {
          const [west, south, east, north] = bbox;
          url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
          url.searchParams.set("bounded", "1");
        }

        const data = (await fetchGeoJson(
          url,
          controller.signal
        )) as unknown as any[];
        if (controller.signal.aborted) return false;

        if (!Array.isArray(data) || data.length === 0) {
          setAddrValidity("invalid");
          setAddrMessage("We couldn't find that address. Try another detail.");
          return false;
        }

        const hit = data[0];
        const a = hit?.address ?? {};
        const normalizedCity =
          a.city || a.town || a.village || a.municipality || trimmedCity;
        const road =
          a.road ||
          a.pedestrian ||
          a.cycleway ||
          a.footway ||
          trimmedStreet.split(" ")[0];
        const number =
          a.house_number || trimmedStreet.split(" ").slice(1).join(" ");
        const normalizedStreet = [road, number].filter(Boolean).join(" ").trim();

        setAddressCity(normalizedCity);
        setAddressStreet(normalizedStreet || trimmedStreet);
        addrLastValidatedRef.current = {
          city: normalizedCity,
          street: normalizedStreet || trimmedStreet,
        };
        setAddrValidity("valid");
        setAddrMessage("Address confirmed.");
        setFieldErrors((prev) => {
          if (!prev.address) return prev;
          const next = { ...prev };
          delete next.address;
          return next;
        });
        setError((prev) =>
          prev === "Please fix the highlighted fields and try again." ? "" : prev
        );
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        console.error("Address validation failed:", err);
        setAddrValidity("invalid");
        setAddrMessage("Couldn't validate now. Please try again.");
        return false;
      } finally {
        if (!controller.signal.aborted) {
          addrAbortRef.current = null;
          setStreetLoading(false);
        }
      }
    },
    []
  );

  const handleCityChange = useCallback(
    (value: string) => {
      setAddressCity(value);
      setAddrValidity("idle");
      setAddrMessage("");
      addrLastValidatedRef.current = null;
      cityBBoxRef.current = null;

      setFieldErrors((prev) => {
        if (!prev.address) return prev;
        const next = { ...prev };
        delete next.address;
        return next;
      });

      if (value.trim().length >= 2) {
        setCityLoading(true);
        debouncedFetchCity(value);
      } else {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
        setCityLoading(false);
      }
    },
    [debouncedFetchCity]
  );

  const handleCitySuggestion = useCallback((suggestion: CitySuggestion) => {
    setAddressCity(suggestion.label);
    cityBBoxRef.current = suggestion.bbox ?? null;
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    setCityLoading(false);
    setAddrValidity("idle");
    setAddrMessage("");
    addrLastValidatedRef.current = null;
    setFieldErrors((prev) => {
      if (!prev.address) return prev;
      const next = { ...prev };
      delete next.address;
      return next;
    });
  }, []);

  const handleCityBlur = useCallback(() => {
    window.setTimeout(() => setShowCitySuggestions(false), 120);
  }, []);

  const handleCityFocus = useCallback(() => {
    if (citySuggestions.length > 0) {
      setShowCitySuggestions(true);
    } else if (addressCity.trim().length >= 2) {
      setCityLoading(true);
      debouncedFetchCity(addressCity);
    }
  }, [addressCity, citySuggestions.length, debouncedFetchCity]);

  const handleStreetChange = useCallback(
    (value: string) => {
      setAddressStreet(value);
      setAddrValidity("idle");
      setAddrMessage("");
      addrLastValidatedRef.current = null;

      setFieldErrors((prev) => {
        if (!prev.address) return prev;
        const next = { ...prev };
        delete next.address;
        return next;
      });

      if (value.trim().length >= 3 && addressCity.trim().length >= 2) {
        setStreetLoading(true);
        debouncedFetchStreet(value, addressCity);
      } else {
        setStreetSuggestions([]);
        setShowStreetSuggestions(false);
        setStreetLoading(false);
      }
    },
    [addressCity, debouncedFetchStreet]
  );

  const handleStreetSuggestion = useCallback(
    (suggestion: StreetSuggestion) => {
      setAddressStreet(suggestion.label);
      setStreetSuggestions([]);
      setShowStreetSuggestions(false);
      setStreetLoading(false);
      setAddrValidity("idle");
      setAddrMessage("");
      addrLastValidatedRef.current = null;
      setFieldErrors((prev) => {
        if (!prev.address) return prev;
        const next = { ...prev };
        delete next.address;
        return next;
      });
    },
    []
  );

  const handleStreetBlur = useCallback(() => {
    window.setTimeout(() => setShowStreetSuggestions(false), 120);
    runAddressValidation(addressCity, addressStreet);
  }, [addressCity, addressStreet, runAddressValidation]);

  const handleStreetFocus = useCallback(() => {
    if (streetSuggestions.length > 0) {
      setShowStreetSuggestions(true);
    } else if (
      addressStreet.trim().length >= 3 &&
      addressCity.trim().length >= 2
    ) {
      setStreetLoading(true);
      debouncedFetchStreet(addressStreet, addressCity);
    }
  }, [addressCity, addressStreet, debouncedFetchStreet, streetSuggestions.length]);

  // ------------------
  // validation helpers
  // ------------------

  function validateBirthdate(d: Date | null): string | null {
    if (!d) return "Birth date is required";
    const now = new Date();
    if (d > now) return "Birth date cannot be in the future";

    // must be >= 13 years old
    const minAllowed = yearsAgo(13);
    if (d > minAllowed) return "You must be at least 13";

    // block totally unrealistic ages >120
    const maxAllowed = yearsAgo(120);
    if (d < maxAllowed) return "Please enter a valid birth year";

    return null;
  }

  function validate() {
    const errors: Partial<
      Record<
        "firstName" | "lastName" | "birthdate" | "phone" | "address" | "bio",
        string
      >
    > = {};

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      errors.firstName = "First name is required";
    } else if (trimmedFirst.length < 2) {
      errors.firstName = "First name must be at least 2 characters";
    } else if (/\d/.test(trimmedFirst)) {
      errors.firstName = "First name cannot include numbers";
    }

    const trimmedLast = lastName.trim();
    if (!trimmedLast) {
      errors.lastName = "Last name is required";
    } else if (trimmedLast.length < 2) {
      errors.lastName = "Last name must be at least 2 characters";
    } else if (/\d/.test(trimmedLast)) {
      errors.lastName = "Last name cannot include numbers";
    }

    const bErr = validateBirthdate(birthdate);
    if (bErr) {
      errors.birthdate = bErr;
    }

    const trimmedPhone = phone.trim();
    const phoneDigits = trimmedPhone.replace(/\D/g, "");
    if (!trimmedPhone) {
      errors.phone = "Phone number is required";
    } else if (phoneDigits.length < 8) {
      errors.phone = "Phone number must include at least 8 digits";
    } else if (phoneDigits.length > 15) {
      errors.phone = "Phone number must include at most 15 digits";
    }

    const trimmedAddress = addressCity.trim();
    if (!trimmedAddress) {
      errors.address = "City is required";
    } else if (addrValidity === "invalid") {
      errors.address = addrMessage || "Please enter a valid city";
    } else if (addrValidity !== "valid") {
      errors.address = "Please select one of the suggestions to confirm.";
    }

    const trimmedStreet = addressStreet.trim();
    if (!trimmedStreet) {
      errors.address = "Street is required";
    } else if (addrValidity === "invalid") {
      errors.address = addrMessage || "Please enter a valid street";
    } else if (addrValidity !== "valid") {
      errors.address = "Please select one of the suggestions to confirm.";
    }

    const trimmedBio = bio.trim();
    if (trimmedBio.length > 280) {
      errors.bio = "Bio must be 280 characters or fewer";
    }

    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const validationErrors = validate();

    if (
      validationErrors.address &&
      addressCity.trim() &&
      addressStreet.trim() &&
      addrValidity !== "valid"
    ) {
      const ok = await runAddressValidation(addressCity, addressStreet);
      if (ok) {
        delete validationErrors.address;
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setSaving(false);
      setFieldErrors(validationErrors);
      setError("Please fix the highlighted fields and try again.");
      return;
    }

    setFieldErrors({});

    try {
      const birthIso = birthdate!.toISOString().slice(0, 10); // yyyy-mm-dd

      const trimmedBio = bio.trim();

      await saveOnboardingProfile(uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthdateISO: birthIso,
        phone: phone.trim(),
        address: `${addressCity.trim()}, ${addressStreet.trim()}`,
        bio: trimmedBio ? trimmedBio : undefined,
      });

      onSaved();
    } catch (err) {
      console.error("saveOnboardingProfile failed:", err);
      setError("Could not save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ------------------
  // modal layout
  // ------------------

  const modal = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="grid w-full max-w-4xl max-h-[calc(100vh-3rem)] grid-cols-1 overflow-hidden overflow-y-auto rounded-3xl bg-white shadow-2xl md:grid-cols-[260px_1fr]">
        <aside className="hidden h-full flex-col bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-400 p-6 text-indigo-50 md:flex">
          <div className="space-y-6">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-indigo-100/90">
                Welcome
              </div>
              <h2 className="mt-3 text-2xl font-semibold leading-tight text-white">
                Finish setting up your account
              </h2>
              <p className="mt-3 text-sm text-indigo-50/90">
                Share a few details so neighbours recognise you and trust matches faster.
              </p>
            </div>
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 text-base font-semibold text-white">
                  1
                </span>
                <div>
                  <div className="font-semibold text-white">Basic profile</div>
                  <p className="text-xs text-indigo-50/80">
                    Your name helps introduce you to neighbours.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-base font-semibold text-white">
                  2
                </span>
                <div>
                  <div className="font-semibold text-white">Location</div>
                  <p className="text-xs text-indigo-50/80">
                    We only show requests close to you.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base font-semibold text-white">
                  3
                </span>
                <div>
                  <div className="font-semibold text-white">
                    Introduce yourself
                  </div>
                  <p className="text-xs text-indigo-50/80">
                    Let others know how you like to help.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <div className="flex min-h-0 flex-col bg-white">
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="onboarding-title"
                  className="text-xl font-semibold text-slate-900 sm:text-2xl"
                >
                  Tell us about yourself
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  We only ask this once. People you help will see your first
                  name and phone.
                </p>
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                >
                  Skip for now
                </button>
              )}
            </div>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-indigo-200 sm:px-8 sm:py-7"
          >
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    First name
                  </label>
                  <input
                    className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      fieldErrors.firstName
                        ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                        : ""
                    }`}
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (fieldErrors.firstName) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.firstName;
                          return next;
                        });
                      }
                      if (error) setError("");
                    }}
                    placeholder="e.g. Dana"
                    aria-invalid={fieldErrors.firstName ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.firstName ? "first-name-error" : undefined
                    }
                  />
                  {fieldErrors.firstName && (
                    <p
                      id="first-name-error"
                      className="mt-1 text-xs text-red-600"
                    >
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Last name
                  </label>
                  <input
                    className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      fieldErrors.lastName
                        ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                        : ""
                    }`}
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (fieldErrors.lastName) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.lastName;
                          return next;
                        });
                      }
                      if (error) setError("");
                    }}
                    placeholder="e.g. Cohen"
                    aria-invalid={fieldErrors.lastName ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.lastName ? "last-name-error" : undefined
                    }
                  />
                  {fieldErrors.lastName && (
                    <p id="last-name-error" className="mt-1 text-xs text-red-600">
                      {fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Birth date
                </label>
                <DatePicker
                  selected={birthdate}
                  onChange={(d) => {
                    setBirthdate(d);
                    if (fieldErrors.birthdate) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.birthdate;
                        return next;
                      });
                    }
                    if (error) setError("");
                  }}
                  maxDate={yearsAgo(13)}
                  minDate={yearsAgo(120)}
                  showYearDropdown
                  scrollableYearDropdown
                  yearDropdownItemNumber={120}
                  placeholderText="Select your date of birth"
                  className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    fieldErrors.birthdate
                      ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                      : ""
                  }`}
                  dateFormat="yyyy-MM-dd"
                  isClearable={false}
                  required
                  aria-invalid={fieldErrors.birthdate ? "true" : "false"}
                />
                {fieldErrors.birthdate && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.birthdate}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Phone number
                </label>
                <input
                  className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    fieldErrors.phone
                      ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                      : ""
                  }`}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.phone;
                        return next;
                      });
                    }
                    if (error) setError("");
                  }}
                  placeholder="+1 555 123 4567"
                  inputMode="tel"
                  aria-invalid={fieldErrors.phone ? "true" : "false"}
                  aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Shared only with people you’re matched with to help.
                </p>
                {fieldErrors.phone && (
                  <p id="phone-error" className="mt-1 text-xs text-red-600">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              <div ref={cityContainerRef} className="relative">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  City
                </label>
                <div className="relative">
                  <input
                    className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      fieldErrors.address || addrValidity === "invalid"
                        ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                        : ""
                    } ${
                      addrValidity === "valid"
                        ? "border-emerald-400 focus:border-emerald-400 focus:ring-emerald-200"
                        : ""
                    }`}
                    value={addressCity}
                    onChange={(e) => {
                      handleCityChange(e.target.value);
                      if (fieldErrors.address) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.address;
                          return next;
                        });
                      }
                      if (error) setError("");
                    }}
                    onBlur={handleCityBlur}
                    onFocus={handleCityFocus}
                    placeholder="e.g. Tel Aviv"
                    aria-invalid={
                      fieldErrors.address || addrValidity === "invalid"
                        ? "true"
                        : "false"
                    }
                    aria-describedby={
                      fieldErrors.address ? "address-error" : undefined
                    }
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    {cityLoading && (
                      <svg
                        className="h-4 w-4 animate-spin text-indigo-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                        />
                        <path
                          className="opacity-75"
                          d="M4 12a8 8 0 018-8"
                        />
                      </svg>
                    )}
                    {!cityLoading && addrValidity === "valid" && (
                      <svg
                        className="h-4 w-4 text-emerald-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879A1 1 0 003.293 9.293l4 4a1 1 0 001.414 0l7-7z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {!cityLoading && addrValidity === "invalid" && (
                      <svg
                        className="h-4 w-4 text-red-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11a.75.75 0 111.5 0v4.5a.75.75 0 01-1.5 0V7zm.75 7a1 1 0 100-2 1 1 0 000 2z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                {showCitySuggestions && citySuggestions.length > 0 && (
                  <ul className="absolute z-30 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                    {citySuggestions.map((sug, index) => (
                      <li key={`${sug.label}-${index}`}>
                        <button
                          type="button"
                          className="block w-full px-3.5 py-2.5 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleCitySuggestion(sug);
                          }}
                        >
                          <span className="block font-medium text-slate-900">
                            {sug.label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Used to show nearby requests. Don’t include apartment # if you
                  don’t want to.
                </p>
                {addrMessage && (
                  <p
                    className={`mt-1 text-xs ${
                      addrValidity === "valid"
                        ? "text-emerald-600"
                        : addrValidity === "invalid"
                        ? "text-red-600"
                        : "text-slate-500"
                    }`}
                  >
                    {addrMessage}
                  </p>
                )}
                {fieldErrors.address && (
                  <p id="address-error" className="mt-1 text-xs text-red-600">
                    {fieldErrors.address}
                  </p>
                )}
              </div>

              <div ref={streetContainerRef} className="relative">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Street
                </label>
                <div className="relative">
                  <input
                    className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      fieldErrors.address || addrValidity === "invalid"
                        ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                        : ""
                    } ${
                      addrValidity === "valid"
                        ? "border-emerald-400 focus:border-emerald-400 focus:ring-emerald-200"
                        : ""
                    }`}
                    value={addressStreet}
                    onChange={(e) => {
                      handleStreetChange(e.target.value);
                      if (fieldErrors.address) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.address;
                          return next;
                        });
                      }
                      if (error) setError("");
                    }}
                    onBlur={handleStreetBlur}
                    onFocus={handleStreetFocus}
                    placeholder="e.g. Ha-Hamama St"
                    aria-invalid={
                      fieldErrors.address || addrValidity === "invalid"
                        ? "true"
                        : "false"
                    }
                    aria-describedby={
                      fieldErrors.address ? "address-error" : undefined
                    }
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    {streetLoading && (
                      <svg
                        className="h-4 w-4 animate-spin text-indigo-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                        />
                        <path
                          className="opacity-75"
                          d="M4 12a8 8 0 018-8"
                        />
                      </svg>
                    )}
                    {!streetLoading && addrValidity === "valid" && (
                      <svg
                        className="h-4 w-4 text-emerald-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879A1 1 0 003.293 9.293l4 4a1 1 0 001.414 0l7-7z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {!streetLoading && addrValidity === "invalid" && (
                      <svg
                        className="h-4 w-4 text-red-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11a.75.75 0 111.5 0v4.5a.75.75 0 01-1.5 0V7zm.75 7a1 1 0 100-2 1 1 0 000 2z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                {showStreetSuggestions && streetSuggestions.length > 0 && (
                  <ul className="absolute z-30 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                    {streetSuggestions.map((sug, index) => (
                      <li key={`${sug.label}-${index}`}>
                        <button
                          type="button"
                          className="block w-full px-3.5 py-2.5 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleStreetSuggestion(sug);
                          }}
                        >
                          <span className="block font-medium text-slate-900">
                            {sug.label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Used to show nearby requests. Don’t include apartment # if you
                  don’t want to.
                </p>
                {addrMessage && (
                  <p
                    className={`mt-1 text-xs ${
                      addrValidity === "valid"
                        ? "text-emerald-600"
                        : addrValidity === "invalid"
                        ? "text-red-600"
                        : "text-slate-500"
                    }`}
                  >
                    {addrMessage}
                  </p>
                )}
                {fieldErrors.address && (
                  <p id="address-error" className="mt-1 text-xs text-red-600">
                    {fieldErrors.address}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Bio (optional)
                </label>
                <textarea
                  className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    fieldErrors.bio
                      ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                      : ""
                  }`}
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    if (fieldErrors.bio) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.bio;
                        return next;
                      });
                    }
                    if (error) setError("");
                  }}
                  placeholder="Share a bit about how you like to help others."
                  maxLength={280}
                  rows={4}
                  aria-invalid={fieldErrors.bio ? "true" : "false"}
                  aria-describedby={fieldErrors.bio ? "bio-error" : "bio-help"}
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span id="bio-help">{bio.length}/280 characters.</span>
                  <span>Keep it friendly and short.</span>
                </div>
                {fieldErrors.bio && (
                  <p id="bio-error" className="mt-1 text-xs text-red-600">
                    {fieldErrors.bio}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p className="mt-6 rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">
                Your details stay private until you match with someone.
              </span>
              <div className="flex justify-end gap-2">
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Saving…" : "Save & continue"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
