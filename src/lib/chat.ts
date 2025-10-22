// src/lib/chat.ts
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  addDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export type Chat = {
  id: string;
  requestId: string;
  participants: string[];
  createdAt?: any; // Firestore TS
};

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt?: any;
};

const chatsCol = collection(db, "chats");

/**
 * Deterministic chat id = requestId (one chat per request).
 * We DO NOT pre-query. We just set the doc (create if missing, merge if exists).
 * This avoids rule failures on reading non-existing docs.
 */
export async function getOrCreateChat(
  requestId: string,
  a: string,
  b: string
): Promise<Chat> {
  const chatRef = doc(chatsCol, requestId);

  // Try to create/merge without a prior read
  await setDoc(
    chatRef,
    {
      requestId,
      participants: [a, b],
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Fetch once to return the full object (works now because user is participant)
  const snap = await getDoc(chatRef);
  if (!snap.exists()) {
    // Should not happen, but guard anyway
    return { id: chatRef.id, requestId, participants: [a, b] };
  }
  return { id: snap.id, ...(snap.data() as DocumentData) } as Chat;
}

export function listenMessages(chatId: string, cb: (msgs: ChatMessage[]) => void) {
  const col = collection(db, "chats", chatId, "messages");
  // NOTE: add secondary orderBy on __name__ (doc id) for stability
  const q = query(col, orderBy("createdAt", "asc"), orderBy("__name__", "asc"));
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
      return { id: d.id, ...(d.data() as DocumentData) } as ChatMessage;
    });
    cb(msgs);
  });
}

export async function sendMessage(chatId: string, senderId: string, text: string) {
  const col = collection(db, "chats", chatId, "messages");
  await addDoc(col, {
    senderId,
    text,
    createdAt: serverTimestamp(),
  });
}
