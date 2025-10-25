import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { saveBirthdate } from "../lib/users";

type Props = {
  uid: string;
  onSaved: () => void;
  onClose?: () => void;
};

function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

export default function BirthdatePrompt({ uid, onSaved, onClose }: Props) {
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // lock scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function validateDate(d: Date | null): string | null {
    if (!d) return "Birth date is required";
    const now = new Date();
    if (d > now) return "Birth date cannot be in the future";

    // Age limit: must be >= 13
    const minAllowed = yearsAgo(13); // youngest allowed
    if (d > minAllowed) return "You must be at least 13";

    // Also block impossible ages (>120y)
    const maxAllowed = yearsAgo(120);
    if (d < maxAllowed) return "Please enter a valid birth year";

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const err = validateDate(birthdate);
    if (err) {
      setSaving(false);
      setError(err);
      return;
    }

    try {
      // store as ISO yyyy-mm-dd in Firestore like before:
      const iso = birthdate!.toISOString().slice(0, 10);
      await saveBirthdate(uid, iso);
      onSaved();
    } catch (err) {
      console.error("saveBirthdate failed:", err);
      setError("Could not save birth date. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40"
      style={{ zIndex: 99999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="birthdate-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="birthdate-title" className="mb-1 text-xl font-semibold flex items-center gap-2">
          <span role="img" aria-hidden>🎂</span>
          Add your birth date
        </h2>

        <p className="mb-4 text-sm text-gray-600">
          We ask once to finish setting up your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Birth date</label>
            <DatePicker
              selected={birthdate}
              onChange={(d) => setBirthdate(d)}
              maxDate={yearsAgo(13)}         // can't pick younger than 13
              minDate={yearsAgo(120)}        // block 1800-year memes
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={120}
              placeholderText="Select your date of birth"
              className="w-full rounded-lg border p-2"
              dateFormat="yyyy-MM-dd"
              isClearable={false}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
