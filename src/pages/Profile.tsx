// src/pages/ProfilePage.tsx

import React from "react";
import { useNavigate, useParams } from "react-router-dom";
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

import { listenUserHistory, type HelpRequest } from "../lib/requests";

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

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

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
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        {/* top row: Back + average summary */}
        <div className="flex items-start justify-between">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-black"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-xs shadow-sm">
              ←
            </span>
            <span>Back</span>
          </button>

          {avgRating != null && (
            <div className="text-right text-sm text-gray-600">
              <div className="flex items-center justify-end gap-2">
                <Stars rating={Math.round(avgRating)} />
                <span className="text-xs text-gray-500">
                  {avgRating.toFixed(1)} avg
                </span>
              </div>
              <div className="text-[11px] text-gray-400">
                ({reviews.length} review
                {reviews.length === 1 ? "" : "s"})
              </div>
            </div>
          )}
        </div>

        {/* avatar + profile info */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {userInfo.photoURL ? (
              <img
                src={userInfo.photoURL}
                alt={userInfo.displayName || "avatar"}
                className="h-16 w-16 rounded-full border object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-orange-600 text-white text-2xl font-medium shadow-sm">
                {userInfo.displayName
                  ? userInfo.displayName.slice(0, 1).toUpperCase()
                  : "?"}
              </div>
            )}
          </div>

          {/* Text info */}
          <div className="min-w-0 flex-1 space-y-3">
            {/* Name */}
            <div className="text-xl font-semibold text-gray-900 break-words">
              {userInfo.displayName || "Unknown user"}
            </div>

            {/* If it's not me: short tagline */}
            {!showPrivateFields && (
              <p className="text-sm text-gray-500">{publicTagline}</p>
            )}

            {/* If it's me: show all private info */}
            {showPrivateFields && (
              <div className="space-y-3">
                {/* phone */}
                <PrivateFieldRow
                  icon="📞"
                  label="Phone"
                  value={
                    userInfo.phone && userInfo.phone.trim() !== ""
                      ? userInfo.phone
                      : null
                  }
                />

                {/* address */}
                <PrivateFieldRow
                  icon="📍"
                  label="Address"
                  value={
                    userInfo.address && userInfo.address.trim() !== ""
                      ? userInfo.address
                      : null
                  }
                />

                {/* birthdate */}
                <PrivateFieldRow
                  icon="🎂"
                  label="Birth date"
                  value={birthdatePretty ?? null}
                />

                {/* bio */}
                <div className="flex items-start gap-2 break-words">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[12px] text-gray-700 border border-gray-300">
                    💬
                  </span>
                  <span className="leading-tight whitespace-pre-line text-sm text-gray-700">
                    {userInfo.bio && userInfo.bio.trim() !== ""
                      ? userInfo.bio
                      : "No bio yet"}
                  </span>
                </div>

                <p className="text-xs text-gray-400 pt-1">
                  The info above (name, phone, birthday, address, bio) is only
                  fully visible to you. Other people only see your name and bio.
                </p>
              </div>
            )}
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
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Reviews</h2>
            <p className="text-xs text-gray-500">
              Community feedback about{" "}
              {userInfo.displayName || "this user"}.
            </p>
          </div>

          {avgRating != null ? (
            <div className="flex flex-col items-end text-right">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Stars rating={Math.round(avgRating)} />
                <span className="text-xs text-gray-500">
                  {avgRating.toFixed(1)} / 5
                </span>
              </div>

              <div className="text-[11px] text-gray-400">
                {reviews.length} review
                {reviews.length === 1 ? "" : "s"}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 leading-tight">
              No reviews yet
            </div>
          )}
        </header>

        {reviews.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
            No one has left a review here yet.
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {pagedReviews.map((rev) => (
                <li
                  key={rev.id}
                  className="rounded-xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    {/* left side */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={rev.rating} />
                        {rev.reviewerName && (
                          <span className="text-sm text-gray-700 truncate">
                            from{" "}
                            <span className="font-medium text-gray-900">
                              {rev.reviewerName}
                            </span>
                          </span>
                        )}
                      </div>

                      {rev.requestTitle && (
                        <div className="text-[11px] text-gray-500">
                          About:{" "}
                          <span className="italic">{rev.requestTitle}</span>
                        </div>
                      )}

                      {rev.comment && rev.comment.trim() !== "" && (
                        <p className="mt-2 text-sm text-gray-800 whitespace-pre-line break-words">
                          {rev.comment}
                        </p>
                      )}

                      {rev.imageUrl && (
                        <div className="mt-2">
                          <img
                            src={rev.imageUrl}
                            alt="review attachment"
                            className="max-h-40 rounded-lg border object-cover shadow-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* right side */}
                    <div className="flex-shrink-0 text-right text-xs text-gray-500 leading-none">
                      <div>{formatWhen(rev.createdAt)}</div>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">
              Your request history
            </h2>
            <p className="text-xs text-gray-500">
              Requests you created or helped with.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Role
              </label>
              <select
                className="rounded-md border px-2 py-1 text-sm"
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
              <label className="block text-xs text-gray-600 mb-1">
                Status
              </label>
              <select
                className="rounded-md border px-2 py-1 text-sm"
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
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
            No requests match your filters.
          </div>
        ) : (
          <ul className="space-y-3">
            {pagedHistory.map((req) => (
              <li
                key={req.id}
                className="rounded-xl border bg-white p-4 shadow-sm text-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* title + status pill */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-gray-900">
                        {req.title || "(no title)"}
                      </div>
                      {req.status && (
                        <span
                          className={
                            "rounded-full px-2 py-[2px] text-[11px] " +
                            statusChipClasses(req.status)
                          }
                        >
                          {req.status.replace("_", " ")}
                        </span>
                      )}
                    </div>

                    {/* description */}
                    {req.description && (
                      <div className="text-gray-700">
                        {req.description}
                      </div>
                    )}

                    {/* metadata row */}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-gray-600">
                      {/* category */}
                      <span className="inline-flex items-center gap-[4px]">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 text-gray-500"
                        >
                          <path d="M12 3l9 6-9 6-9-6 9-6zm0 12l9 6-9 6-9-6z" />
                        </svg>
                        {req.category}
                      </span>

                      {/* reward */}
                      {(typeof req.reward === "number" ||
                        (typeof req.reward === "string" &&
                          req.reward.trim() !== "")) && (
                        <span className="inline-flex items-center gap-[4px]">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 text-gray-500"
                          >
                            <path
                              d="M12 1v22M5 6h9a4 4 0 110 8H6m0 0h8"
                              strokeWidth="2"
                              fill="none"
                            />
                          </svg>
                          {req.reward}
                        </span>
                      )}

                      {/* createdAt date */}
                      <span className="inline-flex items-center gap-[4px]">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 text-gray-500"
                        >
                          <path d="M7 11h10v2H7z" />
                          <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14z" />
                        </svg>
                        {formatReqDate(req)}
                      </span>
                    </div>

                    {/* role clarification */}
                    <div className="text-[11px] text-gray-500 mt-1">
                      {req.requesterId === myUid
                        ? "You requested help"
                        : req.helperId === myUid
                        ? "You helped here"
                        : ""}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
      <div className="flex border-b text-sm">
        <button
          className={
            "px-4 py-2 -mb-px border-b-2 " +
            (activeTab === "reviews"
              ? "border-black font-medium text-black"
              : "border-transparent text-gray-500 hover:text-black")
          }
          onClick={() => setActiveTab("reviews")}
        >
          Reviews
        </button>

        {isMe && (
          <button
            className={
              "px-4 py-2 -mb-px border-b-2 " +
              (activeTab === "history"
                ? "border-black font-medium text-black"
                : "border-transparent text-gray-500 hover:text-black")
            }
            onClick={() => setActiveTab("history")}
          >
            Your history
          </button>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------ */
  return (
    <>
      <Navbar />

      <main className="mx-auto max-w-3xl p-4 space-y-6">
        {/* Hero card with avatar/name/stars/private fields */}
        <ProfileHeaderCard />

        {/* Tab bar */}
        <TabBar />

        {/* Active tab body */}
        {activeTab === "reviews" ? <ReviewsTab /> : <HistoryTab />}
      </main>
    </>
  );
}
