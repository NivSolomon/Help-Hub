import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auth } from "../lib/firebase";
import { listenMessages, sendMessage, type ChatMessage } from "../lib/chat";

type Props = {
  chatId: string;
  onClose: () => void;
};

export default function ChatPanel({ chatId, onClose }: Props) {
  // Render nothing until we have a body (SSR safety)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(<ChatSurface chatId={chatId} onClose={onClose} />, document.body);
}

function ChatSurface({ chatId, onClose }: Props) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) return;
    const unsub = listenMessages(chatId, setMsgs);
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    // auto scroll to bottom on new messages
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  async function submit() {
    const me = auth.currentUser?.uid;
    const t = text.trim();
    if (!me || !t) return;
    await sendMessage(chatId, me, t);
    setText("");
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className="
          fixed z-[1001]
          bottom-0 left-0 right-0
          mx-auto w-full
          sm:right-6 sm:left-auto sm:bottom-6 sm:w-[420px]
        "
        role="dialog"
        aria-modal="true"
      >
        <div className="rounded-2xl border bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Chat</h3>
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:bg-gray-50"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} className="max-h-[55vh] overflow-y-auto px-4 py-3 sm:max-h-[50vh]">
            {msgs.map((m) => {
              const mine = m.senderId === auth.currentUser?.uid;
              return (
                <div key={m.id} className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-black text-white" : "bg-gray-100"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
            {msgs.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500">No messages yet.</div>
            )}
          </div>

          {/* Composer */}
          <div className="flex gap-2 border-t p-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Type a message…"
            />
            <button
              onClick={submit}
              className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={!text.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
