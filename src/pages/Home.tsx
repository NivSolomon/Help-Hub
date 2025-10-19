import AuthGate from "../components/AuthGate";
import { useEffect, useMemo, useState } from "react";
import { listenRelevantRequests, acceptRequest, markDone } from "../lib/requests";
import type { HelpRequest } from "../lib/types";
import { CATEGORIES, type Category } from "../lib/types";
import NewRequestModal from "../components/NewRequestModal";
import MapView from "../components/MapView";
import ChatPanel from "../components/ChatPanel";
import { getOrCreateChat } from "../lib/chat";
import { haversineKm } from "../lib/geo";
import { useAuthUser } from "../lib/useAuthUser";

export default function Home() {
  const [items, setItems] = useState<HelpRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: 32.0853,
    lng: 34.7818, // Tel Aviv default
  });
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number }>();
  const [chatId, setChatId] = useState<string | null>(null);

  // Filters
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");

  const user = useAuthUser();
  const myId = user?.uid ?? null;

  async function openChatFor(req: HelpRequest) {
    if (!myId || !req.helperId) return;
    const other = req.requesterId === myId ? req.helperId : req.requesterId;

    try {
      if (!chatId) setChatId("pending");
      const chat = await getOrCreateChat(req.id, myId, other);
      setChatId(chat.id);
    } catch (e) {
      console.error("openChatFor failed:", e);
      setChatId(null);
      alert("Couldn't open chat. Please try again.");
    }
  }

  // Geo
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(c);
        setUserLoc(c);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // Subscribe to relevant requests (reactive to auth)
  useEffect(() => {
    const unsub = listenRelevantRequests(myId, setItems);
    return () => unsub();
  }, [myId]);

  // Derived: distance + category + radius + sorted
  const filtered = useMemo(() => {
    const withDist = items.map((r) => {
      const dist =
        userLoc && r.location ? haversineKm(userLoc, r.location) : null;
      return { ...r, __distanceKm: dist as number | null };
    });

    let arr =
      categoryFilter === "all"
        ? withDist
        : withDist.filter((r) => r.category === categoryFilter);

    // ALWAYS apply radius when we know the user's location.
    if (userLoc && radiusKm > 0) {
      arr = arr.filter(
        (r) => r.__distanceKm != null && r.__distanceKm <= radiusKm
      );
    }

    arr.sort((a, b) => {
      if (a.__distanceKm == null && b.__distanceKm == null) return 0;
      if (a.__distanceKm == null) return 1;
      if (b.__distanceKm == null) return -1;
      return a.__distanceKm - b.__distanceKm;
    });

    return arr;
  }, [items, userLoc, categoryFilter, radiusKm]);

  return (
    <AuthGate>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Nearby requests</h2>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            + New request
          </button>
        </div>

        {/* Filter Bar */}
        <div className="rounded-xl border p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {/* Radius */}
            <div>
              <label className="block text-sm font-medium">Radius (km)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={radiusKm}
                onChange={(e) =>
                  setRadiusKm(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 w-full rounded-lg border p-2"
                placeholder="e.g., 5"
              />
              <p className="mt-1 text-xs text-gray-500">
                {userLoc
                  ? "Filtering by your current location"
                  : "Enable location to filter by distance"}
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as Category | "all")
                }
                className="mt-1 w-full rounded-lg border p-2"
              >
                <option value="all">All</option>
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

            {/* Reset */}
            <div className="flex items-end justify-start sm:justify-end">
              <button
                onClick={() => {
                  setRadiusKm(5);
                  setCategoryFilter("all");
                }}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Map */}
        <div className={open ? "opacity-40 pointer-events-none" : ""}>
          <MapView
            center={center}
            requests={filtered}
            className={open ? "opacity-40 pointer-events-none" : ""}
            userLoc={userLoc}
            onOpenChat={(req) => openChatFor(req)}
          />
        </div>

        {/* List */}
        <ul className="divide-y rounded-xl border">
          {filtered.map((r) => {
            const iAmRequester = myId != null && r.requesterId === myId;
            const iAmHelper = myId != null && r.helperId === myId;
            const iAmParticipant = iAmRequester || iAmHelper;

            return (
              <li key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-sm text-gray-600">{r.description}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {r.category} • {r.status}
                      {r.reward ? ` • reward: ${r.reward}` : ""}{" "}
                      {r.__distanceKm != null && (
                        <span>• ~{r.__distanceKm.toFixed(1)} km away</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {r.status === "open" && myId && !iAmRequester && (
                      <button
                        onClick={() => acceptRequest(r.id, myId)}
                        className="rounded bg-black px-3 py-1 text-sm text-white hover:opacity-90"
                      >
                        I can help
                      </button>
                    )}

                    {r.status === "accepted" && iAmParticipant && (
                      <button
                        onClick={() => openChatFor(r)}
                        className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                      >
                        Open chat
                      </button>
                    )}

                    {r.status === "accepted" && iAmHelper && (
                      <button
                        onClick={() => markDone(r.id)}
                        className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                      >
                        Mark done
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="p-4 text-gray-500">
              {userLoc
                ? "No requests within your radius."
                : "Enable location to filter by distance, or adjust filters."}
            </li>
          )}
        </ul>
      </div>

      <NewRequestModal
        open={open}
        onClose={() => setOpen(false)}
        userLocation={userLoc}
      />

      {chatId && <ChatPanel chatId={chatId} onClose={() => setChatId(null)} />}
    </AuthGate>
  );
}
