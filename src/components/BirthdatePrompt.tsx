// src/components/BirthdatePrompt.tsx
import React, { useState } from "react";
import { saveBirthdate } from "../lib/users";

type Props = {
  uid: string;
  onSaved: () => void; // required callback to close the modal
};

export default function BirthdatePrompt({ uid, onSaved }: Props) {
  const [birthdate, setBirthdate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveBirthdate(uid, birthdate);
      onSaved(); // ✅ close the modal properly
    } catch (err) {
      console.error("saveBirthdate failed:", err);
      setError("Could not save birth date. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-1">Add your birth date</h2>
        <p className="text-sm text-gray-600 mb-4">
          We require your birth date once to complete your account setup.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Birth date</label>
            <input
              type="date"
              required
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black text-white px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
