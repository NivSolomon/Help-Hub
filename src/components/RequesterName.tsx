// src/components/RequesterName.tsx
import React from "react";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

type Props = {
  uid: string;
  cacheRef: React.MutableRefObject<Record<string, any>>;
  onClick?: () => void;
};

export default function RequesterName({ uid, cacheRef, onClick }: Props) {
  const [name, setName] = React.useState<string>("Loading...");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cacheRef.current[uid]) {
        setName(
          cacheRef.current[uid].displayName ??
            cacheRef.current[uid].name ??
            cacheRef.current[uid].profile?.displayName ??
            "Unknown user"
        );
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", uid));
        const info = snap.data() || {};
        cacheRef.current[uid] = info;
        if (!cancelled) {
          setName(
            info.displayName ??
              info.name ??
              info.profile?.displayName ??
              "Unknown user"
          );
        }
      } catch {
        if (!cancelled) setName("Unknown user");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, cacheRef]);

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
