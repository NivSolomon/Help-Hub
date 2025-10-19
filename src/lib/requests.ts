// src/lib/requests.ts
import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
  type DocumentData, type QueryDocumentSnapshot
} from "firebase/firestore";
import { db } from "./firebase";
import type { HelpRequest } from "./types";

const col = collection(db, "requests");

export function listenOpenRequests(cb: (items: HelpRequest[]) => void) {
  const q = query(col, where("status", "==", "open"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => (
      { id: d.id, ...d.data() } as HelpRequest
    ));
    cb(items);
  });
}

/** NEW: open + my accepted (as requester OR helper). */
export function listenRelevantRequests(
  myUid: string | null,
  cb: (items: HelpRequest[]) => void
) {
  // 1) All OPEN (for everyone)
  const qOpen = query(col, where("status", "==", "open"));

  // 2) ACCEPTED where I’m the helper
  const qAcceptedHelper = myUid
    ? query(col, where("status", "==", "accepted"), where("helperId", "==", myUid))
    : null;

  // 3) ACCEPTED where I’m the requester
  const qAcceptedRequester = myUid
    ? query(col, where("status", "==", "accepted"), where("requesterId", "==", myUid))
    : null;

  // Keep a local map and emit a merged, de-duped list
  const buckets = {
    open: new Map<string, HelpRequest>(),
    helper: new Map<string, HelpRequest>(),
    requester: new Map<string, HelpRequest>(),
  };

  const emit = () => {
    const merged = new Map<string, HelpRequest>();
    for (const m of [buckets.open, buckets.helper, buckets.requester]) {
      m.forEach((v, k) => merged.set(k, v));
    }
    // sort newest first if createdAt exists
    const items = Array.from(merged.values()).sort((a, b) => {
      const ca = (a as any).createdAt?.seconds ?? 0;
      const cb_ = (b as any).createdAt?.seconds ?? 0;
      return cb_ - ca;
    });
    cb(items);
  };

  const unsubs: Array<() => void> = [];

  unsubs.push(onSnapshot(qOpen, (snap) => {
    buckets.open.clear();
    snap.forEach((d) => buckets.open.set(d.id, { id: d.id, ...(d.data() as any) }));
    emit();
  }));

  if (qAcceptedHelper) {
    unsubs.push(onSnapshot(qAcceptedHelper, (snap) => {
      buckets.helper.clear();
      snap.forEach((d) => buckets.helper.set(d.id, { id: d.id, ...(d.data() as any) }));
      emit();
    }));
  }

  if (qAcceptedRequester) {
    unsubs.push(onSnapshot(qAcceptedRequester, (snap) => {
      buckets.requester.clear();
      snap.forEach((d) => buckets.requester.set(d.id, { id: d.id, ...(d.data() as any) }));
      emit();
    }));
  }

  return () => unsubs.forEach((u) => u());
}

type NewReq = Omit<HelpRequest, "id" | "createdAt" | "status" | "helperId">;

export async function createRequest(data: NewReq) {
  await addDoc(col, {
    ...data,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

export async function acceptRequest(reqId: string, helperId: string) {
  await updateDoc(doc(db, "requests", reqId), {
    helperId,
    status: "accepted",
  });
}

export async function markDone(reqId: string) {
  await updateDoc(doc(db, "requests", reqId), { status: "done" });
}
