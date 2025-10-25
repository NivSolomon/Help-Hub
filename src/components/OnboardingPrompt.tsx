import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { saveOnboardingProfile } from "../lib/users";

type Props = {
  uid: string;
  onSaved: () => void;
  onClose?: () => void; // mostly for dev/debug; in prod we probably force completion
};

// utility: today minus N years
function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

export default function OnboardingPrompt({ uid, onSaved, onClose }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ------------------
  // validation helpers
  // ------------------

  function validateBirthdate(d: Date | null): string | null {
    if (!d) return "Birth date is required";
    const now = new Date();
    if (d > now) return "Birth date cannot be in the future";

    // must be >= 13 years old
    const minAllowed = yearsAgo(13);
    if (d > minAllowed) return "You must be at least 13";

    // block totally unrealistic ages >120
    const maxAllowed = yearsAgo(120);
    if (d < maxAllowed) return "Please enter a valid birth year";

    return null;
  }

  function validate(): string | null {
    if (!firstName.trim()) return "First name is required";
    if (!lastName.trim()) return "Last name is required";

    const bErr = validateBirthdate(birthdate);
    if (bErr) return bErr;

    if (!phone.trim()) return "Phone number is required";
    // lightweight phone sanity check
    if (phone.replace(/\D/g, "").length < 7)
      return "Phone number looks too short";

    if (!address.trim()) return "Address is required";

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const vErr = validate();
    if (vErr) {
      setSaving(false);
      setError(vErr);
      return;
    }

    try {
      const birthIso = birthdate!.toISOString().slice(0, 10); // yyyy-mm-dd

      await saveOnboardingProfile(uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthdateISO: birthIso,
        phone: phone.trim(),
        address: address.trim(),
      });

      onSaved();
    } catch (err) {
      console.error("saveOnboardingProfile failed:", err);
      setError("Could not save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ------------------
  // modal layout
  // ------------------

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40"
      style={{ zIndex: 99999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {/* Title */}
        <h2
          id="onboarding-title"
          className="mb-1 flex items-center gap-2 text-xl font-semibold"
        >
          <span role="img" aria-hidden>
            👋
          </span>
          Finish setting up your account
        </h2>

        <p className="mb-4 text-sm text-gray-600">
          We only ask this once. People you help will see your first name and
          phone.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First / Last name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                First name
              </label>
              <input
                className="w-full rounded-lg border p-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Dana"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Last name
              </label>
              <input
                className="w-full rounded-lg border p-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Cohen"
              />
            </div>
          </div>

          {/* Birth date */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Birth date
            </label>
            <DatePicker
              selected={birthdate}
              onChange={(d) => setBirthdate(d)}
              maxDate={yearsAgo(13)} // can't pick younger than 13
              minDate={yearsAgo(120)}
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={120}
              placeholderText="Select your date of birth"
              className="w-full rounded-lg border p-2 text-sm"
              dateFormat="yyyy-MM-dd"
              isClearable={false}
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone number
            </label>
            <input
              className="w-full rounded-lg border p-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              inputMode="tel"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Shared only with people you’re matched with to help.
            </p>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Address
            </label>
            <input
              className="w-full rounded-lg border p-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="City, street, building"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Used to show nearby requests. Don’t include apartment # if you
              don’t want to.
            </p>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Buttons */}
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
