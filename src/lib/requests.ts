import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  limit,
  runTransaction,
  updateDoc,
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import type { HelpRequest } from "./types";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";

const db = getFirestore();
const col = collection(db, "requests");

export type CreateRequestInput = {
  title: string;
  description: string;
  category: "errand" | "carry" | "fix" | "other";
  reward?: number | null;
  address?: string | null;
  location: { lat: number; lng: number };
  geohash?: string;
  requesterId: string;
};

export type MapBounds = { west: number; south: number; east: number; north: number };

export async function createRequest(input: CreateRequestInput) {
  if (!input?.requesterId) throw new Error("requesterId is required");
  if (!input?.location) throw new Error("location is required");
  if (typeof input.location.lat !== "number" || typeof input.location.lng !== "number") {
    throw new Error("location must have numeric lat/lng");
  }

  const geohash =
    input.geohash ?? geohashForLocation([input.location.lat, input.location.lng]);

  const docBody = {
    title: input.title?.trim() ?? "",
    description: input.description?.trim() ?? "",
    category: input.category ?? "other",
    reward: input.reward ?? null,
    address: input.address ?? null,

    requesterId: input.requesterId,
    status: "open" as const,

    location: { lat: input.location.lat, lng: input.location.lng },
    geohash,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(col, docBody);
  return { id: ref.id, ...docBody };
}

/** ---------- OPEN-ONLY FEEDS ---------- */
export function listenOpenRequests(cb: (items: HelpRequest[]) => void): Unsubscribe {
  const q = query(col, where("status", "==", "open"), limit(500));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(
        (d: QueryDocumentSnapshot<DocumentData>) =>
          ({ id: d.id, ...(d.data() as any) } as HelpRequest)
      );
      cb(items);
    },
    (err) => {
      console.error("[listenOpenRequests] error:", err);
      cb([]);
    }
  );
}

export function listenOpenRequestsNearby(
  bounds: MapBounds | null,
  geohashRange: { start: string; end: string } | null,
  cb: (items: HelpRequest[]) => void
): Unsubscribe {
  if (!bounds || !geohashRange) {
    const unsub = listenOpenRequests((rows) =>
      cb(bounds ? filterByBounds(rows, bounds) : rows)
    );
    return unsub;
  }

  try {
    const qOpen = query(
      col,
      where("status", "==", "open"),
      where("geohash", ">=", geohashRange.start),
      where("geohash", "<=", geohashRange.end),
      limit(500)
    );
    const unsub = onSnapshot(
      qOpen,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as HelpRequest));
        cb(items);
      },
      (err) => {
        console.warn("[nearby] index error -> fallback to openOnly:", err);
        const fUnsub = listenOpenRequests((rows) => cb(filterByBounds(rows, bounds)));
        const chained: Unsubscribe = () => {
          try { unsub(); } catch {}
          try { fUnsub(); } catch {}
        };
        (chained as any).__chained = true;
        return chained;
      }
    );
    return unsub;
  } catch (e) {
    console.error("[nearby] build query failed:", e);
    return listenOpenRequests((rows) => cb(filterByBounds(rows, bounds)));
  }
}

function filterByBounds(rows: HelpRequest[], b: MapBounds) {
  return rows.filter((r) => {
    const loc = r.location;
    if (!loc) return false;
    return loc.lng >= b.west && loc.lng <= b.east && loc.lat >= b.south && loc.lat <= b.north;
  });
}

/** ---------- PARTICIPATING FEED (requester or helper) ---------- */
/** Keep requests visible for both users after acceptance. */
export function listenParticipatingRequests(
  myId: string,
  cb: (items: HelpRequest[]) => void
): Unsubscribe {
  // requester side (accepted or in_progress)
  const qReqAccepted = query(col, where("requesterId", "==", myId), where("status", "==", "accepted"));
  const qReqInProg  = query(col, where("requesterId", "==", myId), where("status", "==", "in_progress"));

  // helper side (accepted or in_progress)
  const qHelpAccepted = query(col, where("helperId", "==", myId), where("status", "==", "accepted"));
  const qHelpInProg   = query(col, where("helperId", "==", myId), where("status", "==", "in_progress"));

  const unsubs: Unsubscribe[] = [];
  const bag = new Map<string, HelpRequest>();

  function emit() {
    cb(Array.from(bag.values()));
  }
function upsertFromSnapshot(snap: any) {
  snap.docChanges().forEach((change: any) => {
    const d = change.doc;
    if (change.type === "removed" || d.data().status === "done") {
      bag.delete(d.id);
    } else {
      bag.set(d.id, { id: d.id, ...(d.data() as any) } as HelpRequest);
    }
  });
  cb(Array.from(bag.values()));
}

  function removeMissing(snap: any) {
    const ids = new Set(snap.docs.map((d: any) => d.id));
    for (const id of bag.keys()) {
      // prune only those owned by this query scope? Fine to keep; other queries keep them.
      if (!ids.has(id)) continue;
    }
    emit();
  }

  unsubs.push(
    onSnapshot(qReqAccepted, (s) => upsertFromSnapshot(s)),
    onSnapshot(qReqInProg,  (s) => upsertFromSnapshot(s)),
    onSnapshot(qHelpAccepted, (s) => upsertFromSnapshot(s)),
    onSnapshot(qHelpInProg,   (s) => upsertFromSnapshot(s)),
  );

  return () => unsubs.forEach((u) => { try { u(); } catch {} });
}

/** ---------- STATE CHANGES ---------- */

/** Race-safe accept; default status becomes 'in_progress' so UI turns orange and chat is enabled. */
export async function acceptRequestAtomic(
  reqId: string,
  helperId: string,
  nextStatus: "accepted" | "in_progress" = "accepted"
) {
  const ref = doc(db, "requests", reqId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found");
    const r = snap.data() as any;
    if (r.status !== "open" || r.helperId) throw new Error("Already accepted");
    tx.update(ref, { helperId, status: nextStatus });
  });
}

export async function markDone(reqId: string) {
  await updateDoc(doc(db, "requests", reqId), { status: "done" });
}

// --- User history (requester OR helper, any status) ---
export function listenUserHistory(
  myId: string,
  cb: (items: HelpRequest[]) => void
): Unsubscribe {
  const qReq = query(col, where("requesterId", "==", myId), limit(500));
  const qHelp = query(col, where("helperId", "==", myId), limit(500));

  const bag = new Map<string, HelpRequest>();
  const unsubs: Unsubscribe[] = [];

  function applySnap(snap: any) {
    snap.docChanges().forEach((c: any) => {
      const d = c.doc;
      if (c.type === "removed") {
        bag.delete(d.id);
      } else {
        bag.set(d.id, { id: d.id, ...(d.data() as any) } as HelpRequest);
      }
    });
    // Sort newest first (createdAt may be null briefly)
    const rows = Array.from(bag.values()).sort((a, b) => {
      const ta = (a as any).createdAt?.toMillis?.() ?? 0;
      const tb = (b as any).createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    cb(rows);
  }

  unsubs.push(onSnapshot(qReq, applySnap));
  unsubs.push(onSnapshot(qHelp, applySnap));

  return () => unsubs.forEach((u) => { try { u(); } catch {} });
}
