// src/components/RequesterName.tsx
import React from "react";
import { fetchUserProfile } from "../lib/users";

type Props = {
  uid: string;
  cacheRef: React.MutableRefObject<Record<string, any>>;
  onClick?: () => void;
};

function deriveName(data: any): string {
  if (!data) return "Unknown user";
  if (typeof data.name === "string" && data.name.trim() !== "") {
    return data.name.trim();
  }
  if (
    typeof data.displayName === "string" &&
    data.displayName.trim() !== ""
  ) {
    return data.displayName.trim();
  }
  if (
    typeof data.profile?.displayName === "string" &&
    data.profile.displayName.trim() !== ""
  ) {
    return data.profile.displayName.trim();
  }

  const first =
    typeof data.firstName === "string" ? data.firstName.trim() : "";
  const last =
    typeof data.lastName === "string" ? data.lastName.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;

  const profileFirst =
    typeof data.profile?.firstName === "string"
      ? data.profile.firstName.trim()
      : "";
  const profileLast =
    typeof data.profile?.lastName === "string"
      ? data.profile.lastName.trim()
      : "";
  const profileCombined = [profileFirst, profileLast]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (profileCombined) return profileCombined;

  return "Unknown user";
}

export default function RequesterName({ uid, cacheRef, onClick }: Props) {
  const [name, setName] = React.useState<string>("Loading...");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = cacheRef.current[uid];
      if (cached) {
        const derived = deriveName(cached);
        if (!("name" in cached) || cached.name !== derived) {
          cacheRef.current[uid] = { ...cached, name: derived };
        }
        setName(derived);
        return;
      }

      try {
        const info = await fetchUserProfile(uid);
        const derived = deriveName(info);
        cacheRef.current[uid] = { ...info, name: derived };
        if (!cancelled) {
          setName(derived);
        }
      } catch {
        if (!cancelled) setName("Unknown user");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, cacheRef]);

  if (onClick) {
    return (
      <button
        className="underline decoration-dotted hover:text-gray-800"
        onClick={onClick}
        title="View profile"
      >
        {name}
      </button>
    );
  }

  return (
    <span className="underline decoration-dotted" title="View profile">
      {name}
    </span>
  );
}
