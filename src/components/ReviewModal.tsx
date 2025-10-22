import React, { useState, useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  otherName?: string | null;
  onSubmit: (rating: number, comment: string) => Promise<void> | void;
};

export default function ReviewModal({ open, onClose, otherName, onSubmit }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");

  // ✅ Reset form when modal opens
  useEffect(() => {
    if (open) {
      setRating(0);
      setComment("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40">
      <div className="w-[92%] max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 text-lg font-semibold">
          Rate your experience {otherName ? `with ${otherName}` : ""}
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
            >
              <span style={{ color: i <= rating ? "#f59e0b" : "#d1d5db" }}>★</span>
            </button>
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={5}
          className="w-full rounded-lg border p-2 text-sm"
          placeholder="Share a few words about your experience…"
        />

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              await onSubmit(rating, comment.trim());
              onClose();
            }}
            className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={rating === 0}
          >
            Submit review
          </button>
        </div>
      </div>
    </div>
  );
}
