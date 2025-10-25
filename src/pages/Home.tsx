import React from "react";
import { useNavigate } from "react-router-dom";
import AuthGate from "../components/AuthGate";
import MapView from "../components/MapView";
import ChatPanel from "../components/ChatPanel";
import NewRequestModal from "../components/NewRequestModal";
import OnboardingPrompt from "../components/OnboardingPrompt";
import ReviewModal from "../components/ReviewModal";
import Confetti from "react-confetti";
import RequesterName from "../components/RequesterName";
import Navbar from "../components/Navbar";

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
  console.log("Home render");
  const navigate = useNavigate();

  // =========================================================================
  // 🔹 STATE
  // =========================================================================
  const [openItems, setOpenItems] = React.useState<HelpRequest[]>([]);
  const [participating, setParticipating] = React.useState<HelpRequest[]>([]);

  const [openModal, setOpenModal] = React.useState(false);

  const [mapBounds, setMapBounds] = React.useState<MapBounds | null>(null);

  const [center, setCenter] = React.useState({ lat: 32.0853, lng: 34.7818 });
  const [userLoc, setUserLoc] = React.useState<{ lat: number; lng: number }>();

  const [radiusKm, setRadiusKm] = React.useState(5);
  const [categoryFilter, setCategoryFilter] = React.useState<
    Category | "all"
  >("all");

  const [selectedId, setSelectedId] = React.useState<string>();
  const [selectedTick, setSelectedTick] = React.useState(0);

  const [chatMeta, setChatMeta] = React.useState<ChatMeta | null>(null);

  // Review modal & confetti
  const [showConfetti, setShowConfetti] = React.useState(false);

  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewContext, setReviewContext] = React.useState<{
    requestId: string;
    requestTitle?: string | null;
    revieweeId: string;
    otherName?: string | null;
  } | null>(null);

  // Auth & onboarding
  const user = useAuthUser();
  const profile = useUserProfile(user?.uid);
  const myId = user?.uid ?? null;
  const [showOnboardingPrompt, setShowOnboardingPrompt] = React.useState(false);

  // Cache for requester/helper quick lookup
  const userCacheRef = React.useRef<
    Record<string, { name?: string | null; phone?: string | null }>
  >({});

  // =========================================================================
  // 🔹 EFFECT: Require onboarding info (firstName, lastName, birthdate, phone, address)
  // =========================================================================
  React.useEffect(() => {
    if (user && profile) {
      const needsOnboarding =
        !profile.firstName ||
        !profile.lastName ||
        !profile.birthdateISO ||
        !profile.phone ||
        !profile.address;

      setShowOnboardingPrompt(needsOnboarding);
    } else {
      setShowOnboardingPrompt(false);
    }
  }, [user, profile]);

  // =========================================================================
  // 🔹 EFFECT: Geolocation init
  // =========================================================================
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

  // =========================================================================
  // 🔹 EFFECT: Global open requests listener
  // =========================================================================
  React.useEffect(() => {
    const unsub = listenOpenRequests(setOpenItems);
    return () => unsub();
  }, []);

  // =========================================================================
  // 🔹 EFFECT: Nearby open requests when map changes bounds
  // =========================================================================
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

  // =========================================================================
  // 🔹 EFFECT: Participating requests (my accepted / in_progress etc.)
  // =========================================================================
  const seenDoneRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!myId) return;
    const unsub = listenParticipatingRequests(myId, (items) => {
      // items are the requests where I'm involved as requester or helper
      setParticipating(items);

      // confetti & toast if completed
      for (const r of items) {
        if (r.status === "done" && !seenDoneRef.current.has(r.id)) {
          seenDoneRef.current.add(r.id);
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

  // =========================================================================
  // 🔹 EFFECT: Review prompts listener
  // When Firestore tells us "hey, please review <otherUser> for <request>"
  // we open the ReviewModal immediately.
  // =========================================================================
  React.useEffect(() => {
    if (!myId) return;

    const unsub = listenMyReviewPrompts(myId, async (prompts) => {
      if (prompts.length === 0) return;

      // small delay so we don't clash with markDone UI
      await new Promise((r) => setTimeout(r, 200));

      const p = prompts[0];
      // Lookup that other user's display name
      const info = await ensureUser(p.revieweeId);

      setReviewContext({
        requestId: p.requestId,
        requestTitle: p.requestTitle ?? null,
        revieweeId: p.revieweeId,
        otherName: info?.name ?? null,
      });

      setReviewOpen(true);

      // mark prompt consumed so we don't spam on rerender
      consumePrompt(p.id).catch(() => {});
    });

    return () => unsub();
  }, [myId]);

  // =========================================================================
  // 🔹 HELPERS
  // =========================================================================

  // Fetch / memoize a user's basic info (name, phone)
  async function ensureUser(uid: string) {
    if (userCacheRef.current[uid]) return userCacheRef.current[uid];
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const d = snap.data() as any | undefined;
      const info = {
        name:
          d?.displayName ??
          d?.firstName ??
          d?.name ??
          d?.profile?.displayName ??
          null,
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

  // open (or create) chat between me and the other participant of req
  async function openChatFor(req: HelpRequest) {
    if (!myId || !req.helperId) return;

    // Figure out who "the other person" is from my POV
    const otherId = req.requesterId === myId ? req.helperId : req.requesterId;

    try {
      const chat = await getOrCreateChat(req.id, myId, otherId);

      // fetch their info (may be null-ish)
      const otherInfo = await ensureUser(otherId);

      const fallbackName =
        otherInfo?.name && otherInfo.name.trim() !== ""
          ? otherInfo.name
          : "Anonymous user";

      setChatMeta({
        id: chat.id,
        requestTitle: req.title,
        otherUser: {
          uid: otherId,
          name: fallbackName,
          phone: otherInfo?.phone ?? null,
        },
      });
    } catch (e) {
      console.error("openChatFor failed:", e);
      toast.error("Couldn't open chat.");
    }
  }

  // accept request → become helper → open chat
  async function handleAcceptAndChat(req: HelpRequest) {
    if (!myId || myId === req.requesterId) return;
    try {
      await acceptRequestAtomic(req.id, myId, "accepted");
      // optimistic open chat with updated helperId = me
      await openChatFor({
        ...req,
        helperId: myId,
        status: "accepted",
      } as HelpRequest);
    } catch {
      toast.warn("This request was accepted by someone else.");
    }
  }

  // requester marks request as done → triggers confetti + review prompts for both sides
  async function handleMarkDone(req: HelpRequest) {
    if (!myId || myId !== req.requesterId) return;

    try {
      // Optimistically remove done request from local UI
      setParticipating((p) => p.filter((r) => r.id !== req.id));
      setOpenItems((p) => p.filter((r) => r.id !== req.id));

      // Mark done in backend
      await markDoneApi(req.id);

      // create review prompts for BOTH sides
      if (req.helperId) {
        await createReviewPromptsForBoth(
          req.id,
          req.requesterId,
          req.helperId,
          req.title
        );
      }

      // confetti!
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);

      // Immediately open review modal for requester to review helper
      if (req.helperId) {
        const info = await ensureUser(req.helperId);
        setReviewContext({
          requestId: req.id,
          requestTitle: req.title,
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

  // =========================================================================
  // 🔹 EFFECT: Chat toast notifications
  //   - Listen to chats of my active/in_progress/accepted requests
  //   - Show toast for new messages if I'm not currently focused on that chat
  // =========================================================================
  const chatSubsRef = React.useRef<Record<string, () => void>>({});
  const lastMsgRef = React.useRef<Record<string, string>>({});
  const initializedRef = React.useRef<Record<string, boolean>>({});
  const activeChatRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    activeChatRef.current = chatMeta?.id ?? null;
  }, [chatMeta?.id]);

  React.useEffect(() => {
    if (!myId) return;

    // Only consider requests where I'm participant AND it's active (accepted/in_progress)
    const mine = participating.filter(
      (r) =>
        r.helperId &&
        (r.helperId === myId || r.requesterId === myId) &&
        (r.status === "in_progress" || r.status === "accepted")
    );

    const existing = chatSubsRef.current;
    const stillNeeded: Record<string, true> = {};

    (async () => {
      for (const r of mine) {
        const otherId = r.requesterId === myId ? r.helperId! : r.requesterId;
        const chat = await getOrCreateChat(r.id, myId, otherId);
        const cid = chat.id;
        stillNeeded[cid] = true;
        if (existing[cid]) continue;

        const unsub = listenMessages(cid, async (msgs) => {
          // First run for this chat: initialize and don't toast old backlog
          if (!initializedRef.current[cid]) {
            initializedRef.current[cid] = true;
            if (msgs.length <= 1) {
              lastMsgRef.current[cid] = "";
            } else {
              lastMsgRef.current[cid] = msgs[msgs.length - 1]?.id ?? "";
            }
            return;
          }

          if (!Array.isArray(msgs) || msgs.length === 0) return;
          const last = msgs[msgs.length - 1];
          if (!last) return;

          // Don't toast for my own message
          if (last.senderId === myId) {
            lastMsgRef.current[cid] = last.id;
            return;
          }

          // If we've already toasted for this exact message ID, skip
          if (lastMsgRef.current[cid] === last.id) return;

          // If I'm literally in this chat panel right now, also skip
          if (activeChatRef.current === cid) {
            lastMsgRef.current[cid] = last.id;
            return;
          }

          // Mark last ID so we won't toast again
          lastMsgRef.current[cid] = last.id;

          // Sender display name
          let senderName = "New message";
          try {
            const senderInfo = await ensureUser(last.senderId);
            if (senderInfo?.name) senderName = senderInfo.name;
          } catch {
            /* ignore */
          }

          toast.info(
            <div style={{ maxWidth: 360 }}>
              <div style={{ fontWeight: 600 }}>
                {senderName}{" "}
                <span style={{ color: "#6b7280" }}>• {r.title}</span>
              </div>
              <div>{last.text}</div>
            </div>,
            {
              position: "bottom-right",
              autoClose: 6000,
              closeOnClick: true,
              onClick: () => openChatFor(r),
            }
          );
        });

        existing[cid] = unsub;
      }

      // Cleanup chats we no longer participate in
      for (const [cid, u] of Object.entries(existing)) {
        if (!stillNeeded[cid]) {
          try {
            u();
          } catch {}
          delete existing[cid];
          delete lastMsgRef.current[cid];
          delete initializedRef.current[cid];
        }
      }
    })();

    // Cleanup everything on unmount
    return () => {
      for (const u of Object.values(chatSubsRef.current)) {
        try {
          u();
        } catch {}
      }
      chatSubsRef.current = {};
      lastMsgRef.current = {};
      initializedRef.current = {};
    };
  }, [participating, myId]);

  // =========================================================================
  // 🔹 MERGE open and participating requests
  //    We'll deduplicate by ID, because one request may appear in both lists.
  // =========================================================================
  const merged = React.useMemo(() => {
    const map = new Map<string, HelpRequest>();
    for (const r of openItems) map.set(r.id, r);
    for (const r of participating) map.set(r.id, r);
    return Array.from(map.values());
  }, [openItems, participating]);

  // =========================================================================
  // 🔹 FILTERING + VISIBILITY RULES
  //
  // Rules:
  // - Distance filter (radius)
  // - Category filter
  // - Visibility:
  //     * "open": visible to everyone
  //     * "in_progress"/"accepted": only visible to requesterId or helperId
  //     * "done": hidden
  //
  // This drives BOTH the list and the map.
  // =========================================================================
  const filtered = React.useMemo(() => {
    // compute distance for UI sorting / display
    const withDist = merged.map((r) => ({
      ...r,
      __distanceKm:
        userLoc && r.location ? haversineKm(userLoc, r.location) : null,
    }));

    // category filter
    const byCat =
      categoryFilter === "all"
        ? withDist
        : withDist.filter((r) => r.category === categoryFilter);

    // radius filter
    const byRad =
      userLoc && radiusKm > 0
        ? byCat.filter(
            (r) => r.__distanceKm != null && r.__distanceKm <= radiusKm
          )
        : byCat;

    // visibility filter
    const visibleForMe = byRad.filter((r) => {
      if (r.status === "open") return true;
      if (r.status === "done") return false;
      if (r.status === "in_progress" || r.status === "accepted") {
        if (!myId) return false;
        // visible if I'm the requester OR I'm the helper
        return r.requesterId === myId || r.helperId === myId;
      }
      // unknown status → hide
      return false;
    });

    // sort by distance ascending
    return [...visibleForMe].sort(
      (a, b) => (a.__distanceKm ?? Infinity) - (b.__distanceKm ?? Infinity)
    );
  }, [merged, userLoc, categoryFilter, radiusKm, myId]);

  // =========================================================================
  // 🔹 RENDER
  // =========================================================================

  // auth still loading?
  if (!user) {
    return (
      <AuthGate>
        <div className="grid h-[calc(100dvh-64px)] place-items-center text-gray-600">
          Loading user...
        </div>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <Navbar />

      {/* 🎉 Confetti celebration overlay */}
      {showConfetti && (
        <>
          <Confetti recycle={false} numberOfPieces={320} />
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center text-2xl font-semibold text-white drop-shadow-lg">
            🎉 Great job helping!
          </div>
        </>
      )}

      {/* 🧑 Onboarding prompt (blocking modal) */}
      {showOnboardingPrompt && user && (
        <OnboardingPrompt
          uid={user.uid}
          onSaved={() => {
            setShowOnboardingPrompt(false);
            toast.success("Profile saved 🎉");
          }}
        />
      )}

      {/* ⭐ Review modal */}
      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        otherName={reviewContext?.otherName}
        requestTitle={reviewContext?.requestTitle ?? undefined}
        onSubmit={async (rating, comment /* , imageFile */) => {
          if (!myId || !reviewContext) return;

          // TODO: optional image upload: const imageUrl = ...
          const imageUrl = null;

          await submitReview(
            reviewContext.requestId,
            myId,
            reviewContext.revieweeId,
            rating,
            comment.trim(),
            imageUrl,
            reviewContext.requestTitle ?? null
          );

          toast.success("Thanks for your review!", {
            position: "bottom-right",
          });
        }}
      />

      {/* 🗺️ Main content */}
      <div
        className="mx-auto max-w-5xl space-y-4 p-4"
        aria-hidden={showOnboardingPrompt ? true : undefined}
      >
        {/* Header + New Request CTA */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Nearby requests</h2>

          <button
            onClick={() => setOpenModal(true)}
            className="rounded-lg bg-black px-4 py-2 text-white hover:opacity-90"
          >
            + New request
          </button>
        </header>

        {/* Filters */}
        <section className="rounded-xl border p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {/* Radius */}
            <div>
              <label className="block text-sm font-medium">Radius (km)</label>
              <input
                type="number"
                min={0}
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

        {/* Map */}
        <MapView
          center={center}
          requests={filtered}
          userLoc={userLoc}
          selectedId={selectedId}
          selectedTick={selectedTick}
          radiusKm={radiusKm}
          onAccept={(req) => handleAcceptAndChat(req)}
          onOpenChat={(req) => openChatFor(req)}
          onMarkDone={(req) => handleMarkDone(req)}
          onLocated={(loc) => setUserLoc(loc)}
          onBoundsChange={(b) => setMapBounds(b)}
          onOpenProfile={(uid) => navigate(`/u/${uid}`)}
          className={openModal ? "pointer-events-none opacity-40" : ""}
        />

        {/* Request list */}
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

              const dist =
                r.__distanceKm != null
                  ? `${r.__distanceKm.toFixed(1)} km`
                  : null;

              return (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {/* title + status pill */}
                      <div className="mb-1 flex items-center gap-2">
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

                        <span
                          className={`rounded-full px-2 py-[2px] text-xs ${
                            r.status === "open"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : r.status === "done"
                              ? "border border-gray-200 bg-gray-100 text-gray-700"
                              : "border border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {r.status.replace("_", " ")}
                        </span>
                      </div>

                      {/* description */}
                      {r.description && (
                        <div className="mb-1 text-sm text-gray-600">
                          {r.description}
                        </div>
                      )}

                      {/* metadata row */}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                        {/* category */}
                        <span
                          title="Category"
                          className="inline-flex items-center gap-1"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4">
                            <path d="M12 3l9 6-9 6-9-6 9-6zm0 12l9 6-9 6-9-6z" />
                          </svg>
                          {r.category}
                        </span>

                        {/* reward */}
                        {(typeof r.reward === "number" ||
                          (typeof r.reward === "string" &&
                            r.reward.trim() !== "")) && (
                          <span
                            title="Reward"
                            className="inline-flex items-center gap-1"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4">
                              <path
                                d="M12 1v22M5 6h9a4 4 0 110 8H6m0 0h8"
                                strokeWidth="2"
                                fill="none"
                              />
                            </svg>
                            {r.reward}
                          </span>
                        )}

                        {/* distance */}
                        {dist && (
                          <span
                            title="Approx. distance"
                            className="inline-flex items-center gap-1"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4">
                              <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z" />
                              <circle
                                cx="12"
                                cy="9"
                                r="2.5"
                                fill="currentColor"
                              />
                            </svg>
                            ~{dist}
                          </span>
                        )}

                        {/* requester profile name (always requesterId) */}
                        <button
                          className="inline-flex items-center gap-1 hover:underline"
                          onClick={() => navigate(`/u/${r.requesterId}`)}
                          title="View profile"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 text-gray-500"
                          >
                            <path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
                          </svg>
                          <RequesterName
                            uid={r.requesterId}
                            cacheRef={userCacheRef}
                          />
                        </button>
                      </div>
                    </div>

                    {/* action buttons */}
                    <div className="flex flex-wrap gap-2">
                      {/* I can help */}
                      {r.status === "open" && myId && !iAmRequester && (
                        <button
                          onClick={() => handleAcceptAndChat(r)}
                          className="rounded bg-black px-3 py-1 text-sm text-white hover:opacity-90"
                        >
                          I can help
                        </button>
                      )}

                      {/* Open chat */}
                      {iAmParticipant &&
                        (r.status === "in_progress" ||
                          r.status === "accepted") && (
                          <button
                            onClick={() => openChatFor(r)}
                            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                          >
                            Open chat
                          </button>
                        )}

                      {/* Mark done (only requester) */}
                      {iAmRequester &&
                        (r.status === "in_progress" ||
                          r.status === "accepted") && (
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

      {/* New Request modal */}
      <NewRequestModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        userLocation={userLoc}
      />

      {/* Chat side panel */}
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
