import { useEffect, useRef, useState, lazy, Suspense, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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

function ChatSurface({
  chatId,
  onClose,
  requestTitle,
  otherUser,
}: ChatPanelProps) {
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
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
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

  const otherName =
    otherUser?.name && otherUser.name.trim() !== ""
      ? otherUser.name
      : otherUser?.uid
      ? `User ${otherUser.uid.slice(0, 6)}`
      : "Community member";
  const phone = otherUser?.phone ?? undefined;
  const currentUid = auth.currentUser?.uid ?? null;

  function toDate(value: any): Date {
    if (typeof value === "number") return new Date(value);
    if (value && typeof value.toDate === "function") return value.toDate();
    return new Date(value ?? Date.now());
  }

  function formatDay(date: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diff = (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return target.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: today.getFullYear() === target.getFullYear() ? undefined : "numeric",
    });
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const initials = otherName.trim().slice(0, 1).toUpperCase();

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      items: Array<{ message: ChatMessage; date: Date }>;
    }> = [];
    const map = new Map<string, (typeof groups)[number]>();

    msgs.forEach((message) => {
      const date = toDate(message.createdAt);
      const key = date.toISOString().slice(0, 10);
      let group = map.get(key);
      if (!group) {
        group = { key, label: formatDay(date), items: [] };
        map.set(key, group);
        groups.push(group);
      }
      group.items.push({ message, date });
    });

    groups.forEach((group) =>
      group.items.sort((a, b) => a.date.getTime() - b.date.getTime())
    );

    return groups;
  }, [msgs]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="chat-overlay"
        className="fixed inset-0 z-[1000] bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        key="chat-panel"
        className="fixed bottom-0 left-0 right-0 z-[1001] mx-auto w-full sm:left-auto sm:right-6 sm:bottom-6 sm:w-[420px]"
        role="dialog"
        aria-modal="true"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 25 }}
      >
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-500 px-5 py-4 text-white">
            <div className="min-w-0 space-y-1">
              <div className="truncate text-sm font-semibold tracking-wide">
                {otherName}
              </div>
              <div className="truncate text-[11px] text-white/80">
                {requestTitle ? `Request: ${requestTitle}` : ""}
                {requestTitle && phone ? " • " : ""}
                {phone ? `Phone: ${phone}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold uppercase sm:flex">
                {initials}
              </div>
              <button
                onClick={onClose}
                aria-label="Close chat"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/20 text-lg font-semibold text-white transition hover:bg-white/30"
              >
                ×
              </button>
            </div>
          </div>

          <div
            ref={listRef}
            className="max-h-[55vh] space-y-4 overflow-y-auto bg-gradient-to-br from-indigo-50/60 via-white to-emerald-50/40 px-5 py-4 sm:max-h-[50vh]"
          >
            {groupedMessages.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-500">
                No messages yet. Say hi and kick things off!
              </div>
            )}

            {groupedMessages.map((group) => (
              <div key={group.key} className="space-y-3">
                <div className="text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                  {group.label}
                </div>
                {group.items.map((item, index) => {
                  const message = item.message;
                  const mine = message.senderId === currentUid;
                  const previous = group.items[index - 1];
                  const sameSender = previous?.message.senderId === message.senderId;
                  const time = formatTime(item.date);

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className={`flex items-end gap-2 ${
                        mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!mine && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                          {!sameSender ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-200 text-[11px] font-semibold text-indigo-700">
                              {initials}
                            </div>
                          ) : (
                            <div className="h-8 w-8" />
                          )}
                        </div>
                      )}

                      <div className="max-w-[75%] space-y-1">
                        <div
                          className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm ${
                            mine
                              ? "bg-gradient-to-br from-indigo-600 via-indigo-600 to-indigo-500 text-white"
                              : "bg-white text-gray-800"
                          }`}
                        >
                          {message.text}
                        </div>
                        <div
                          className={`text-[11px] ${
                            mine ? "text-indigo-300" : "text-gray-400"
                          }`}
                        >
                          {time}
                        </div>
                      </div>

                      {mine && <div className="h-8 w-8 shrink-0" />}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="relative border-t border-gray-100 bg-white/95 p-4">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Insert emoji"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
                onClick={() => setPickerOpen((v) => !v)}
              >
                😊
              </button>

              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Type a message…"
              />

              <button
                onClick={submit}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                disabled={!text.trim()}
              >
                Send
              </button>
            </div>

            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  ref={pickerRef}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-[3.5rem] left-3 z-[1002] w-[340px] rounded-2xl border border-gray-200 bg-white shadow-2xl"
                >
                  <Suspense
                    fallback={
                      <div className="p-4 text-sm text-gray-500">Loading emojis…</div>
                    }
                  >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
