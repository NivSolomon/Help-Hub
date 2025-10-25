// src/components/ReviewModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Name of the other participant (helper if I'm requester, requester if I'm helper) */
  otherName?: string | null;
  /** Optional hint so we can show a good fallback title if name isn't available */
  roleHint?: "helper" | "requester";
  requestTitle?: string | null;
  onSubmit: (
    rating: number,
    comment: string,
    imageFile: File | null
  ) => Promise<void> | void;
};

export default function ReviewModal({
  open,
  onClose,
  otherName,
  roleHint,
  requestTitle,
  onSubmit,
}: Props) {
  // ----------------------
  // state / refs / hooks
  // ----------------------
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  // emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);

  // when modal opens, reset fields
  useEffect(() => {
    if (open) {
      setRating(0);
      setComment("");
      setImageFile(null);
      setShowEmojiPicker(false);
    }
  }, [open]);

  // close emoji picker on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowEmojiPicker(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // build the header line ("Rate your experience with Alice")
  const displayLine = useMemo(() => {
    if (otherName && otherName.trim() !== "") {
      return `Rate your experience with ${otherName}`;
    }
    if (roleHint === "helper") return "Rate your helper";
    if (roleHint === "requester") return "Rate the requester";
    return "Rate your experience";
  }, [otherName, roleHint]);

  // handler for emoji picker
  function handleEmojiClick(emojiData: EmojiClickData) {
    setComment((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  }

  // ----------------------
  // EARLY RETURN (after hooks)
  // ----------------------
  if (!open) return null;

  // ----------------------
  // RENDER
  // ----------------------
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40">
      <div className="relative w-[92%] max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-3 text-lg font-semibold leading-snug">
          <div className="flex flex-col">
            <span>{displayLine}</span>
            <span className="mt-1 flex items-center gap-1 text-sm font-normal text-gray-500">
              <span role="img" aria-hidden>
                📦
              </span>
              <span className="max-w-full truncate">
                {requestTitle ?? ""}
              </span>
            </span>
          </div>
        </div>

        {/* Stars */}
        <div className="mb-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              className="text-2xl"
              onClick={() => setRating(i)}
              aria-label={`${i} stars`}
              title={`${i} stars`}
              type="button"
            >
              <span
                style={{
                  color: i <= rating ? "#f59e0b" : "#d1d5db",
                }}
              >
                ★
              </span>
            </button>
          ))}
        </div>

        {/* Comment + emoji row */}
        <div className="mb-3">
          <div className="flex items-start gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full flex-1 rounded-lg border p-2 text-sm"
              placeholder="Share a few words about your experience…"
            />

            {/* Emoji toggle button */}
            <div className="relative">
              <button
                ref={emojiBtnRef}
                type="button"
                className="rounded-lg border bg-white px-2 py-2 text-xl leading-none text-gray-700 hover:bg-gray-50"
                onClick={() => setShowEmojiPicker((v) => !v)}
                aria-label="Add emoji"
                title="Add emoji"
              >
                😊
              </button>

              {/* Emoji Picker Popover */}
              {showEmojiPicker && (
                <div
                  className="absolute right-0 z-[2100] mt-2 rounded-xl border bg-white shadow-xl"
                  style={{
                    width: "280px",
                    maxHeight: "320px",
                    overflow: "hidden",
                  }}
                >
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    autoFocusSearch={false}
                    skinTonesDisabled={false}
                    searchDisabled={false}
                    previewConfig={{ showPreview: false }}
                    width="280px"
                    height="320px"
                  />
                </div>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Be respectful. Your review will be visible to the community.
          </p>
        </div>

        {/* Image upload */}
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium">
            Add a photo (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-50"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setImageFile(f);
            }}
          />
          <p className="mt-1 text-[11px] text-gray-500">
            e.g. final result / proof of delivery
          </p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              await onSubmit(rating, comment.trim(), imageFile);
              onClose();
            }}
            className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={rating === 0}
            type="button"
          >
            Submit review
          </button>
        </div>
      </div>
    </div>
  );
}
