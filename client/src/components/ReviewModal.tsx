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
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

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

  const ratingLabel = useMemo(() => {
    if (!rating) return "Tap a star to rate your experience";
    const labels = [
      "Needs a lot of improvement",
      "Could be better",
      "It was okay overall",
      "Really good experience",
      "Outstanding – would recommend!",
    ];
    return labels[rating - 1];
  }, [rating]);

  async function handleSubmit() {
    if (rating === 0 || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onSubmit(rating, comment.trim(), imageFile);
      onClose();
    } catch (error) {
      console.error("Submitting review failed", error);
    } finally {
      setIsSubmitting(false);
    }
  }

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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/45 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        <span className="pointer-events-none absolute -left-20 -top-24 hidden h-64 w-64 rounded-full bg-indigo-200/40 blur-3xl md:block" />
        <span className="pointer-events-none absolute -bottom-24 right-[-10%] hidden h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl md:block" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-[1] inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/80 text-gray-600 shadow-sm transition hover:scale-105 hover:text-gray-900"
          aria-label="Close review modal"
        >
          ×
        </button>

        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500 via-indigo-400/80 to-emerald-400 px-6 pb-6 pt-8 text-white sm:px-8">
          <div className="relative z-[1] flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              Community review
            </span>
            <h2 className="text-2xl font-semibold leading-snug sm:text-[26px]">
              {displayLine}
            </h2>
            {requestTitle && (
              <span className="inline-flex max-w-full items-center gap-2 self-start rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                <span aria-hidden>📦</span>
                <span className="max-w-[220px] truncate sm:max-w-[260px]">
                  {requestTitle}
                </span>
              </span>
            )}
          </div>
          <span className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-white/25 blur-2xl" />
          <span className="pointer-events-none absolute left-12 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-white/20 blur-2xl" />
        </div>

        <div className="space-y-6 px-6 pb-7 pt-6 sm:px-8">
          {/* Stars */}
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">
              How was it?
            </span>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => {
                const active = i <= rating;
                return (
                  <button
                    key={i}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${
                      active
                        ? "border-amber-300 bg-amber-100 text-amber-500 shadow-sm"
                        : "border-gray-200 bg-white text-gray-300 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-400"
                    }`}
                    onClick={() => setRating(i)}
                    aria-label={`${i} star${i > 1 ? "s" : ""}`}
                    aria-pressed={active}
                    type="button"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-7 w-7 transition-transform duration-150 ${active ? "scale-105 drop-shadow-sm" : ""}`}
                      fill={active ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={1.2}
                    >
                      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  </button>
                );
              })}
            </div>
            <p className="max-w-[320px] text-sm font-medium text-gray-700">
              {ratingLabel}
            </p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all duration-300 ease-out"
                style={{ width: `${(rating / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Comment + emoji row */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-800">
              Share a few highlights
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={500}
                className="w-full flex-1 rounded-2xl border border-gray-200 bg-white/70 p-3 text-sm text-gray-700 shadow-inner transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="What made this helpful? Mention any details others should know."
              />

            {/* Emoji toggle button */}
            <div className="relative">
              <button
                ref={emojiBtnRef}
                type="button"
                className="flex h-11 w-full items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 text-2xl leading-none text-gray-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-500 sm:h-full sm:w-12"
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
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>Be respectful. Your review is shared with the community.</span>
              <span>{comment.trim().length}/500</span>
            </div>
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-800">
              Add a photo (optional)
            </label>
            <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50/70">
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setImageFile(f);
                }}
              />
              <span className="text-2xl" aria-hidden>
                📷
              </span>
              <span>Drop a picture or tap to upload</span>
            </label>
            {imageFile && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700">
                  <span className="max-w-[220px] truncate font-medium">
                    {imageFile.name}
                  </span>
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 transition hover:bg-indigo-100"
                    onClick={() => setImageFile(null)}
                  >
                    Remove
                  </button>
                </div>
                {imagePreviewUrl && (
                  <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-inner">
                    <img
                      src={imagePreviewUrl}
                      alt="Selected review attachment preview"
                      className="max-h-48 w-full object-cover"
                    />
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              e.g. the final result or a happy moment to celebrate.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:bg-gray-100 sm:w-auto"
              type="button"
            >
              Maybe later
            </button>
            <button
              onClick={handleSubmit}
              className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={rating === 0 || isSubmitting}
              type="button"
            >
              {isSubmitting ? "Submitting…" : "Share review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
