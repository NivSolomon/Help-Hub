import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { auth } from "../lib/firebase";
import { listenMessages, sendMessage, type ChatMessage } from "../lib/chat";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

type ChatPanelProps = {
  chatId: string;
  onClose: () => void;
  // ✅ new, for clarity
  requestTitle?: string;
  otherUser?: { uid: string; name?: string | null; phone?: string | null };
};

export default function ChatPanel(props: ChatPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<ChatSurface {...props} />, document.body);
}

function ChatSurface({ chatId, onClose, requestTitle, otherUser }: ChatPanelProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) return;
    const unsub = listenMessages(chatId, setMsgs);
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!pickerOpen) return;
      const target = e.target as Node;
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  async function submit() {
    const me = auth.currentUser?.uid;
    const t = text.trim();
    if (!me || !t) return;
    await sendMessage(chatId, me, t);
    setText("");
    inputRef.current?.focus();
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  }

  const otherName = otherUser?.name ?? "Unknown user";
  const phone = otherUser?.phone ?? undefined;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[1000] bg-black/30" onClick={onClose} aria-hidden="true" />

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
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{otherName}</div>
              <div className="truncate text-xs text-gray-500">
                {requestTitle ? <>Request: {requestTitle}</> : null}
                {phone ? <>{requestTitle ? " • " : ""}Phone: {phone}</> : null}
              </div>
            </div>
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
            {/* Optional intro chip */}
            <div className="mb-3 text-center text-[11px] text-gray-500">
              You’re chatting with <span className="font-medium text-gray-700">{otherName}</span>
              {phone ? <> — reach them at <span className="font-medium">{phone}</span></> : null}
            </div>

            {msgs.map((m) => {
              const mine = m.senderId === auth.currentUser?.uid;
              return (
                <div key={m.id} className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
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
          <div className="relative border-t p-3">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Insert emoji"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-gray-50"
                onClick={() => setPickerOpen((v) => !v)}
              >
                😊
              </button>

              <input
                ref={inputRef}
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

            {pickerOpen && (
              <div
                ref={pickerRef}
                className="
                  absolute bottom-[3.25rem] left-3 z-[1002]
                  w-[350px] rounded-xl border bg-white shadow-2xl
                "
              >
                <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading emojis…</div>}>
                  <EmojiPicker
                    onEmojiClick={(e: any) => insertEmoji(e.emoji)}
                    lazyLoadEmojis
                    searchDisabled={false}
                    suggestedEmojisMode="recent"
                    previewConfig={{ showPreview: false }}
                    height={360}
                    width="100%"
                    skinTonesDisabled={false}
                    autoFocusSearch={false}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
