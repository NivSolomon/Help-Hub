// src/lib/reviews.ts
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy, // (optional if you need)
  query,
  where, // ✅ add this
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type ReviewPrompt = {
  userId: string; // who should fill the review now
  requestId: string;
  revieweeId: string; // who they are reviewing
  createdAt?: any;
  consumed?: boolean; // set true once we've shown the modal (optional)
};

export type Review = {
  requestId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number; // 1..5
  comment?: string;
  createdAt?: any;
};

// Create two prompts (one for each participant).
export async function createReviewPromptsForBoth(
  requestId: string,
  requesterId: string,
  helperId: string
) {
  const col = collection(db, "review_prompts");
  await Promise.all([
    addDoc(col, {
      userId: requesterId,
      requestId,
      revieweeId: helperId,
      createdAt: serverTimestamp(),
      consumed: false,
    }),
    addDoc(col, {
      userId: helperId,
      requestId,
      revieweeId: requesterId,
      createdAt: serverTimestamp(),
      consumed: false,
    }),
  ]);
}

// Save a review
export async function submitReview(
  requestId: string,
  reviewerId: string,
  revieweeId: string,
  rating: number,
  comment: string
) {
  const col = collection(db, "reviews");
  await addDoc(col, {
    requestId,
    reviewerId,
    revieweeId,
    rating,
    comment,
    createdAt: serverTimestamp(),
  });
}

// Listen for review prompts for a specific user
export function listenMyReviewPrompts(
  myId: string,
  cb: (prompts: Array<{ id: string } & ReviewPrompt>) => void
) {
  const qy = query(
    collection(db, "review_prompts"),
    where("userId", "==", myId),
    where("consumed", "==", false)
  );

  return onSnapshot(qy, (snap) => {
    cb(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<
        { id: string } & ReviewPrompt
      >
    );
  });
}

// Mark a prompt as consumed (after we show the modal)
export async function consumePrompt(docId: string) {
  const ref = doc(db, "review_prompts", docId);
  await updateDoc(ref, { consumed: true });
}
