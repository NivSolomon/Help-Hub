import React from "react";
import AuthGate from "../components/AuthGate";
import MapView from "../components/MapView";
import ChatPanel from "../components/ChatPanel";
import NewRequestModal from "../components/NewRequestModal";
import BirthdatePrompt from "../components/BirthdatePrompt";
import ReviewModal from "../components/ReviewModal";
import Confetti from "react-confetti";

import {
  listenOpenRequests,
  listenOpenRequestsNearby,
  listenParticipatingRequests,
  acceptRequestAtomic,
  markDone as markDoneApi,
  type MapBounds,
} from "../lib/requests";
import { geohashQueryBounds } from "geofire-common";
import { haversineKm } from "../lib/geo";
import { useAuthUser, useUserProfile } from "../lib/useAuthUser";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getOrCreateChat, listenMessages } from "../lib/chat";
import {
  consumePrompt,
  createReviewPromptsForBoth,
  listenMyReviewPrompts,
  submitReview,
} from "../lib/reviews";

import { CATEGORIES, type Category, type HelpRequest } from "../lib/types";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type ChatMeta = {
  id: string;
  requestTitle: string;
  otherUser: { uid: string; name?: string | null; phone?: string | null };
};

export default function Home() {
  // ===============================
  // 🔹 STATE MANAGEMENT
  // ===============================
  const [openItems, setOpenItems] = React.useState<HelpRequest[]>([]);
  const [participating, setParticipating] = React.useState<HelpRequest[]>([]);
  const [openModal, setOpenModal] = React.useState(false);
  const [mapBounds, setMapBounds] = React.useState<MapBounds | null>(null);

  const [center, setCenter] = React.useState({ lat: 32.0853, lng: 34.7818 });
  const [userLoc, setUserLoc] = React.useState<{ lat: number; lng: number }>();
  const [radiusKm, setRadiusKm] = React.useState(5);
  const [categoryFilter, setCategoryFilter] = React.useState<Category | "all">("all");

  const [selectedId, setSelectedId] = React.useState<string>();
  const [selectedTick, setSelectedTick] = React.useState(0);

  const [chatMeta, setChatMeta] = React.useState<ChatMeta | null>(null);

  // Review + Confetti
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewContext, setReviewContext] = React.useState<{
    requestId: string;
    revieweeId: string;
    otherName?: string | null;
  } | null>(null);

  // Auth & profile
  const user = useAuthUser();
  const profile = useUserProfile(user?.uid);
  const myId = user?.uid ?? null;
  const [showBirthPrompt, setShowBirthPrompt] = React.useState(false);

  // Cache for user lookups
  const userCacheRef = React.useRef<
    Record<string, { name?: string | null; phone?: string | null }>
  >({});

  // ===============================
  // 🔹 EFFECTS: INITIALIZATION
  // ===============================

  // Check for birthdate
  React.useEffect(() => {
    if (user && profile && !profile.birthdateISO) setShowBirthPrompt(true);
    else setShowBirthPrompt(false);
  }, [user, profile]);

  // Geolocation (initial)
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

  // Open requests (global)
  React.useEffect(() => {
    const unsub = listenOpenRequests(setOpenItems);
    return () => unsub();
  }, []);

  // Nearby open requests (by map bounds)
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

  // ===============================
  // 🔹 LISTENER: Participating + Confetti
  // ===============================
  React.useEffect(() => {
    if (!myId) return;

    const seenDone = new Set<string>();

    const unsub = listenParticipatingRequests(myId, (items) => {
      setParticipating(items);

      // Trigger confetti when a request becomes done
      for (const r of items) {
        if (r.status === "done" && !seenDone.has(r.id)) {
          seenDone.add(r.id);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
          toast.success(`Request "${r.title}" completed 🎉`, {
            position: "bottom-right",
          });
        }
      }
    });

    return () => unsub();
  }, [myId]);

  // ===============================
  // 🔹 REVIEW PROMPTS
  // ===============================
  React.useEffect(() => {
    if (!myId) return;
    const unsub = listenMyReviewPrompts(myId, async (prompts) => {
      if (prompts.length === 0) return;
      await new Promise((r) => setTimeout(r, 200));

      const p = prompts[0];
      const info = await ensureUser(p.revieweeId);
      setReviewContext({
        requestId: p.requestId,
        revieweeId: p.revieweeId,
        otherName: info?.name ?? null,
      });
      setReviewOpen(true);
      consumePrompt(p.id).catch(() => {});
    });
    return () => unsub();
  }, [myId]);

  // ===============================
  // 🔹 HELPERS
  // ===============================

  async function ensureUser(uid: string) {
    if (userCacheRef.current[uid]) return userCacheRef.current[uid];
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const d = snap.data() as any | undefined;
      const info = {
        name: d?.displayName ?? d?.name ?? d?.profile?.displayName ?? null,
        phone: d?.phone ?? d?.phoneNumber ?? d?.contact?.phone ?? null,
      };
      userCacheRef.current[uid] = info;
      return info;
    } catch {
      const info = { name: null, phone: null };
      userCacheRef.current[uid] = info;
      return info;
    }
  }

  async function openChatFor(req: HelpRequest) {
    if (!myId || !req.helperId) return;
    const otherId = req.requesterId === myId ? req.helperId : req.requesterId;
    try {
      const chat = await getOrCreateChat(req.id, myId, otherId);
      const otherInfo = await ensureUser(otherId);
      setChatMeta({
        id: chat.id,
        requestTitle: req.title,
        otherUser: { uid: otherId, ...otherInfo },
      });
    } catch (e) {
      console.error("openChatFor failed:", e);
      toast.error("Couldn't open chat.");
    }
  }

  async function handleAcceptAndChat(req: HelpRequest) {
    if (!myId || myId === req.requesterId) return;
    try {
      await acceptRequestAtomic(req.id, myId, "accepted");
      await openChatFor({ ...req, helperId: myId, status: "accepted" } as HelpRequest);
    } catch {
      toast.warn("This request was accepted by someone else.");
    }
  }

  async function handleMarkDone(req: HelpRequest) {
    if (!myId || myId !== req.requesterId) return;
    try {
      setParticipating((p) => p.filter((r) => r.id !== req.id));
      setOpenItems((p) => p.filter((r) => r.id !== req.id));
      await markDoneApi(req.id);

      if (req.helperId)
        await createReviewPromptsForBoth(req.id, req.requesterId, req.helperId);

      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);

      if (req.helperId) {
        const info = await ensureUser(req.helperId);
        setReviewContext({
          requestId: req.id,
          revieweeId: req.helperId,
          otherName: info?.name ?? null,
        });
        setReviewOpen(true);
      }

      toast.success("Marked as done ✅", { position: "bottom-right" });
    } catch (err) {
      console.error("markDone failed:", err);
      toast.error("Failed to mark as done");
    }
  }

  // ===============================
  // 🔹 FILTERED & SORTED REQUESTS
  // ===============================
  const merged = React.useMemo(() => {
    const map = new Map<string, HelpRequest>();
    for (const r of openItems) map.set(r.id, r);
    for (const r of participating) map.set(r.id, r);
    return Array.from(map.values());
  }, [openItems, participating]);

  const filtered = React.useMemo(() => {
    const withDist = merged.map((r) => ({
      ...r,
      __distanceKm: userLoc && r.location ? haversineKm(userLoc, r.location) : null,
    }));
    const byCat =
      categoryFilter === "all"
        ? withDist
        : withDist.filter((r) => r.category === categoryFilter);
    const byRad =
      userLoc && radiusKm > 0
        ? byCat.filter((r) => r.__distanceKm != null && r.__distanceKm <= radiusKm)
        : byCat;
    return [...byRad].sort((a, b) => (a.__distanceKm ?? 0) - (b.__distanceKm ?? 0));
  }, [merged, userLoc, categoryFilter, radiusKm]);

  // ===============================
  // 🔹 RENDER
  // ===============================

  if (!user)
    return (
      <AuthGate>
        <div className="grid h-[calc(100dvh-64px)] place-items-center text-gray-600">
          Loading user...
        </div>
      </AuthGate>
    );

  return (
    <AuthGate>
      {/* 🎉 Confetti */}
      {showConfetti && (
        <>
          <Confetti recycle={false} numberOfPieces={300} />
          <div className="fixed inset-0 flex items-center justify-center text-2xl font-semibold text-white drop-shadow-lg pointer-events-none">
            🎉 Great job helping!
          </div>
        </>
      )}

      {/* 🎂 Birthdate prompt */}
      {showBirthPrompt && user && (
        <BirthdatePrompt
          uid={user.uid}
          onSaved={() => {
            setShowBirthPrompt(false);
            toast.success("Birth date saved 🎉");
          }}
        />
      )}

      {/* ⭐ Review Modal */}
      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        otherName={reviewContext?.otherName}
        onSubmit={async (rating, comment) => {
          if (!myId || !reviewContext) return;
          await submitReview(
            reviewContext.requestId,
            myId,
            reviewContext.revieweeId,
            rating,
            comment
          );
          toast.success("Thanks for your review!", { position: "bottom-right" });
        }}
      />

      {/* 🗺️ Main Content */}
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Nearby requests</h2>
          <button
            onClick={() => setOpenModal(true)}
            className="rounded-lg bg-black px-4 py-2 text-white hover:opacity-90"
          >
            + New request
          </button>
        </header>

        {/* 🔍 Filters */}
        <section className="rounded-xl border p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-sm font-medium">Radius (km)</label>
              <input
                type="number"
                min={0}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-lg border p-2"
              />
              <p className="mt-1 text-xs text-gray-500">
                {userLoc ? "Measured from your location" : "Enable location to use distance"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
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

            <div className="flex items-end sm:justify-end">
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
        </section>

        {/* 🗺️ Map */}
        <MapView
          center={center}
          requests={filtered}
          userLoc={userLoc}
          selectedId={selectedId}
          selectedTick={selectedTick}
          onOpenChat={(req) => openChatFor(req)}
          onAccept={(req) => handleAcceptAndChat(req)}
          onBoundsChange={(b) => setMapBounds(b)}
          onLocated={(loc) => setUserLoc(loc)}
          radiusKm={radiusKm}
          onMarkDone={(req) => handleMarkDone(req)}
          className={openModal ? "opacity-40 pointer-events-none" : ""}
        />

        {/* 📋 Request List */}
        <ul className="divide-y rounded-xl border">
          {filtered.length === 0 ? (
            <li className="p-4 text-gray-500">
              {userLoc
                ? "No requests match your filters."
                : "Enable location to filter by distance, or adjust filters."}
            </li>
          ) : (
            filtered.map((r) => {
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
                      >
                        {r.title}
                      </button>
                      <div className="text-sm text-gray-600">{r.description}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {r.category} • {r.status}
                        {r.reward ? ` • reward: ${r.reward}` : ""}
                        {r.__distanceKm != null && (
                          <span> • ~{r.__distanceKm.toFixed(1)} km away</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {r.status === "open" && !iAmRequester && (
                        <button
                          onClick={() => handleAcceptAndChat(r)}
                          className="rounded bg-black px-3 py-1 text-sm text-white hover:opacity-90"
                        >
                          I can help
                        </button>
                      )}
                      {iAmParticipant &&
                        (r.status === "in_progress" || r.status === "accepted") && (
                          <button
                            onClick={() => openChatFor(r)}
                            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                          >
                            Open chat
                          </button>
                        )}
                      {iAmRequester &&
                        (r.status === "in_progress" || r.status === "accepted") && (
                          <button
                            onClick={() => handleMarkDone(r)}
                            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                          >
                            Mark done
                          </button>
                        )}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* 🪄 Modals */}
      <NewRequestModal open={openModal} onClose={() => setOpenModal(false)} userLocation={userLoc} />

      {chatMeta && chatMeta.id !== "pending" && (
        <ChatPanel
          chatId={chatMeta.id}
          onClose={() => setChatMeta(null)}
          requestTitle={chatMeta.requestTitle}
          otherUser={chatMeta.otherUser}
        />
      )}

      <ToastContainer />
    </AuthGate>
  );
}
