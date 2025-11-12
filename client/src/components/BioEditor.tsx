import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import { updateUserProfile } from "../lib/users";
import type { UserProfile } from "../lib/users";

type Props = {
  initialProfile?: UserProfile | null;
};

function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

export default function BioEditor({ initialProfile }: Props) {
  const [phone, setPhone] = React.useState(initialProfile?.phone ?? "");
  const [address, setAddress] = React.useState(initialProfile?.address ?? "");
  const [bio, setBio] = React.useState(initialProfile?.bio ?? "");
  const [birthdate, setBirthdate] = React.useState<Date | null>(() => {
    if (!initialProfile?.birthdateISO) return null;
    const parsed = new Date(initialProfile.birthdateISO);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPhone(initialProfile?.phone ?? "");
    setAddress(initialProfile?.address ?? "");
    setBio(initialProfile?.bio ?? "");

    if (initialProfile?.birthdateISO) {
      const parsed = new Date(initialProfile.birthdateISO);
      setBirthdate(Number.isNaN(parsed.getTime()) ? null : parsed);
    } else {
      setBirthdate(null);
    }
  }, [initialProfile]);

  function validateBirthdate(date: Date | null): string | null {
    if (!date) return "Birth date is required.";
    const now = new Date();
    if (date > now) return "Birth date cannot be in the future.";

    const minAllowed = yearsAgo(13);
    if (date > minAllowed) return "You must be at least 13.";

    const maxAllowed = yearsAgo(120);
    if (date < maxAllowed) return "Please enter a valid birth year.";

    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("Phone number is required.");
      setSaving(false);
      return;
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError("Address is required.");
      setSaving(false);
      return;
    }

    const birthdateError = validateBirthdate(birthdate);
    if (birthdateError) {
      setError(birthdateError);
      setSaving(false);
      return;
    }

    const trimmedBio = bio.trim();
    if (trimmedBio.length > 280) {
      setError("Bio must be 280 characters or fewer.");
      setSaving(false);
      return;
    }

    try {
      await updateUserProfile({
        phone: trimmedPhone,
        address: trimmedAddress,
        bio: trimmedBio.length ? trimmedBio : null,
        birthdateISO: birthdate
          ? birthdate.toISOString().slice(0, 10)
          : null,
      });
      setSuccess("Profile updated.");
    } catch (err) {
      console.error("update profile failed:", err);
      setError("Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Phone</label>
        <input
          className="w-full rounded-lg border p-2 text-sm"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          inputMode="tel"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Address</label>
        <input
          className="w-full rounded-lg border p-2 text-sm"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="City, street, building"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Birth date</label>
        <DatePicker
          selected={birthdate}
          onChange={(d) => setBirthdate(d)}
          maxDate={yearsAgo(13)}
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

      <div>
        <label className="mb-1 block text-sm font-medium">Bio</label>
        <textarea
          className="w-full rounded-lg border p-2 text-sm"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Share a bit about how you help others."
          maxLength={280}
          rows={4}
        />
        <p className="mt-1 text-[11px] text-gray-500">
          {bio.length}/280 characters.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

