import { apiFetch } from "./api";
import { auth } from "./firebase";

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

export async function getOrCreateChat(
  requestId: string,
  a: string,
  b: string
): Promise<Chat> {
  const response = await apiFetch<Chat>("/chats", {
    method: "POST",
    body: JSON.stringify({ requestId, participantId: b }),
  });
  return response;
}

export function listenMessages(chatId: string, cb: (msgs: ChatMessage[]) => void) {
  let stop = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const poll = async () => {
    if (stop) return;
    try {
      const data = await apiFetch<{ items: ChatMessage[] }>(`/chats/${chatId}/messages`);
      if (!stop) {
        cb(
          data.items.map((item) => ({
            ...item,
            createdAt:
              typeof item.createdAt === "number" ? item.createdAt : Date.now(),
          }))
        );
      }
    } catch (error) {
      console.error("[chat] listenMessages failed", error);
    } finally {
      if (!stop) {
        timer = setTimeout(poll, 3000);
      }
    }
  };

  void poll();

  return () => {
    stop = true;
    if (timer) clearTimeout(timer);
  };
}

export async function sendMessage(chatId: string, senderId: string, text: string) {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== senderId) {
    throw new Error("Sender mismatch");
  }

  await apiFetch(`/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
