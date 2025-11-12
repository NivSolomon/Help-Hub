import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { saveOnboardingProfile } from "../lib/users";
import type { UserProfile } from "../lib/users";

type Props = {
  uid: string;
  onSaved: () => void;
  onClose?: () => void; // mostly for dev/debug; in prod we probably force completion
  initialProfile?: Partial<UserProfile> | null;
};

// utility: today minus N years
function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

export default function OnboardingPrompt({
  uid,
  onSaved,
  onClose,
  initialProfile,
}: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const prefilledRef = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<
        "firstName" | "lastName" | "birthdate" | "phone" | "address" | "bio",
        string
      >
    >
  >({});

  // lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (prefilledRef.current) return;
    if (!initialProfile) return;

    if (initialProfile.firstName) {
      setFirstName(initialProfile.firstName ?? "");
    }

    if (initialProfile.lastName) {
      setLastName(initialProfile.lastName ?? "");
    } else if (initialProfile.displayName) {
      const [first, ...rest] = initialProfile.displayName.split(" ").filter(Boolean);
      if (!initialProfile.firstName && first && !firstName) {
        setFirstName(first);
      }
      if (!initialProfile.lastName && rest.length && !lastName) {
        setLastName(rest.join(" "));
      }
    }

    if (initialProfile.phone) {
      setPhone(initialProfile.phone ?? "");
    }

    if (initialProfile.address) {
      setAddress(initialProfile.address ?? "");
    }

    if (initialProfile.bio) {
      setBio(initialProfile.bio ?? "");
    }

    if (initialProfile.birthdateISO) {
      const parsed = new Date(initialProfile.birthdateISO);
      if (!Number.isNaN(parsed.getTime())) {
        setBirthdate(parsed);
      }
    }

    prefilledRef.current = true;
  }, [initialProfile, firstName, lastName]);

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

  function validate() {
    const errors: Partial<
      Record<
        "firstName" | "lastName" | "birthdate" | "phone" | "address" | "bio",
        string
      >
    > = {};

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      errors.firstName = "First name is required";
    } else if (trimmedFirst.length < 2) {
      errors.firstName = "First name must be at least 2 characters";
    } else if (/\d/.test(trimmedFirst)) {
      errors.firstName = "First name cannot include numbers";
    }

    const trimmedLast = lastName.trim();
    if (!trimmedLast) {
      errors.lastName = "Last name is required";
    } else if (trimmedLast.length < 2) {
      errors.lastName = "Last name must be at least 2 characters";
    } else if (/\d/.test(trimmedLast)) {
      errors.lastName = "Last name cannot include numbers";
    }

    const bErr = validateBirthdate(birthdate);
    if (bErr) {
      errors.birthdate = bErr;
    }

    const trimmedPhone = phone.trim();
    const phoneDigits = trimmedPhone.replace(/\D/g, "");
    if (!trimmedPhone) {
      errors.phone = "Phone number is required";
    } else if (phoneDigits.length < 8) {
      errors.phone = "Phone number must include at least 8 digits";
    } else if (phoneDigits.length > 15) {
      errors.phone = "Phone number must include at most 15 digits";
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      errors.address = "Address is required";
    } else if (trimmedAddress.length < 5) {
      errors.address = "Address must be at least 5 characters";
    }

    const trimmedBio = bio.trim();
    if (trimmedBio.length > 280) {
      errors.bio = "Bio must be 280 characters or fewer";
    }

    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setSaving(false);
      setFieldErrors(validationErrors);
      setError("Please fix the highlighted fields and try again.");
      return;
    }

    setFieldErrors({});

    try {
      const birthIso = birthdate!.toISOString().slice(0, 10); // yyyy-mm-dd

      const trimmedBio = bio.trim();

      await saveOnboardingProfile(uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthdateISO: birthIso,
        phone: phone.trim(),
        address: address.trim(),
        bio: trimmedBio ? trimmedBio : undefined,
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
                className={`w-full rounded-lg border p-2 text-sm ${
                  fieldErrors.firstName
                    ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                    : ""
                }`}
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (fieldErrors.firstName) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.firstName;
                      return next;
                    });
                  }
                  if (error) setError("");
                }}
                placeholder="e.g. Dana"
                aria-invalid={fieldErrors.firstName ? "true" : "false"}
                aria-describedby={
                  fieldErrors.firstName ? "first-name-error" : undefined
                }
              />
              {fieldErrors.firstName && (
                <p
                  id="first-name-error"
                  className="mt-1 text-xs text-red-600"
                >
                  {fieldErrors.firstName}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Last name
              </label>
              <input
                className={`w-full rounded-lg border p-2 text-sm ${
                  fieldErrors.lastName
                    ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                    : ""
                }`}
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (fieldErrors.lastName) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.lastName;
                      return next;
                    });
                  }
                  if (error) setError("");
                }}
                placeholder="e.g. Cohen"
                aria-invalid={fieldErrors.lastName ? "true" : "false"}
                aria-describedby={
                  fieldErrors.lastName ? "last-name-error" : undefined
                }
              />
              {fieldErrors.lastName && (
                <p id="last-name-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.lastName}
                </p>
              )}
            </div>
          </div>

          {/* Birth date */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Birth date
            </label>
            <DatePicker
              selected={birthdate}
              onChange={(d) => {
                setBirthdate(d);
                if (fieldErrors.birthdate) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.birthdate;
                    return next;
                  });
                }
                if (error) setError("");
              }}
              maxDate={yearsAgo(13)} // can't pick younger than 13
              minDate={yearsAgo(120)}
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={120}
              placeholderText="Select your date of birth"
              className={`w-full rounded-lg border p-2 text-sm ${
                fieldErrors.birthdate
                  ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                  : ""
              }`}
              dateFormat="yyyy-MM-dd"
              isClearable={false}
              required
              aria-invalid={fieldErrors.birthdate ? "true" : "false"}
            />
            {fieldErrors.birthdate && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.birthdate}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone number
            </label>
            <input
              className={`w-full rounded-lg border p-2 text-sm ${
                fieldErrors.phone
                  ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                  : ""
              }`}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldErrors.phone) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.phone;
                    return next;
                  });
                }
                if (error) setError("");
              }}
              placeholder="+1 555 123 4567"
              inputMode="tel"
              aria-invalid={fieldErrors.phone ? "true" : "false"}
              aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Shared only with people you’re matched with to help.
            </p>
            {fieldErrors.phone && (
              <p id="phone-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.phone}
              </p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Address
            </label>
            <input
              className={`w-full rounded-lg border p-2 text-sm ${
                fieldErrors.address
                  ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                  : ""
              }`}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (fieldErrors.address) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.address;
                    return next;
                  });
                }
                if (error) setError("");
              }}
              placeholder="City, street, building"
              aria-invalid={fieldErrors.address ? "true" : "false"}
              aria-describedby={
                fieldErrors.address ? "address-error" : undefined
              }
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Used to show nearby requests. Don’t include apartment # if you
              don’t want to.
            </p>
            {fieldErrors.address && (
              <p id="address-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.address}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Bio (optional)
            </label>
            <textarea
              className={`w-full rounded-lg border p-2 text-sm ${
                fieldErrors.bio
                  ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                  : ""
              }`}
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                if (fieldErrors.bio) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.bio;
                    return next;
                  });
                }
                if (error) setError("");
              }}
              placeholder="Share a bit about how you like to help others."
              maxLength={280}
              rows={3}
              aria-invalid={fieldErrors.bio ? "true" : "false"}
              aria-describedby={fieldErrors.bio ? "bio-error" : "bio-help"}
            />
            <p id="bio-help" className="mt-1 text-[11px] text-gray-500">
              {bio.length}/280 characters.
            </p>
            {fieldErrors.bio && (
              <p id="bio-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.bio}
              </p>
            )}
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
