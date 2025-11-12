import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import AuthGate from "../components/AuthGate";
import MapView from "../components/MapView";
import ChatPanel from "../components/ChatPanel";
import NewRequestModal from "../components/NewRequestModal";
import OnboardingPrompt from "../components/OnboardingPrompt";
import ReviewModal from "../components/ReviewModal";
import Confetti from "react-confetti";
import RequesterName from "../components/RequesterName";
import Navbar from "../components/Navbar";
import ScrollReveal from "../components/ScrollReveal";

import {
  listenOpenRequests,
  listenOpenRequestsNearby,
  listenParticipatingRequests,
  acceptRequestAtomic,
  markDone as markDoneApi,
  deleteOpenRequest,
  type MapBounds,
} from "../lib/requests";

import { geohashQueryBounds } from "geofire-common";
import { haversineKm } from "../lib/geo";

import { useAuthUser, useUserProfile } from "../lib/useAuthUser";
import { fetchUserProfile } from "../lib/users";

import { getOrCreateChat, listenMessages } from "../lib/chat";

import {
  consumePrompt,
  createReviewPromptsForBoth,
  listenMyReviewPrompts,
  submitReview,
} from "../lib/reviews";

import { CATEGORIES, type Category, type HelpRequest } from "../lib/types";
import { useNotifications } from "../components/NotificationCenter";
import googleLogo from "../assets/Logo-google-icon-PNG.png";
import { signInWithGoogle } from "../lib/auth";

type ChatMeta = {
  id: string;
  requestTitle: string;
  otherUser: { uid: string; name?: string | null; phone?: string | null };
};

function locationsEqual(
  a?: { lat: number; lng: number },
  b?: { lat: number; lng: number }
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
}

function addressesEqual(
  a?: HelpRequest["address"],
  b?: HelpRequest["address"]
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    (a?.city ?? null) === (b?.city ?? null) &&
    (a?.street ?? null) === (b?.street ?? null) &&
    (a?.houseNumber ?? null) === (b?.houseNumber ?? null) &&
    (a?.notes ?? null) === (b?.notes ?? null)
  );
}

function helpRequestsEqual(a: HelpRequest, b: HelpRequest) {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.category === b.category &&
    (a.reward ?? null) === (b.reward ?? null) &&
    a.requesterId === b.requesterId &&
    (a.helperId ?? null) === (b.helperId ?? null) &&
    a.status === b.status &&
    a.createdAt === b.createdAt &&
    addressesEqual(a.address, b.address) &&
    locationsEqual(a.location, b.location)
  );
}

function areHelpRequestListsEqual(
  prev: HelpRequest[],
  next: HelpRequest[]
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  const byId = new Map<string, HelpRequest>();
  for (const item of prev) {
    byId.set(item.id, item);
  }
  for (const item of next) {
    const existing = byId.get(item.id);
    if (!existing) return false;
    if (!helpRequestsEqual(existing, item)) return false;
  }
  return true;
}

