import React from "react";
import AuthGate from "../components/AuthGate";
import MapView from "../components/MapView";
import ChatPanel from "../components/ChatPanel";
import NewRequestModal from "../components/NewRequestModal";
import type { HelpRequest } from "../lib/types";
import { useAuthUser } from "../lib/useAuthUser";
import {
  listenOpenRequests,
  listenOpenRequestsNearby,
  listenParticipatingRequests,
  type MapBounds,
  acceptRequestAtomic,
  markDone as markDoneApi,
} from "../lib/requests";
import { haversineKm } from "../lib/geo";
import { geohashQueryBounds } from "geofire-common";
import { CATEGORIES, type Category } from "../lib/types";
import { getOrCreateChat, listenMessages } from "../lib/chat";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Home() {
  const [openItems, setOpenItems] = React.useState<HelpRequest[]>([]);
  const [participating, setParticipating] = React.useState<HelpRequest[]>([]);
  const [open, setOpen] = React.useState(false);
  const [center, setCenter] = React.useState({ lat: 32.0853, lng: 34.7818 });
  const [userLoc, setUserLoc] = React.useState<{ lat: number; lng: number }>();
  const [selectedId, setSelectedId] = React.useState<string>();
  const [selectedTick, setSelectedTick] = React.useState(0);
  const [chatId, setChatId] = React.useState<string | null>(null);
  const [radiusKm, setRadiusKm] = React.useState(5);
  const [categoryFilter, setCategoryFilter] =
    React.useState<Category | "all">("all");
  const [mapBounds, setMapBounds] = React.useState<MapBounds | null>(null);
  const user = useAuthUser();
  const myId = user?.uid ?? null;

  // initial location
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(c);
        setUserLoc(c);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // open-only
  React.useEffect(() => {
    const unsub = listenOpenRequests(setOpenItems);
    return () => unsub();
  }, []);

  // nearby open
  React.useEffect(() => {
    if (!mapBounds) return;
    let range: { start: string; end: string } | null = null;
    try {
      const bounds = geohashQueryBounds(
        [mapBounds.south, mapBounds.west],
        [mapBounds.north, mapBounds.east]
      );
      if (bounds?.length > 0) {
        const [start, end] = bounds[0];
        range = { start, end };
      }
    } catch {
      range = null;
    }
    const unsub = listenOpenRequestsNearby(mapBounds, range, setOpenItems);
    return () => unsub();
  }, [mapBounds]);

  // keep accepted/in_progress for both users
  React.useEffect(() => {
    if (!myId) return;
    const unsub = listenParticipatingRequests(myId, setParticipating);
    return () => unsub();
  }, [myId]);

  // merge open + participating
  const items = React.useMemo(() => {
    const map = new Map<string, HelpRequest>();
    for (const r of openItems) map.set(r.id, r);
    for (const r of participating) map.set(r.id, r);
    return Array.from(map.values());
  }, [openItems, participating]);

  // derived + filters + sort
  const filtered = React.useMemo(() => {
    const withDist = items.map((r) => {
      const dist = userLoc && r.location ? haversineKm(userLoc, r.location) : null;
      return { ...r, __distanceKm: dist as number | null };
    });
    const byCategory =
      categoryFilter === "all"
        ? withDist
        : withDist.filter((r) => r.category === categoryFilter);
    const byRadius =
      userLoc && radiusKm > 0
        ? byCategory.filter(
            (r) => r.__distanceKm != null && r.__distanceKm <= radiusKm
          )
        : byCategory;
    const sorted = [...byRadius].sort((a, b) => {
      if (a.__distanceKm == null && b.__distanceKm == null) return 0;
      if (a.__distanceKm == null) return 1;
      if (b.__distanceKm == null) return -1;
      return a.__distanceKm - b.__distanceKm;
    });
    return sorted;
  }, [items, userLoc, categoryFilter, radiusKm]);

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

  // accept + open chat
  async function handleAcceptAndChat(req: HelpRequest) {
    if (!myId || myId === req.requesterId) return;
    try {
      await acceptRequestAtomic(req.id, myId, "accepted");
      await openChatFor({
        ...req,
        helperId: myId,
        status: "accepted",
      } as HelpRequest);
    } catch {
      alert("This request was accepted by someone else.");
    }
  }

async function markDone(reqId: string) {
  try {
    // Optimistically remove from UI
    setParticipating((prev) => prev.filter((r) => r.id !== reqId));
    setOpenItems((prev) => prev.filter((r) => r.id !== reqId));

    // Update Firestore
    await markDoneApi(reqId);

    toast.success("Marked as done ✅", { position: "bottom-right", autoClose: 3000 });
  } catch (err) {
    console.error("markDone failed:", err);
    toast.error("Failed to mark as done");
  }
}


  // Toastify incoming messages
  const chatSubsRef = React.useRef<Record<string, () => void>>({});
  const lastMsgRef = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    if (!myId) return;
    const mine = participating.filter(
      (r) =>
        (r.helperId &&
          (r.helperId === myId || r.requesterId === myId)) &&
        (r.status === "in_progress" || r.status === "accepted")
    );
    const existing = chatSubsRef.current;
    const stillNeeded: Record<string, true> = {};
    (async () => {
      for (const r of mine) {
        const other = r.requesterId === myId ? r.helperId! : r.requesterId;
        const chat = await getOrCreateChat(r.id, myId, other);
        const cid = chat.id;
        stillNeeded[cid] = true;
        if (existing[cid]) continue;
        const unsub = listenMessages(cid, (msgs) => {
          if (!Array.isArray(msgs) || msgs.length === 0) return;
          const last = msgs[msgs.length - 1];
          if (last.senderId === myId) return;
          if (lastMsgRef.current[cid] === last.id) return;
          if (chatId === cid) return;
          lastMsgRef.current[cid] = last.id;
          toast.info(last.text, {
            position: "bottom-right",
            autoClose: 6000,
            closeOnClick: true,
            onClick: () => openChatFor(r),
          });
        });
        existing[cid] = unsub;
      }
      for (const [cid, u] of Object.entries(existing)) {
        if (!stillNeeded[cid]) {
          try {
            u();
          } catch {}
          delete existing[cid];
          delete lastMsgRef.current[cid];
        }
      }
    })();
  }, [participating, myId, chatId]);

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

        {/* Filters */}
        <div className="rounded-xl border p-3">
          <div className="grid gap-3 sm:grid-cols-4">
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
              />
              <p className="mt-1 text-xs text-gray-500">
                {userLoc
                  ? "Measured from your location"
                  : "Enable location to use distance"}
              </p>
            </div>

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
        <MapView
          center={center}
          requests={filtered}
          className={open ? "opacity-40 pointer-events-none" : ""}
          userLoc={userLoc}
          selectedId={selectedId}
          selectedTick={selectedTick}
          onOpenChat={(req) => openChatFor(req)}
          onAccept={(req) => handleAcceptAndChat(req)}
          onBoundsChange={(b) => setMapBounds(b)}
          onLocated={(loc) => setUserLoc(loc)}
        />

        {/* List */}
        <ul className="divide-y rounded-xl border">
          {filtered.map((r) => {
            const iAmRequester = r.requesterId === myId;
            const iAmHelper = r.helperId === myId;
            const iAmParticipant = iAmRequester || iAmHelper;
            return (
              <li key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <button
                      className="font-medium hover:underline"
                      onClick={() => {
                        setSelectedId(r.id);
                        setSelectedTick((t) => t + 1);
                      }}
                      title="Focus on map"
                    >
                      {r.title}
                    </button>
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
                        onClick={() => handleAcceptAndChat(r)}
                        className="rounded bg-black px-3 py-1 text-sm text-white hover:opacity-90"
                      >
                        I can help
                      </button>
                    )}
                    {(r.status === "in_progress" || r.status === "accepted") &&
                      iAmParticipant && (
                        <button
                          onClick={() => openChatFor(r)}
                          className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                        >
                          Open chat
                        </button>
                      )}
                    {(r.status === "in_progress" || r.status === "accepted") &&
                      iAmHelper && (
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
                ? "No requests match your filters."
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
      {chatId && chatId !== "pending" && (
        <ChatPanel chatId={chatId} onClose={() => setChatId(null)} />
      )}
      <ToastContainer />
    </AuthGate>
  );
}
