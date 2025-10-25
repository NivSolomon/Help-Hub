// src/lib/reviews.ts

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

/* -----------------------------------------------------------------------------
   Types
----------------------------------------------------------------------------- */

export type ReviewPrompt = {
  userId: string;       // who should fill the review now (the one seeing the modal)
  requestId: string;    // which request this review is about
  requestTitle?: string; // human-readable title of the request for context
  revieweeId: string;   // who they are reviewing
  createdAt?: any;
  consumed?: boolean;   // once true, we won't nag again
};

export type Review = {
  requestId: string;
  requestTitle?: string | null;

  reviewerId: string;   // the person who wrote the review
  revieweeId: string;   // the person receiving the review

  rating: number;       // 1..5
  comment?: string;
  imageUrl?: string | null; // optional proof photo

  createdAt?: any;      // serverTimestamp
};

/* -----------------------------------------------------------------------------
   createReviewPromptsForBoth
   - Called once when a request is marked done.
   - We now also store requestTitle in each prompt so UI can show context.
----------------------------------------------------------------------------- */

export async function createReviewPromptsForBoth(
  requestId: string,
  requesterId: string,
  helperId: string,
  requestTitle: string
) {
  const colRef = collection(db, "review_prompts");

  // requester -> review helper
  // helper   -> review requester
  await Promise.all([
    addDoc(colRef, {
      userId: requesterId,
      requestId,
      requestTitle,
      revieweeId: helperId,
      createdAt: serverTimestamp(),
      consumed: false,
    }),
    addDoc(colRef, {
      userId: helperId,
      requestId,
      requestTitle,
      revieweeId: requesterId,
      createdAt: serverTimestamp(),
      consumed: false,
    }),
  ]);
}

/* -----------------------------------------------------------------------------
   submitReview
   - Called when user submits the modal.
   - We include requestTitle & imageUrl for profile display.
----------------------------------------------------------------------------- */

export async function submitReview(
  requestId: string,
  reviewerId: string,
  revieweeId: string,
  rating: number,
  comment: string,
  imageUrl?: string | null,
  requestTitle?: string | null
) {
  const colRef = collection(db, "reviews");
  await addDoc(colRef, {
    requestId,
    requestTitle: requestTitle ?? null,

    reviewerId,
    revieweeId,

    rating,
    comment,
    imageUrl: imageUrl ?? null,

    createdAt: serverTimestamp(),
  });
}

/* -----------------------------------------------------------------------------
   listenMyReviewPrompts
   - Real-time listener for "please leave a review" prompts.
   - Returns unconsumed prompts for a given user.
   - We now expect requestTitle in the data (for UI context).
----------------------------------------------------------------------------- */

export function listenMyReviewPrompts(
  myId: string,
  cb: (prompts: Array<{ id: string } & ReviewPrompt>) => void
) {
  const qy = query(
    collection(db, "review_prompts"),
    where("userId", "==", myId),
    where("consumed", "==", false)
    // we don't strictly need orderBy here,
    // but you could .orderBy("createdAt","desc") if you want newest first.
  );

  return onSnapshot(qy, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          userId: data.userId,
          requestId: data.requestId,
          requestTitle: data.requestTitle,
          revieweeId: data.revieweeId,
          createdAt: data.createdAt,
          consumed: data.consumed,
        };
      })
    );
  });
}

/* -----------------------------------------------------------------------------
   consumePrompt
   - Mark that we've already asked the user to review,
     so we don't spam them with the same modal again.
----------------------------------------------------------------------------- */

export async function consumePrompt(docId: string) {
  const ref = doc(db, "review_prompts", docId);
  await updateDoc(ref, { consumed: true });
}

/* -----------------------------------------------------------------------------
   fetchUserReviews
   - For profile page: show all reviews about <userId> (this user is revieweeId).
   - Returns newest first.
   - We also normalize createdAt to a number (ms since epoch) for easy rendering.
----------------------------------------------------------------------------- */

export async function fetchUserReviews(userId: string): Promise<
  Array<{
    id: string;
    rating: number;
    comment: string;
    requestTitle?: string | null;
    imageUrl?: string | null;
    createdAt?: number | null;
  }>
> {
  const qy = query(
    collection(db, "reviews"),
    where("revieweeId", "==", userId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(qy);

  const out: Array<{
    id: string;
    rating: number;
    comment: string;
    requestTitle?: string | null;
    imageUrl?: string | null;
    createdAt?: number | null;
  }> = [];

  snap.forEach((docSnap) => {
    const d = docSnap.data() as any;

    // createdAt can be a Firestore Timestamp OR missing.
    let createdAtMs: number | null = null;
    if (d.createdAt?.toMillis) {
      createdAtMs = d.createdAt.toMillis();
    } else if (typeof d.createdAt === "number") {
      // if you ever stored raw millis directly for some reason
      createdAtMs = d.createdAt;
    }

    out.push({
      id: docSnap.id,
      rating: d.rating ?? 0,
      comment: d.comment ?? "",
      requestTitle: d.requestTitle ?? null,
      imageUrl: d.imageUrl ?? null,
      createdAt: createdAtMs,
    });
  });

  return out;
}

/* -----------------------------------------------------------------------------
   getUserAverageRating
   - Convenience helper for profile header / badges etc.
   - You can call this in the profile page if you want a one-shot average.
   - If you're already calling fetchUserReviews(...) you can compute avg there,
     but having a helper is nice if you need it somewhere else.
----------------------------------------------------------------------------- */

export async function getUserAverageRating(
  userId: string
): Promise<{ avg: number | null; count: number }> {
  const reviews = await fetchUserReviews(userId);
  if (!reviews.length) return { avg: null, count: 0 };

  const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  const avg = sum / reviews.length;
  return { avg, count: reviews.length };
}

/* -----------------------------------------------------------------------------
   getSingleReview (optional utility)
   - If you ever want to read a specific review doc by id.
   - Not used yet, but helpful for debugging.
----------------------------------------------------------------------------- */

export async function getSingleReview(reviewId: string): Promise<Review | null> {
  const ref = doc(db, "reviews", reviewId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return {
    requestId: d.requestId,
    requestTitle: d.requestTitle ?? null,
    reviewerId: d.reviewerId,
    revieweeId: d.revieweeId,
    rating: d.rating,
    comment: d.comment ?? "",
    imageUrl: d.imageUrl ?? null,
    createdAt: d.createdAt ?? null,
  };
}