export default function Home() {
  console.log("Home render");
  const navigate = useNavigate();
  const location = useLocation();
  const { notify, dismiss } = useNotifications();

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
  const [navigationPromptOpen, setNavigationPromptOpen] = React.useState(false);
  const navigationResolverRef = React.useRef<((choice: "google" | "waze" | "cancel") => void) | null>(null);
  const pendingFocusRef = React.useRef<string | null>(null);
  const mapSectionRef = React.useRef<HTMLDivElement | null>(null);

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
  const isAdmin = Boolean(profile?.isAdmin ?? profile?.roles?.admin);
  const [showOnboardingPrompt, setShowOnboardingPrompt] = React.useState(false);

  // Cache for requester/helper quick lookup
  const userCacheRef = React.useRef<Record<string, any>>({});

  function deriveUserName(data: any): string | null {
    if (!data) return null;
    const direct =
      typeof data.name === "string" && data.name.trim() !== ""
        ? data.name.trim()
        : null;
    if (direct) return direct;

    const display =
      typeof data.displayName === "string" && data.displayName.trim() !== ""
        ? data.displayName.trim()
        : null;
    if (display) return display;

    const profileDisplay =
      typeof data.profile?.displayName === "string" &&
      data.profile.displayName.trim() !== ""
        ? data.profile.displayName.trim()
        : null;
    if (profileDisplay) return profileDisplay;

    const first =
      typeof data.firstName === "string" ? data.firstName.trim() : "";
    const last =
      typeof data.lastName === "string" ? data.lastName.trim() : "";

    if (first || last) {
      return [first, last].filter(Boolean).join(" ").trim() || null;
    }

    const profileFirst =
      typeof data.profile?.firstName === "string"
        ? data.profile.firstName.trim()
        : "";
    const profileLast =
      typeof data.profile?.lastName === "string"
        ? data.profile.lastName.trim()
        : "";
    if (profileFirst || profileLast) {
      return [profileFirst, profileLast].filter(Boolean).join(" ").trim() || null;
    }

    return null;
  }

  function deriveUserPhone(data: any): string | null {
    if (!data) return null;
    if (
      typeof data.phone === "string" &&
      data.phone.trim() !== ""
    ) {
      return data.phone.trim();
    }
    if (
      typeof data.profile?.phone === "string" &&
      data.profile.phone.trim() !== ""
    ) {
      return data.profile.phone.trim();
    }
    return null;
  }

  const updateOpenItems = React.useCallback((items: HelpRequest[]) => {
    setOpenItems((prev) =>
      areHelpRequestListsEqual(prev, items) ? prev : items
    );
  }, []);

  const seenDoneRef = React.useRef<Set<string>>(new Set());

  const updateParticipating = React.useCallback(
    (items: HelpRequest[]) => {
      for (const r of items) {
        if (r.status === "done" && !seenDoneRef.current.has(r.id)) {
          seenDoneRef.current.add(r.id);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
          notify({
            message: `Request "${r.title}" completed 🎉`,
            variant: "success",
          });
        }
      }

      setParticipating((prev) =>
        areHelpRequestListsEqual(prev, items) ? prev : items
      );
    },
    [notify]
  );

  const focusRequestOnMap = React.useCallback(
    (requestId: string) => {
      setSelectedId(requestId);
      setSelectedTick((t) => t + 1);

      if (mapSectionRef.current) {
        const rect = mapSectionRef.current.getBoundingClientRect();
        const offsetTop = window.scrollY + rect.top - 120;
        window.scrollTo({
          top: offsetTop > 0 ? offsetTop : 0,
          behavior: "smooth",
        });
      }
    },
    []
  );

  React.useEffect(() => {
    const pendingId = pendingFocusRef.current;
    if (!pendingId) return;
    const hasRequest = [...openItems, ...participating].some(
      (req) => req.id === pendingId
    );
    if (hasRequest) {
      focusRequestOnMap(pendingId);
      pendingFocusRef.current = null;
    }
  }, [openItems, participating, focusRequestOnMap]);

  // =========================================================================
  // 🔹 EFFECT: Require onboarding info (firstName, lastName, birthdate, phone, address)
  // =========================================================================
  React.useEffect(() => {
    if (!user) {
      setShowOnboardingPrompt(false);
      return;
    }

    if (profile === undefined) {
      return;
    }

    const needsOnboarding =
      !profile ||
      !profile.firstName ||
      !profile.lastName ||
      !profile.birthdateISO ||
      !profile.phone ||
      !profile.address;

    setShowOnboardingPrompt(needsOnboarding);
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
  // 🔹 EFFECT: Global open requests listener (fallback before map bounds)
  // =========================================================================
  React.useEffect(() => {
    if (mapBounds) return;
    const unsub = listenOpenRequests(updateOpenItems);
    return () => unsub();
  }, [mapBounds, updateOpenItems]);

  // =========================================================================
  // 🔹 EFFECT: Nearby open requests when map changes bounds
  // =========================================================================
  React.useEffect(() => {
    if (!mapBounds) return;

    let range: { start: string; end: string } | null = null;
    try {
      const centerLat = (mapBounds.north + mapBounds.south) / 2;
      const centerLng = (mapBounds.east + mapBounds.west) / 2;
      const cornerDistanceKm = haversineKm(
        { lat: centerLat, lng: centerLng },
        { lat: mapBounds.north, lng: mapBounds.east }
      );
      const radiusMeters = Math.max(cornerDistanceKm, 0.25) * 1000;

      const bounds = geohashQueryBounds(
        [centerLat, centerLng],
        radiusMeters
      );
      if (bounds?.length > 0) {
        const [start, end] = bounds[0];
        range = { start, end };
      }
    } catch {
      range = null;
    }

    const unsub = listenOpenRequestsNearby(mapBounds, range, updateOpenItems);
    return () => unsub();
  }, [mapBounds, updateOpenItems]);

  // =========================================================================
  // 🔹 EFFECT: Participating requests (my accepted / in_progress etc.)
  // =========================================================================
  React.useEffect(() => {
    if (!myId) return;
    const unsub = listenParticipatingRequests(myId, updateParticipating);
    return () => unsub();
  }, [myId, updateParticipating]);

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
    const cached = userCacheRef.current[uid];
    if (cached) {
      const info = {
        name: deriveUserName(cached),
        phone: deriveUserPhone(cached),
      };
      userCacheRef.current[uid] = { ...cached, ...info };
      return info;
    }
    try {
      const d = await fetchUserProfile(uid);
      const info = {
        name: deriveUserName(d),
        phone: deriveUserPhone(d),
      };
      userCacheRef.current[uid] = { ...d, ...info };
      return info;
    } catch {
      const info = { name: null, phone: null };
      userCacheRef.current[uid] = info;
      return info;
    }
  }

  const openChatFor = React.useCallback(
    async (req: HelpRequest) => {
      if (!myId || !req.helperId) return;

      const otherId = req.requesterId === myId ? req.helperId : req.requesterId;

      try {
        const chat = await getOrCreateChat(req.id, myId, otherId);

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
        activeChatRef.current = chat.id;
        const pendingNotification = chatNotificationRef.current[chat.id];
        if (pendingNotification) {
          dismiss(pendingNotification);
          delete chatNotificationRef.current[chat.id];
        }
      } catch (e) {
        console.error("openChatFor failed:", e);
        notify({ message: "Couldn't open chat.", variant: "error" });
      }
    },
    [dismiss, myId, notify]
  );

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
      notify({ message: "This request was accepted by someone else.", variant: "warning" });
    }
  }

  // requester marks request as done → triggers confetti + review prompts for both sides
  async function handleMarkDone(req: HelpRequest) {
    if (!myId && !isAdmin) return;
    if (!isAdmin && myId !== req.requesterId) return;

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

      notify({ message: "Marked as done ✅", variant: "success" });
    } catch (err) {
      console.error("markDone failed:", err);
      notify({ message: "Failed to mark as done", variant: "error" });
    }
  }

  async function handleDeleteRequest(req: HelpRequest) {
    if (!myId && !isAdmin) return;
    if (!isAdmin && req.requesterId !== myId) return;
    if (!isAdmin && (req.status !== "open" || req.helperId)) {
      notify({ message: "Requests can be removed only before someone accepts them.", variant: "warning" });
      return;
    }

    const confirmed = window.confirm(
      `Delete "${req.title}"? This will remove the request so others can no longer see it.`
    );
    if (!confirmed) return;

    try {
      await deleteOpenRequest(req.id);
      setOpenItems((items) => items.filter((item) => item.id !== req.id));
      setSelectedId((id) => (id === req.id ? undefined : id));
      notify({ message: "Request deleted.", variant: "info" });
    } catch (error: any) {
      console.error("delete request failed:", error);
      notify({
        message: error?.message ?? "Could not delete request.",
        variant: "error",
      });
    }
  }

  const promptNavigationPlatform = React.useCallback(
    () =>
      new Promise<"google" | "waze" | "cancel">((resolve) => {
        navigationResolverRef.current = (choice) => {
          navigationResolverRef.current = null;
          setNavigationPromptOpen(false);
          resolve(choice);
        };
        setNavigationPromptOpen(true);
      }),
    []
  );

  const chooseNavigation = React.useCallback((choice: "google" | "waze" | "cancel") => {
    const resolver = navigationResolverRef.current;
    if (resolver) {
      resolver(choice);
    }
  }, []);

  React.useEffect(() => {
    if (!navigationPromptOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        chooseNavigation("cancel");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigationPromptOpen, chooseNavigation]);

  const handleNavigateTo = React.useCallback(
    async (req: HelpRequest) => {
      if (!req.location) {
        notify({ message: "This request is missing location details.", variant: "error" });
        return;
      }

      const provider = await promptNavigationPlatform();
      if (provider === "cancel") {
        notify({ message: "Navigation cancelled.", variant: "info" });
        return;
      }

      let origin = userLoc;

      if (!origin && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
            })
          );
          origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLoc(origin);
        } catch {
          notify({ message: "Using your saved location to open directions.", variant: "info" });
        }
      }

      const destinationParam = `${req.location.lat},${req.location.lng}`;
      const originParam = origin
        ? `${origin.lat},${origin.lng}`
        : "My+Location";

      const url =
        provider === "google"
          ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
              originParam
            )}&destination=${encodeURIComponent(
              destinationParam
            )}&travelmode=walking`
          : `https://www.waze.com/ul?ll=${encodeURIComponent(
              destinationParam
            )}&navigate=yes`;

      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        notify({ message: "Couldn't open navigation. Please try again.", variant: "error" });
      }
    },
    [promptNavigationPlatform, setUserLoc, userLoc, notify]
  );

  // =========================================================================
  // 🔹 EFFECT: Chat toast notifications
  //   - Listen to chats of my active/in_progress/accepted requests
  //   - Show notification for new messages if I'm not currently focused on that chat
  // =========================================================================
  const chatSubsRef = React.useRef<Record<string, () => void>>({});
  const lastMsgRef = React.useRef<Record<string, string>>({});
  const initializedRef = React.useRef<Record<string, boolean>>({});
  const activeChatRef = React.useRef<string | null>(null);
  const chatNotificationRef = React.useRef<Record<string, number>>({});

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
          // First run for this chat: initialize and don't notify old backlog
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

          // Don't notify for my own message
          if (last.senderId === myId) {
            lastMsgRef.current[cid] = last.id;
            const existingNotification = chatNotificationRef.current[cid];
            if (existingNotification) {
              dismiss(existingNotification);
              delete chatNotificationRef.current[cid];
            }
            return;
          }

          if (lastMsgRef.current[cid] === last.id) return;

          if (activeChatRef.current === cid) {
            lastMsgRef.current[cid] = last.id;
            return;
          }

          lastMsgRef.current[cid] = last.id;

          let senderName = "New message";
          try {
            const senderInfo = await ensureUser(last.senderId);
            if (senderInfo?.name) senderName = senderInfo.name;
          } catch {
            /* ignore */
          }

          const existingNotification = chatNotificationRef.current[cid];
          if (existingNotification) {
            dismiss(existingNotification);
            delete chatNotificationRef.current[cid];
          }

          const preview = last.text.length > 100 ? `${last.text.slice(0, 97)}…` : last.text;
          const notificationId = notify({
            title: `${senderName} • ${r.title}`,
            message: preview,
            variant: "info",
            action: {
              label: "Open chat",
              onClick: () => openChatFor(r),
            },
            duration: 8000,
          });
          chatNotificationRef.current[cid] = notificationId;
        });

        existing[cid] = unsub;
      }

      // Cleanup chats we no longer participate in
      for (const [cid, u] of Object.entries(existing)) {
        if (!stillNeeded[cid]) {
          try {
            u();
          } catch {}
          const pendingNotification = chatNotificationRef.current[cid];
          if (pendingNotification) {
            dismiss(pendingNotification);
            delete chatNotificationRef.current[cid];
          }
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
      chatNotificationRef.current = {};
      activeChatRef.current = null;
    };
  }, [participating, myId, notify, dismiss, openChatFor]);

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

  const totalHelping = participating.filter(
    (r) => r.status === "accepted" || r.status === "in_progress"
  ).length;
  const filteredPreview = filtered.slice(0, 6);
  const previewCount = filteredPreview.length;

  React.useEffect(() => {
    const state = location.state as { openNewRequest?: boolean; focusRequestId?: string } | null;
    let shouldReset = false;

    if (state?.openNewRequest) {
      setOpenModal(true);
      shouldReset = true;
    }

    if (state?.focusRequestId) {
      pendingFocusRef.current = state.focusRequestId;
      shouldReset = true;
    }

    if (shouldReset) {
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const handleGoogleSync = React.useCallback(async () => {
    try {
      await signInWithGoogle();
      notify({ message: "Google sync enabled", variant: "success" });
    } catch (error: any) {
      const message = error?.message ?? "Failed to connect Google";
      notify({ message: message, variant: "error" });
    }
  }, [notify]);

  return (
    <AuthGate>
      <Navbar />
      {showConfetti && (
        <>
          <Confetti recycle={false} numberOfPieces={320} />
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center text-2xl font-semibold text-white drop-shadow-lg">
            🎉 Great job helping!
          </div>
        </>
      )}
      {showOnboardingPrompt && user && (
        <OnboardingPrompt
          uid={user.uid}
          onSaved={() => {
            setShowOnboardingPrompt(false);
            notify({ message: "Profile saved 🎉", variant: "success" });
          }}
        />
      )}
      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        otherName={reviewContext?.otherName}
        requestTitle={reviewContext?.requestTitle ?? undefined}
        onSubmit={async (rating, comment /* , imageFile */) => {
          if (!myId || !reviewContext) return;
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
          notify({ message: "Thanks for your review!", variant: "success" });
        }}
      />
      <div
        className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-emerald-50"
        aria-hidden={showOnboardingPrompt ? true : undefined}
      >
        <div className="pointer-events-none absolute inset-0">
          <span className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
          <span className="absolute right-[-12%] top-40 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
          <span className="absolute bottom-[-10%] left-[20%] h-64 w-64 rounded-full bg-purple-200/35 blur-3xl" />
        </div>
        <main className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
          <ScrollReveal className="rounded-3xl border border-white/40 bg-white/85 p-6 shadow-xl backdrop-blur">
            <header className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-1 text-xs font-semibold text-indigo-600">
                  <span role="img" aria-hidden>
                    📡
                  </span>
                  Nearby help board
                </div>

                <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  Find requests around you and lend a hand
                </h1>

                <p className="text-sm text-gray-600 sm:text-base">
                  Watch the map update in real-time, claim a task, chat with the requester, and mark it done to celebrate together.
                </p>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="space-y-3 rounded-3xl border border-white/50 bg-white/80 p-4 shadow-inner shadow-indigo-100/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Sync devices
                  </p>
                  <button
                  onClick={handleGoogleSync}
                    className="flex items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
                >
                    <img src={googleLogo} alt="" className="h-5 w-5" />
                  Continue with Google to sync devices
                  </button>
              </div>

                <div className="rounded-3xl border border-white/50 bg-gradient-to-br from-indigo-500/10 via-white to-emerald-500/10 p-4 text-sm shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Activity snapshot
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl border border-white/60 bg-white/80 p-3 shadow-inner">
                      <div className="text-gray-500">Requests open</div>
                      <div className="text-lg font-semibold text-gray-900">{openItems.length}</div>
            </div>
                    <div className="rounded-2xl border border-white/60 bg-white/80 p-3 shadow-inner">
                      <div className="text-gray-500">Helping now</div>
                      <div className="text-lg font-semibold text-gray-900">{totalHelping}</div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <section className="mt-6 grid gap-6 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Radius (km)
                </label>
                <input
                  value={radiusKm}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    setRadiusKm(Number.isNaN(raw) ? 0 : raw);
                  }}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-2 text-sm shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="5"
                />
                <p className="mt-2 text-xs text-gray-500">Measured from your current location.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-2 text-sm shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="all">All</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Dashboard
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm">
                    <div className="text-gray-500">Requests open</div>
                    <div className="text-lg font-semibold text-gray-900">{openItems.length}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm">
                    <div className="text-gray-500">Helping now</div>
                    <div className="text-lg font-semibold text-gray-900">{totalHelping}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setRadiusKm(5);
                    setCategoryFilter("all");
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
                >
                  Reset filters
                </button>
              </div>
            </section>
          </ScrollReveal>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ScrollReveal ref={mapSectionRef} className="rounded-3xl border border-white/40 bg-white/85 p-4 shadow-xl backdrop-blur" delay={0.05}>
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
                onDelete={(req) => handleDeleteRequest(req)}
                onLocated={(loc) => setUserLoc(loc)}
                onBoundsChange={(b) => setMapBounds(b)}
                onOpenProfile={(uid) => navigate(`/u/${uid}`)}
                onNavigate={handleNavigateTo}
                className={`h-[420px] rounded-3xl border border-indigo-100 shadow-inner ${
                  openModal ? "pointer-events-none opacity-40" : ""
                }`}
              />
            </ScrollReveal>

            <div className="space-y-4">
              <ScrollReveal className="rounded-3xl border border-white/40 bg-white/85 p-4 shadow-xl backdrop-blur" delay={0.1}>
                <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Nearby requests</h3>
                    <p className="text-xs text-gray-500">Tap to focus on the map, claim, or open chat.</p>
                  </div>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                    {filtered.length} active
                  </div>
                </header>
                <ul className="space-y-3">
                  {filtered.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-gray-200 bg-white/90 p-4 text-sm text-gray-500">
                      {userLoc
                        ? "No requests match your filters right now. Widen the radius or check back soon."
                        : "Enable location to filter by distance, or adjust filters to discover more requests."}
                    </li>
                  ) : (
                    filteredPreview.map((r) => {
                      const iAmRequester = r.requesterId === myId;
                      const iAmHelper = r.helperId === myId;
                      const iAmParticipant = iAmRequester || iAmHelper;
                      const dist =
                        r.__distanceKm != null ? `${r.__distanceKm.toFixed(1)} km` : null;
                      return (
                        <li
                          key={r.id}
                          className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                        >
                          <div className="flex items-start gap-3">
                            <button
                              className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-100"
                              onClick={() => {
                                focusRequestOnMap(r.id);
                              }}
                              title="Focus on map"
                            >
                              Map
                            </button>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-semibold text-gray-900">{r.title}</h4>
                                <span
                                  className={`rounded-full px-2 py-[2px] text-[11px] ${
                                    r.status === "open"
                                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : r.status === "done"
                                      ? "border border-gray-200 bg-gray-100 text-gray-700"
                                      : "border border-amber-200 bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {r.status.replace("_", " ")}
                                </span>
                                {dist && (
                                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-[1px] text-[11px] text-indigo-600">
                                    {dist}
                                  </span>
                                )}
                              </div>
                              {r.description && (
                                <p className="text-sm text-gray-600">{r.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                <span title="Category" className="inline-flex items-center gap-1">
                                  <svg viewBox="0 0 24 24" className="h-4 w-4">
                                    <path d="M12 3l9 6-9 6-9-6 9-6zm0 12l9 6-9 6-9-6z" />
                                  </svg>
                                  {r.category}
                                </span>
                                {(typeof r.reward === "number" ||
                                  (typeof r.reward === "string" && r.reward.trim() !== "")) && (
                                  <span title="Reward" className="inline-flex items-center gap-1">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4">
                                      <path d="M12 1v22M5 6h9a4 4 0 110 8H6m0 0h8" strokeWidth="2" fill="none" />
                                    </svg>
                                    {r.reward}
                                  </span>
                                )}
                                <button
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                                  onClick={() => navigate(`/u/${r.requesterId}`)}
                                  title="View profile"
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-indigo-500">
                                    <path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
                                  </svg>
                                  <RequesterName uid={r.requesterId} cacheRef={userCacheRef} />
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {r.status === "open" && myId && !iAmRequester && (
                                  <button
                                    onClick={() => handleAcceptAndChat(r)}
                                    className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                                  >
                                    I can help
                                  </button>
                                )}
                                {iAmRequester && r.status === "open" && (
                                  <button
                                    onClick={() => handleDeleteRequest(r)}
                                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
                                  >
                                    Delete
                                  </button>
                                )}
                                {iAmParticipant &&
                                  (r.status === "in_progress" || r.status === "accepted") && (
                                    <button
                                      onClick={() => openChatFor(r)}
                                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
                                    >
                                      Open chat
                                    </button>
                                  )}
                                {iAmRequester &&
                                  (r.status === "in_progress" || r.status === "accepted") && (
                                    <button
                                      onClick={() => handleMarkDone(r)}
                                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600"
                                    >
                                      Mark done
                                    </button>
                                  )}
                                {r.location && (
                                  <button
                                    onClick={() => handleNavigateTo(r)}
                                    className="rounded-full border border-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                                  >
                                    Navigate
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
                {filtered.length > filteredPreview.length && (
                  <button
                    className="mt-3 w-full rounded-xl border border-gray-200 bg-white/90 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
                    onClick={() =>
                      notify({
                        message: "Use the map or adjust filters to explore more requests.",
                        variant: "info",
                      })
                    }
                  >
                    Showing first {previewCount} only — zoom map for more
                  </button>
                )}
              </ScrollReveal>

              <ScrollReveal className="rounded-3xl border border-white/40 bg-white/85 p-4 shadow-xl backdrop-blur" delay={0.15}>
                <header className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Active conversations</h3>
                  <p className="text-xs text-gray-500">
                    Chats open automatically when you accept or request help.
                  </p>
                </header>
                {participating.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white/90 p-4 text-sm text-gray-500">
                    Accept a nearby request or create one to start chatting.
                  </div>
                ) : (
                  <ul className="space-y-2 text-xs text-gray-700">
                    {participating.slice(0, 3).map((req) => (
                      <li key={req.id} className="rounded-2xl border border-gray-100 bg-white/90 p-3">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{req.title}</div>
                            <div className="text-[11px] text-gray-500">
                              {req.status.replace("_", " ")}
                            </div>
                          </div>
                          <button
                            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
                            onClick={() => openChatFor(req)}
                          >
                            Open chat
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollReveal>

              <ScrollReveal className="rounded-3xl border border-white/40 bg-white/85 p-4 shadow-xl backdrop-blur" delay={0.2}>
                <header className="mb-3 text-sm">
                  <h3 className="text-lg font-semibold text-gray-900">Need a hand right now?</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Post a fresh request or jump back to the map to see who needs you most.
                  </p>
                </header>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      const targetId = selectedId ?? filtered[0]?.id ?? participating[0]?.id;
                      if (targetId) focusRequestOnMap(targetId);
                    }}
                    className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
                  >
                    Back to map focus
                  </button>
                  <button
                    onClick={() => setOpenModal(true)}
                    className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500"
                  >
                    Create new request
                  </button>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </main>
      </div>

      <NewRequestModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        userLocation={userLoc}
      />

      {chatMeta && chatMeta.id !== "pending" && (
        <ChatPanel
          chatId={chatMeta.id}
          onClose={() => {
            setChatMeta(null);
            activeChatRef.current = null;
          }}
          requestTitle={chatMeta.requestTitle}
          otherUser={chatMeta.otherUser}
        />
      )}

      {navigationPromptOpen && (
        <motion.div
          className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/40 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => chooseNavigation("cancel")}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl border border-white/50 bg-white/95 p-6 shadow-2xl backdrop-blur"
            initial={{ scale: 0.92, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 18 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Choose navigation app</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Open directions in your preferred map application.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => chooseNavigation("google")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:bg-indigo-500"
                >
                  Open Google Maps
                </button>
                <button
                  onClick={() => chooseNavigation("waze")}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  Open Waze
                </button>
              </div>
              <button
                onClick={() => chooseNavigation("cancel")}
                className="text-xs font-medium text-gray-400 underline-offset-4 transition hover:text-gray-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AuthGate>
  );
}
