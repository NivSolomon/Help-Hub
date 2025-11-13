import { apiFetch } from "./api";
import { storage } from "./firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

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

function safeExtensionFromFilename(name: string | undefined): string {
  if (!name) return "jpg";
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === name.length - 1) return "jpg";
  const ext = name.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext) return "jpg";
  if (ext.length > 6) return ext.slice(0, 6);
  return ext;
}

export async function uploadReviewImage(
  file: File,
  opts: { requestId: string; reviewerId: string }
): Promise<string> {
  const { requestId, reviewerId } = opts;
  const ext = safeExtensionFromFilename(file.name);
  const key = `reviews/${requestId}/${reviewerId}-${Date.now()}.${ext}`;

  const metadata =
    file.type && file.type.trim() !== ""
      ? { contentType: file.type }
      : undefined;

  const storageRef = ref(storage, key);
  await uploadBytes(storageRef, file, metadata);
  return getDownloadURL(storageRef);
}

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
  await apiFetch("/reviews/prompts", {
    method: "POST",
    body: JSON.stringify({ requestId, requesterId, helperId, requestTitle }),
  });
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
  await apiFetch(`/reviews/${requestId}`, {
    method: "POST",
    body: JSON.stringify({
      requestId,
      revieweeId,
      rating,
      comment,
      imageUrl: imageUrl ?? null,
      requestTitle: requestTitle ?? null,
    }),
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
  let stop = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (stop) return;
    try {
      const data = await apiFetch<{ items: Array<{ id: string } & ReviewPrompt> }>(
        "/reviews/prompts"
      );
      cb(data.items);
    } catch (error) {
      console.error("[reviews] listen prompts failed", error);
    } finally {
      if (!stop) {
        timer = setTimeout(poll, 5000);
      }
    }
  }

  void poll();

  return () => {
    stop = true;
    if (timer) clearTimeout(timer);
  };
}

/* -----------------------------------------------------------------------------
   consumePrompt
   - Mark that we've already asked the user to review,
     so we don't spam them with the same modal again.
----------------------------------------------------------------------------- */

export async function consumePrompt(docId: string) {
  await apiFetch(`/reviews/prompts/${docId}/consume`, {
    method: "PATCH",
  });
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
  const data = await apiFetch<{
    items: Array<{
      id: string;
      rating: number;
      comment: string;
      requestTitle?: string | null;
      imageUrl?: string | null;
      createdAt?: number | null;
    }>;
  }>(`/reviews/user/${userId}`);

  return data.items;
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
  return apiFetch<{ avg: number | null; count: number }>(`/reviews/user/${userId}/average`);
}

/* Optional utility for extra review APIs can be added here */
