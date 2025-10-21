import { useEffect, useRef, useState, useMemo } from "react";
import AuthGate from "../components/AuthGate";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, updateProfile, type User } from "firebase/auth";
import type { HelpRequest } from "../lib/types";
import { listenUserHistory } from "../lib/requests";

const PAGE_SIZE = 5;

async function uploadAvatar(uid: string, file: File): Promise<string> {
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const storage = getStorage();
  const r = ref(storage, `profile-pictures/${uid}`);
  await uploadBytes(r, file, { contentType: file.type });
  const url = await getDownloadURL(r);
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function fmtDate(ms?: number) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function StatusBadge({ status }: { status: HelpRequest["status"] }) {
  const map: Record<string, string> = {
    open: "bg-green-100 text-green-700",
    accepted: "bg-amber-100 text-amber-700",
    in_progress: "bg-amber-100 text-amber-700",
    done: "bg-gray-200 text-gray-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [hydrated, setHydrated] = useState(!!auth.currentUser);

  const [displayName, setDisplayName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History (live)
  const [history, setHistory] = useState<HelpRequest[] | null>(null);

  // Filters & sort & pagination
  const [roleFilter, setRoleFilter] = useState<"all" | "requester" | "helper">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | HelpRequest["status"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | HelpRequest["category"]>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "reward_desc" | "reward_asc">("date_desc");
  const [page, setPage] = useState(1);

  // Hydrate auth on hard refresh
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setHydrated(true);
      if (u) {
        setDisplayName(u.displayName ?? u.providerData[0]?.displayName ?? "");
        setPhotoPreview(u.photoURL ?? null);
      }
    });
    return () => unsub();
  }, []);

  // Live user history
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenUserHistory(user.uid, setHistory);
    return () => unsub();
  }, [user?.uid]);

  // Reset to page 1 whenever filters/sort change
  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, categoryFilter, sortBy]);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function onSave() {
    if (!user) return;
    setSaving(true);
    try {
      let nextPhotoURL = user.photoURL ?? undefined;
      if (photoFile) nextPhotoURL = await uploadAvatar(user.uid, photoFile);

      await updateProfile(user, {
        displayName: displayName || undefined,
        photoURL: nextPhotoURL,
      });

      await user.reload();
      const fresh = auth.currentUser;
      setUser(fresh);
      setPhotoFile(null);
      setPhotoPreview(nextPhotoURL ?? null);
      alert("Profile updated ✅");
    } catch (err) {
      console.error(err);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  // Derived list -> filter -> sort -> paginate
  const filteredSorted = useMemo(() => {
    if (!history) return [];
    const uid = user?.uid;

    const rows = history
      .filter((r) => {
        // Role
        const isReq = r.requesterId === uid;
        const isHelp = r.helperId === uid;
        if (roleFilter === "requester" && !isReq) return false;
        if (roleFilter === "helper" && !isHelp) return false;

        // Status
        if (statusFilter !== "all" && r.status !== statusFilter) return false;

        // Category
        if (categoryFilter !== "all" && r.category !== categoryFilter) return false;

        return true;
      })
      .sort((a, b) => {
        const ta = (a as any).createdAt?.toMillis?.() ?? 0;
        const tb = (b as any).createdAt?.toMillis?.() ?? 0;
        const ra = a.reward ?? -Infinity;
        const rb = b.reward ?? -Infinity;

        switch (sortBy) {
          case "date_desc":
            return tb - ta;
          case "date_asc":
            return ta - tb;
          case "reward_desc":
            return (rb as number) - (ra as number);
          case "reward_asc":
            return (ra as number) - (rb as number);
          default:
            return tb - ta;
        }
      });

    return rows;
  }, [history, roleFilter, statusFilter, categoryFilter, sortBy, user?.uid]);

  const total = filteredSorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = filteredSorted.slice(start, start + PAGE_SIZE);

  function gotoPage(p: number) {
    const clamped = Math.min(Math.max(1, p), pageCount);
    setPage(clamped);
  }

  return (
    <AuthGate>
      <div className="mx-auto max-w-4xl p-6 space-y-8">
        <h2 className="text-2xl font-semibold">Your Profile</h2>

        {/* Profile Card */}
        {!hydrated ? (
          <div className="rounded-xl border p-6">
            <div className="flex items-center gap-4 animate-pulse">
              <div className="h-20 w-20 rounded-full bg-gray-200" />
              <div className="space-y-2">
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="h-3 w-56 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-6 space-y-6 bg-white">
            <div className="flex items-center gap-5">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Profile photo"
                  className="h-20 w-20 rounded-full object-cover border border-gray-200"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-gray-200 border border-gray-200" />
              )}

              <div className="flex-1">
                <div className="font-semibold text-lg">{displayName || "Unnamed user"}</div>
                <div className="text-gray-600 text-sm">{user?.email}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickPhoto}
                  />
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  disabled
                  value={user?.email ?? ""}
                  className="w-full border rounded-lg p-2 bg-gray-100 text-gray-600"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onSave}
                disabled={saving}
                className="rounded-lg bg-black text-white px-4 py-2 hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {photoFile && (
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(user?.photoURL ?? null); }}
                  className="rounded-lg border px-4 py-2 hover:bg-gray-50"
                >
                  Cancel photo
                </button>
              )}
            </div>
          </div>
        )}

        {/* History */}
        <section className="rounded-xl border bg-white">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">History</h3>
            <p className="text-sm text-gray-600">Requests you created or helped with.</p>
          </div>

          {/* Controls */}
          <div className="p-4 grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="border rounded-lg p-2"
              >
                <option value="all">All</option>
                <option value="requester">Requester</option>
                <option value="helper">Helper</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="border rounded-lg p-2"
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="border rounded-lg p-2"
              >
                <option value="all">All</option>
                <option value="errand">Errand</option>
                <option value="carry">Carry / Move</option>
                <option value="fix">Fix</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border rounded-lg p-2"
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="reward_desc">Reward (high → low)</option>
                <option value="reward_asc">Reward (low → high)</option>
              </select>
            </div>
          </div>

          {/* Loading */}
          {history === null && (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse h-14 rounded-lg bg-gray-100" />
              ))}
            </div>
          )}

          {/* Empty-after-filter */}
          {history !== null && pageRows.length === 0 && (
            <div className="p-8 text-center text-gray-600">
              No results. Try changing filters.
            </div>
          )}

          {/* List (paginated) */}
          {pageRows.length > 0 && (
            <ul className="divide-y">
              {pageRows.map((r) => {
                const ts = (r as any).createdAt?.toMillis?.() as number | undefined;
                const role =
                  r.requesterId === user?.uid
                    ? "Requester"
                    : r.helperId === user?.uid
                    ? "Helper"
                    : "";
                return (
                  <li key={r.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{r.title || "(untitled)"}</span>
                          <StatusBadge status={r.status} />
                          {role && (
                            <span className="text-xs text-gray-500 px-1.5 py-0.5 border rounded-full">
                              {role}
                            </span>
                          )}
                        </div>
                        {r.description && (
                          <div className="text-sm text-gray-600 line-clamp-2 mt-0.5">
                            {r.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          {r.category} {r.reward != null ? `• reward: ${r.reward}` : ""}{" "}
                          {ts ? `• ${fmtDate(ts)}` : ""}
                        </div>
                      </div>
                      <div
                        className={`h-2.5 w-2.5 rounded-full mt-1 ${
                          r.status === "done"
                            ? "bg-gray-400"
                            : r.status === "open"
                            ? "bg-green-500"
                            : "bg-amber-500"
                        }`}
                        title={r.status}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination */}
          {history !== null && total > 0 && (
            <div className="p-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {page} of {pageCount} • Showing {pageRows.length} of {total}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                  onClick={() => gotoPage(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </button>

                {/* Simple page numbers (compact for small counts) */}
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: pageCount }).map((_, i) => {
                    const p = i + 1;
                    const active = p === page;
                    return (
                      <button
                        key={p}
                        onClick={() => gotoPage(p)}
                        className={`h-8 w-8 rounded-md text-sm ${active ? "bg-black text-white" : "border hover:bg-gray-50"}`}
                        aria-current={active ? "page" : undefined}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                  onClick={() => gotoPage(page + 1)}
                  disabled={page >= pageCount}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AuthGate>
  );
}
