// src/pages/ProfilePage.tsx

import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuthUser } from "../lib/useAuthUser";
import Navbar from "../components/Navbar";
import BioEditor from "../components/BioEditor";
import { listenUserHistory, type HelpRequest } from "../lib/requests";
import googleLogo from "../assets/Logo-google-icon-PNG.png";

/* ------------------------------------------------------------------
   Firestore types
------------------------------------------------------------------ */
type UserDoc = {
  // legacy / display
  displayName?: string | null;
  name?: string | null;
  profile?: { displayName?: string | null } | null;
  photoURL?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;

  // old phone shapes
  phone?: string | null;
  phoneNumber?: string | null;
  contact?: { phone?: string | null } | null;

  // ✅ new onboarding fields
  firstName?: string | null;
  lastName?: string | null;
  birthdateISO?: string | null; // "YYYY-MM-DD"
  address?: string | null; // we'll store whatever formatted address string we saved
  // we still support phone from above
};

type Review = {
  id: string;
  requestId: string;
  requestTitle?: string | null;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  createdAt?: any; // Firestore Timestamp or millis
  imageUrl?: string | null;
  reviewerName?: string | null;
};

export default function ProfilePage() {
  /* ------------------------------------------------------------------
     Routing / auth info
  ------------------------------------------------------------------ */
  const { uid: profileUidFromRoute } = useParams();
  const navigate = useNavigate();

  const me = useAuthUser();
  const myUid = me?.uid ?? null;

  // Which profile are we looking at?
  const profileUid = profileUidFromRoute || myUid || null;

  // Is this my own profile?
  const isMe = !!myUid && !!profileUid && myUid === profileUid;

  // showPrivateFields means: can we show phone/bio/history/etc?
  const showPrivateFields = isMe;

  /* ------------------------------------------------------------------
     USER DOC STATE
  ------------------------------------------------------------------ */
  const [userInfo, setUserInfo] = React.useState<{
    displayName: string;
    photoURL?: string | null;

    // "public-ish" bio
    bio?: string | null;

    // private fields
    firstName?: string | null;
    lastName?: string | null;
    birthdateISO?: string | null;
    phone?: string | null;
    address?: string | null;
  }>({
    displayName: "",
    photoURL: undefined,
    bio: null,
    firstName: null,
    lastName: null,
    birthdateISO: null,
    phone: null,
    address: null,
  });

  React.useEffect(() => {
    if (!profileUid) return;
    const userRef = doc(db, "users", profileUid);

    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        const d = snap.data() as UserDoc | undefined;
        if (!d) {
          setUserInfo({
            displayName: "Unknown user",
            photoURL: undefined,
            bio: null,
            firstName: null,
            lastName: null,
            birthdateISO: null,
            phone: null,
            address: null,
          });
          return;
        }

        // prefer newer naming (firstName + lastName) for displayName if available
        const composedName =
          [d.firstName, d.lastName].filter(Boolean).join(" ").trim();

        const fallbackDisplayName =
          d.displayName ??
          d.name ??
          d.profile?.displayName ??
          "Unknown user";

        const displayName =
          composedName.length > 0 ? composedName : fallbackDisplayName;

        // phone priority
        const phoneVal =
          d.phone ??
          d.phoneNumber ??
          d.contact?.phone ??
          null;

        const photoURL = d.photoURL ?? d.avatarUrl ?? null;
        const bio = d.bio ?? null;

        setUserInfo({
          displayName,
          photoURL,
          bio,

          firstName: d.firstName ?? null,
          lastName: d.lastName ?? null,
          birthdateISO: d.birthdateISO ?? null,
          phone: phoneVal,
          address: d.address ?? null,
        });
      },
      () => {
        setUserInfo({
          displayName: "Unknown user",
          photoURL: undefined,
          bio: null,
          firstName: null,
          lastName: null,
          birthdateISO: null,
          phone: null,
          address: null,
        });
      }
    );

    return () => {
      unsubUser();
    };
  }, [profileUid]);

  /* ------------------------------------------------------------------
     REVIEWS STATE
  ------------------------------------------------------------------ */
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [avgRating, setAvgRating] = React.useState<number | null>(null);

  // pagination for reviews
  const REVIEWS_PAGE_SIZE = 5;
  const [reviewsPage, setReviewsPage] = React.useState(0);

  // cache reviewer display names so we don't fetch repeatedly
  const reviewerNameCacheRef = React.useRef<Record<string, string>>({});

  async function getReviewerName(uid: string): Promise<string> {
    if (reviewerNameCacheRef.current[uid]) {
      return reviewerNameCacheRef.current[uid];
    }
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const d = snap.data() as any | undefined;

      // try firstName/lastName first for reviewer
      const combo = [d?.firstName, d?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const nm =
        (combo && combo.length > 0
          ? combo
          : d?.displayName ??
            d?.name ??
            d?.profile?.displayName ??
            "Someone") || "Someone";

      reviewerNameCacheRef.current[uid] = nm;
      return nm;
    } catch {
      reviewerNameCacheRef.current[uid] = "Someone";
      return "Someone";
    }
  }

  React.useEffect(() => {
    if (!profileUid) return;
    let cancelled = false;

    // NOTE: no orderBy here, we sort manually to avoid composite index issues.
    const qy = query(
      collection(db, "reviews"),
      where("revieweeId", "==", profileUid)
    );

    const unsub = onSnapshot(
      qy,
      async (snap) => {
        // raw reviews
        const raw: Review[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            requestId: data.requestId,
            requestTitle: data.requestTitle ?? null,
            reviewerId: data.reviewerId,
            revieweeId: data.revieweeId,
            rating: data.rating,
            comment: data.comment ?? "",
            createdAt: data.createdAt,
            imageUrl: data.imageUrl ?? null,
            reviewerName: null,
          };
        });

        // newest first
        raw.sort((a, b) => {
          const ta =
            a.createdAt?.toMillis?.() ??
            (typeof a.createdAt === "number" ? a.createdAt : 0);
          const tb =
            b.createdAt?.toMillis?.() ??
            (typeof b.createdAt === "number" ? b.createdAt : 0);
          return tb - ta;
        });

        // hydrate reviewer names
        const hydrated = await Promise.all(
          raw.map(async (rev) => {
            const nm = await getReviewerName(rev.reviewerId);
            return { ...rev, reviewerName: nm };
          })
        );

        if (cancelled) return;

        setReviews(hydrated);

        // recalc avg
        if (hydrated.length === 0) {
          setAvgRating(null);
        } else {
          const sum = hydrated.reduce(
            (acc, r) => acc + (typeof r.rating === "number" ? r.rating : 0),
            0
          );
          setAvgRating(sum / hydrated.length);
        }
      },
      (err) => {
        console.error("reviews snapshot error:", err);
        if (!cancelled) {
          setReviews([]);
          setAvgRating(null);
        }
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [profileUid]);

  // derived pagination for reviews
  const totalReviewsPages = React.useMemo(() => {
    if (reviews.length === 0) return 0;
    return Math.ceil(reviews.length / REVIEWS_PAGE_SIZE);
  }, [reviews]);

  const pagedReviews = React.useMemo(() => {
    const start = reviewsPage * REVIEWS_PAGE_SIZE;
    return reviews.slice(start, start + REVIEWS_PAGE_SIZE);
  }, [reviews, reviewsPage]);

  // reset review page if profile changes OR reviews array shrinks
  React.useEffect(() => {
    setReviewsPage(0);
  }, [profileUid]);

  React.useEffect(() => {
    // clamp page index if total pages shrinks
    if (totalReviewsPages > 0 && reviewsPage + 1 > totalReviewsPages) {
      setReviewsPage(totalReviewsPages - 1);
    }
  }, [totalReviewsPages, reviewsPage]);

  /* ------------------------------------------------------------------
     HISTORY STATE (me only)
  ------------------------------------------------------------------ */
  const [historyAll, setHistoryAll] = React.useState<HelpRequest[]>([]);
  const [editingProfile, setEditingProfile] = React.useState(false);

  React.useEffect(() => {
    if (!showPrivateFields && editingProfile) {
      setEditingProfile(false);
    }
  }, [showPrivateFields, editingProfile]);

  React.useEffect(() => {
    if (!isMe || !myUid) return;
    const unsub = listenUserHistory(myUid, (rows) => {
      setHistoryAll(rows);
    });
    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, [isMe, myUid]);

  // filters for my history
  const [roleFilter, setRoleFilter] = React.useState<
    "all" | "as_requester" | "as_helper"
  >("all");

  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "open" | "accepted" | "in_progress" | "done"
  >("all");

  // pagination (5 per page) for history
  const HISTORY_PAGE_SIZE = 5;
  const [historyPage, setHistoryPage] = React.useState(0);

  const filteredHistory = React.useMemo(() => {
    if (!isMe) return [];

    let rows = historyAll;

    if (roleFilter === "as_requester") {
      rows = rows.filter((r) => r.requesterId === myUid);
    } else if (roleFilter === "as_helper") {
      rows = rows.filter((r) => r.helperId === myUid);
    }

    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    return rows;
  }, [historyAll, roleFilter, statusFilter, isMe, myUid]);

  const pagedHistory = React.useMemo(() => {
    if (!isMe) return [];
    const start = historyPage * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistory, historyPage, isMe]);

  const totalHistoryPages = isMe
    ? Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE)
    : 0;

  // reset page when filters change
  React.useEffect(() => {
    setHistoryPage(0);
  }, [roleFilter, statusFilter]);

  const profileStats = React.useMemo(() => {
    const base = {
      totalReviews: reviews.length,
      avgRating,
    };

    if (!isMe || !myUid) {
      return {
        ...base,
        completedRequests: null,
        helpedCount: null,
        requestedCount: null,
      };
    }

    const completedRequests = historyAll.filter(
      (req) => req.status === "done"
    ).length;
    const helpedCount = historyAll.filter((req) => req.helperId === myUid).length;
    const requestedCount = historyAll.filter(
      (req) => req.requesterId === myUid
    ).length;

    return {
      ...base,
      completedRequests,
      helpedCount,
      requestedCount,
    };
  }, [avgRating, historyAll, isMe, myUid, reviews.length]);

  /* ------------------------------------------------------------------
     formatting helpers
  ------------------------------------------------------------------ */
  function Stars({ rating }: { rating: number }) {
    const stars = [1, 2, 3, 4, 5];
    return (
      <div className="flex items-center gap-[2px] text-[14px] leading-none">
        {stars.map((i) => (
          <span
            key={i}
            className={i <= rating ? "text-amber-400" : "text-gray-300"}
          >
            ★
          </span>
        ))}
      </div>
    );
  }

  function ddmmyy(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  }

  function formatWhen(ts: any) {
    if (!ts) return "";
    if (typeof ts === "number") {
      const d = new Date(ts);
      return ddmmyy(d);
    }
    if (typeof ts.toDate === "function") {
      const d = ts.toDate() as Date;
      return ddmmyy(d);
    }
    return "";
  }

  function formatReqDate(req: HelpRequest) {
    const t = (req as any).createdAt;
    if (!t) return "";
    if (typeof t === "number") return ddmmyy(new Date(t));
    if (typeof t.toDate === "function") return ddmmyy(t.toDate() as Date);
    return "";
  }

  function statusChipClasses(status: string) {
    if (status === "open")
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "done")
      return "border border-gray-200 bg-gray-100 text-gray-700";
    // accepted / in_progress
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }

  const handleBack = React.useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleFocusRequest = React.useCallback(
    (requestId: string) => {
      navigate("/", { state: { focusRequestId: requestId } });
    },
    [navigate]
  );

  /* ------------------------------------------------------------------
     Tabs state
  ------------------------------------------------------------------ */
  const [activeTab, setActiveTab] = React.useState<"reviews" | "history">(
    "reviews"
  );

  React.useEffect(() => {
    // if I'm looking at someone else's profile,
    // force tab to "reviews"
    if (!isMe && activeTab !== "reviews") {
      setActiveTab("reviews");
    }
  }, [isMe, activeTab]);

  /* ------------------------------------------------------------------
     helper: render private field rows for myself
  ------------------------------------------------------------------ */
  function PrivateFieldRow({
    icon,
    label,
    value,
  }: {
    icon: string;
    label: string;
    value: string | null | undefined;
  }) {
    if (!value || value.trim() === "") return null;
    return (
      <div className="flex items-start gap-2 break-words">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[12px] text-gray-700 border border-gray-300">
          {icon}
        </span>
        <div className="leading-tight text-sm text-gray-700">
          <div className="font-medium text-gray-900">{label}</div>
          <div className="text-gray-700 break-words">{value}</div>
        </div>
      </div>
    );
  }

  function ProfileHighlights() {
    const reviewSummary =
      profileStats.totalReviews === 0
        ? "No reviews yet"
        : `${profileStats.totalReviews} review${
            profileStats.totalReviews === 1 ? "" : "s"
          }`;

    const highlightItems = isMe
      ? [
          {
            id: "avgRating",
            icon: "⭐",
            label: "Average rating",
            value:
              profileStats.avgRating != null
                ? `${profileStats.avgRating.toFixed(1)} / 5`
                : "Not rated yet",
            hint: reviewSummary,
            gradient: "from-amber-200/40 via-amber-100/20 to-white/80",
          },
          {
            id: "neighborsHelped",
            icon: "🤝",
            label: "Neighbors helped",
            value:
              profileStats.helpedCount != null
                ? profileStats.helpedCount.toLocaleString()
                : "0",
            hint: "Requests you completed",
            gradient: "from-emerald-200/40 via-emerald-100/20 to-white/80",
          },
          {
            id: "requestsPosted",
            icon: "📬",
            label: "Requests posted",
            value:
              profileStats.requestedCount != null
                ? profileStats.requestedCount.toLocaleString()
                : "0",
            hint: "Times you asked for a hand",
            gradient: "from-indigo-200/40 via-indigo-100/20 to-white/80",
          },
          {
            id: "completed",
            icon: "🎉",
            label: "Marked as done",
            value:
              profileStats.completedRequests != null
                ? profileStats.completedRequests.toLocaleString()
                : "0",
            hint: "Finished favors with confetti",
            gradient: "from-purple-200/40 via-purple-100/20 to-white/80",
          },
        ]
      : [
          {
            id: "avgRating",
            icon: "⭐",
            label: "Average rating",
            value:
              profileStats.avgRating != null
                ? `${profileStats.avgRating.toFixed(1)} / 5`
                : "New member",
            hint: reviewSummary,
            gradient: "from-amber-200/40 via-amber-100/20 to-white/80",
          },
          {
            id: "trusted",
            icon: "🛡️",
            label: "Trust badge",
            value: "Verified by neighbors",
            hint: "Phone & email check completed",
            gradient: "from-indigo-200/40 via-sky-100/20 to-white/80",
          },
          {
            id: "response",
            icon: "💬",
            label: "Friendly communicator",
            value: "Fast replies",
            hint: "Keeps conversations warm and clear",
            gradient: "from-emerald-200/40 via-emerald-100/20 to-white/80",
          },
          {
            id: "community",
            icon: "🌱",
            label: "Community impact",
            value: "Spreading good vibes",
            hint: "Helps the neighborhood grow",
            gradient: "from-purple-200/40 via-pink-100/20 to-white/80",
          },
        ];

    return (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {highlightItems.map((card) => (
          <article
            key={card.id}
            className={`relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br ${card.gradient} p-4 shadow-lg shadow-black/5 backdrop-blur transition hover:-translate-y-1 hover:shadow-xl`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-xl shadow-sm">
                {card.icon}
              </span>
              <span className="inline-flex h-8 items-center rounded-full border border-white/60 bg-white/60 px-3 text-xs font-medium text-gray-600">
                {card.label}
              </span>
            </div>
            <div className="mt-4 text-2xl font-semibold text-gray-900">
              {card.value}
            </div>
            <p className="mt-2 text-xs text-gray-600">{card.hint}</p>
          </article>
        ))}
      </section>
    );
  }

  /* ------------------------------------------------------------------
     Profile Header Card
  ------------------------------------------------------------------ */
  function ProfileHeaderCard() {
    // build a "public tagline" for non-owners
    const publicTagline = "Trusted community member";

    // we'll render birthdate in DD/MM/YYYY if it's me
    let birthdatePretty: string | null = null;
    if (userInfo.birthdateISO) {
      const d = new Date(userInfo.birthdateISO);
      if (!Number.isNaN(d.getTime())) {
        birthdatePretty = ddmmyy(d);
      }
    }

    return (
      <section className="relative overflow-hidden rounded-3xl border border-white/50 bg-gradient-to-br from-white/92 via-white/80 to-indigo-50/60 p-6 shadow-xl shadow-indigo-100/40 backdrop-blur">
        <span className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-20 right-8 h-44 w-44 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-indigo-600 shadow-sm">
              <span>🪪</span>
              Profile Snapshot
            </span>

            {avgRating != null ? (
              <div className="flex items-center gap-2 rounded-full border border-amber-200/60 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                <Stars rating={Math.round(avgRating)} />
                <span>{avgRating.toFixed(1)} avg</span>
                <span className="text-[10px] text-amber-600/80">
                  ({reviews.length} review{reviews.length === 1 ? "" : "s"})
                </span>
              </div>
            ) : (
              <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs text-gray-500">
                New to the neighborhood
              </span>
            )}
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex items-center gap-4 sm:flex-col sm:items-start">
              {userInfo.photoURL ? (
                <img
                  src={userInfo.photoURL}
                  alt={userInfo.displayName || "avatar"}
                  className="h-20 w-20 rounded-3xl border-4 border-white object-cover shadow-lg shadow-indigo-200/40"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-4 border-white bg-gradient-to-br from-indigo-500 via-sky-500 to-indigo-400 text-3xl font-semibold text-white shadow-lg shadow-indigo-200/40">
                  {userInfo.displayName
                    ? userInfo.displayName.slice(0, 1).toUpperCase()
                    : "?"}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 px-2 py-[2px] text-[11px] font-medium text-emerald-700">
                  ✅ Verified contact
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100/80 px-2 py-[2px] text-[11px] font-medium text-indigo-700">
                  🛡️ Safety-first
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <div className="text-2xl font-bold text-gray-900 break-words">
                  {userInfo.displayName || "Unknown user"}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {showPrivateFields ? "Your neighborhood identity" : publicTagline}
                </p>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-inner">
                <div className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="mt-1 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-base">
                    💬
                  </span>
                  <p className="leading-relaxed whitespace-pre-line break-words">
                    {userInfo.bio && userInfo.bio.trim() !== ""
                      ? userInfo.bio
                      : "No bio yet — tell neighbors what lights you up."}
                  </p>
                </div>
              </div>

              {showPrivateFields ? (
                <div className="space-y-3">
                  {!editingProfile ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <PrivateFieldRow
                          icon="📞"
                          label="Phone"
                          value={
                            userInfo.phone && userInfo.phone.trim() !== ""
                              ? userInfo.phone
                              : null
                          }
                        />
                        <PrivateFieldRow
                          icon="📍"
                          label="Address"
                          value={
                            userInfo.address && userInfo.address.trim() !== ""
                              ? userInfo.address
                              : null
                          }
                        />
                        <PrivateFieldRow
                          icon="🎂"
                          label="Birth date"
                          value={birthdatePretty ?? null}
                        />
                      </div>

                      <p className="rounded-xl border border-dashed border-indigo-200/60 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
                        These details stay private to you. Helpers only see your name
                        and bio until you accept a request.
                      </p>

                      <button
                        onClick={() => setEditingProfile(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-400 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] hover:shadow-lg"
                      >
                        ✏️ Edit profile
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-inner shadow-indigo-100/30">
                      <BioEditor
                        initialProfile={{
                          phone: userInfo.phone,
                          address: userInfo.address,
                          bio: userInfo.bio,
                          firstName: userInfo.firstName,
                          lastName: userInfo.lastName,
                          birthdateISO: userInfo.birthdateISO,
                        }}
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => setEditingProfile(false)}
                          className="text-xs font-medium text-indigo-600 underline"
                        >
                          Close editor
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-indigo-100/60 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-700 shadow-inner">
                  Want to coordinate? Send a friendly chat after you accept their
                  request to see contact details.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------
     Reviews Tab
  ------------------------------------------------------------------ */
  function ReviewsTab() {
    return (
      <section className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/60 px-3 py-1 text-xs font-semibold text-indigo-600">
              <span>💬</span>
              Voices from the neighborhood
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
            <p className="text-xs text-gray-500">
              Community feedback about {userInfo.displayName || "this user"}.
            </p>
          </div>

          {avgRating != null ? (
            <div className="flex flex-col items-end gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-inner shadow-indigo-100/50">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-lg">
                  ⭐
                </span>
                <div>
                  <div className="font-semibold text-gray-900">
                    {avgRating.toFixed(1)} / 5
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Based on {reviews.length} review
                    {reviews.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <Stars rating={Math.round(avgRating)} />
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 py-3 text-xs text-gray-500 shadow-inner">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm">
                🌱
              </span>
              Be the first to leave a kind word.
            </div>
          )}
        </header>

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/80 p-6 text-sm text-gray-500 shadow-inner">
            No one has left a review here yet. Finish a favor to collect your
            first stars.
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {pagedReviews.map((rev) => (
                <li
                  key={rev.id}
                  className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-indigo-100/40 transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <span className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-indigo-400 via-purple-400 to-emerald-400" />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-lg">
                          ✨
                        </span>
                        <Stars rating={rev.rating} />
                        {rev.reviewerName && (
                          <span className="text-sm text-gray-700">
                            from{" "}
                            <span className="font-semibold text-gray-900">
                              {rev.reviewerName}
                            </span>
                          </span>
                        )}
                      </div>

                      {rev.requestTitle && (
                        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50/80 px-2 py-[2px] text-[11px] font-medium text-indigo-600">
                          <span>📌</span>
                          {rev.requestTitle}
                        </div>
                      )}

                      {rev.comment && rev.comment.trim() !== "" && (
                        <blockquote className="rounded-2xl border border-indigo-100/60 bg-indigo-50/60 p-3 text-sm leading-relaxed text-gray-800 shadow-inner">
                          “{rev.comment}”
                        </blockquote>
                      )}

                      {rev.imageUrl && (
                        <div className="overflow-hidden rounded-xl border border-white/70 shadow-inner">
                          <img
                            src={rev.imageUrl}
                            alt="review attachment"
                            className="max-h-40 w-full object-cover"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2 text-xs text-gray-500">
                      <div className="inline-flex items-center gap-2 rounded-full bg-gray-100/80 px-2 py-1 text-[11px] text-gray-600">
                        <span>🗓️</span>
                        {formatWhen(rev.createdAt) || "date unknown"}
                      </div>
                      {rev.requestId ? (
                        <Link
                          to={`/requests/${rev.requestId}`}
                          className="text-[11px] text-indigo-600 underline underline-offset-4 hover:text-indigo-500"
                        >
                          View request thread
                        </Link>
                      ) : (
                        <span className="text-[11px] text-gray-400">
                          Request archived
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* pagination controls for reviews */}
            {totalReviewsPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <button
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                  disabled={reviewsPage === 0}
                  onClick={() =>
                    setReviewsPage((p) => Math.max(0, p - 1))
                  }
                >
                  Previous
                </button>

                <div className="text-xs text-gray-600">
                  Page {reviewsPage + 1} / {totalReviewsPages}
                </div>

                <button
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                  disabled={reviewsPage + 1 >= totalReviewsPages}
                  onClick={() =>
                    setReviewsPage((p) =>
                      p + 1 < totalReviewsPages ? p + 1 : p
                    )
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  /* ------------------------------------------------------------------
     History Tab
  ------------------------------------------------------------------ */
  function HistoryTab() {
    if (!isMe) return null;

    return (
      <section className="space-y-4">
        {/* header + filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50/60 px-3 py-1 text-xs font-semibold text-emerald-700">
              <span>🗂️</span>
              Your request history
            </div>
            <p className="text-xs text-gray-500">
              A living timeline of requests you created or stepped in to help.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Role
              </label>
              <select
                className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm shadow-inner"
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(e.target.value as typeof roleFilter)
                }
              >
                <option value="all">All</option>
                <option value="as_requester">I asked for help</option>
                <option value="as_helper">I helped someone</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Status
              </label>
              <select
                className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm shadow-inner"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
        </div>

        {/* list */}
        {pagedHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/80 p-6 text-sm text-gray-500 shadow-inner">
            No requests match your filters. Try widening your time frame or role.
          </div>
        ) : (
          <div className="relative">
            <span className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-indigo-200 via-purple-200 to-emerald-200" />
            <ul className="space-y-5">
            {pagedHistory.map((req) => (
              <li
                key={req.id}
                  className="group relative ml-8 rounded-2xl border border-white/70 bg-white/90 p-5 text-sm shadow-lg shadow-indigo-100/40 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                  <span className="absolute -left-8 top-6 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-indigo-500 to-emerald-400 text-white shadow-lg shadow-indigo-200/40">
                    ⏱️
                  </span>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-gray-900">
                          {req.title || "(no title)"}
                        </div>
                        {req.status && (
                          <span
                            className={
                              "inline-flex items-center gap-1 rounded-full px-3 py-[2px] text-[11px] " +
                              statusChipClasses(req.status)
                            }
                          >
                            <span>•</span>
                            {req.status.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      {req.description && (
                        <p className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-gray-700 shadow-inner">
                          {req.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[12px] text-gray-600">
                        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50/80 px-2 py-[2px] text-[11px] font-medium text-indigo-600">
                          <span>📂</span>
                          {req.category || "General"}
                        </span>
                        {(typeof req.reward === "number" ||
                          (typeof req.reward === "string" &&
                            req.reward.trim() !== "")) && (
                          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50/80 px-2 py-[2px] text-[11px] font-medium text-amber-600">
                            <span>💝</span>
                            {req.reward}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100/80 px-2 py-[2px] text-[11px] text-gray-600">
                          <span>🗓️</span>
                          {formatReqDate(req) || "Date unknown"}
                        </span>
                      </div>

                      <div className="text-[11px] font-medium text-gray-500">
                        {req.requesterId === myUid
                          ? "You requested help"
                          : req.helperId === myUid
                          ? "You jumped in to help"
                          : ""}
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2 text-[11px] text-indigo-600">
                      {req.status === "open" || req.status === "accepted" || req.status === "in_progress" ? (
                        <button
                          type="button"
                          onClick={() => handleFocusRequest(req.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-indigo-100/80 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-inner transition hover:-translate-y-0.5 hover:bg-indigo-100"
                        >
                          Open request
                          <span>↗</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100/80 px-3 py-1 text-[11px] font-semibold text-gray-500">
                          Archived
                        </span>
                      )}
                      <span className="text-gray-400">
                        {req.helperId === myUid
                          ? "Saved in your helper archive"
                          : "Logged in your request archive"}
                      </span>
                    </div>
                  </div>
              </li>
            ))}
            </ul>
          </div>
        )}

        {/* pagination controls for history */}
        {totalHistoryPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
              disabled={historyPage === 0}
              onClick={() =>
                setHistoryPage((p) => Math.max(0, p - 1))
              }
            >
              Previous
            </button>

            <div className="text-xs text-gray-600">
              Page {historyPage + 1} / {totalHistoryPages}
            </div>

            <button
              className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
              disabled={historyPage + 1 >= totalHistoryPages}
              onClick={() =>
                setHistoryPage((p) =>
                  p + 1 < totalHistoryPages ? p + 1 : p
                )
              }
            >
              Next
            </button>
          </div>
        )}
      </section>
    );
  }

  /* ------------------------------------------------------------------
     TabBar
  ------------------------------------------------------------------ */
  function TabBar() {
    return (
      <div className="rounded-full border border-white/70 bg-white/70 p-1 text-sm shadow-inner shadow-indigo-100/40">
        <div className="flex gap-1">
          <button
            className={
              "flex-1 rounded-full px-4 py-2 transition " +
              (activeTab === "reviews"
                ? "bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-400 text-white shadow-md shadow-indigo-200/60"
                : "text-gray-500 hover:text-gray-800")
            }
            onClick={() => setActiveTab("reviews")}
          >
            Reviews
          </button>

          {isMe && (
            <button
              className={
                "flex-1 rounded-full px-4 py-2 transition " +
                (activeTab === "history"
                  ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 text-white shadow-md shadow-emerald-200/60"
                  : "text-gray-500 hover:text-gray-800")
              }
              onClick={() => setActiveTab("history")}
            >
              Your history
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------ */
  return (
    <>
      <Navbar />

      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
        <div className="pointer-events-none absolute inset-0">
          <span className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-indigo-200/40 blur-3xl" />
          <span className="absolute right-[-10%] top-40 h-52 w-52 rounded-full bg-emerald-200/40 blur-3xl" />
          <span className="absolute bottom-[-10%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-purple-200/30 blur-3xl" />
        </div>

        <main className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
          <header className="flex flex-col gap-3 text-center sm:text-left">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 self-start rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-xs font-medium text-gray-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs">
                ←
              </span>
              Back to map
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              {showPrivateFields ? "Your HelpHub profile" : "Community member"}
            </h1>
            <p className="text-sm text-gray-600">
              Your reputation grows with every successful request. Keep your
              details up to date and collect reviews to build trust.
            </p>
          </header>

          <ProfileHighlights />

          <ProfileHeaderCard />

          <TabBar />

          <div className="rounded-3xl border border-white/40 bg-white/85 p-6 shadow-xl backdrop-blur">
            {activeTab === "reviews" ? <ReviewsTab /> : <HistoryTab />}
          </div>
        </main>
      </div>
    </>
  );
}
