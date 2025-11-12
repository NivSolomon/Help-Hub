import React from "react";
import { useNavigate } from "react-router-dom";

import AuthGate from "../components/AuthGate";
import Navbar from "../components/Navbar";
import { useAuthUser, useUserProfile } from "../lib/useAuthUser";
import { fetchAdminOverview, type AdminOverview } from "../lib/admin";
import { deleteOpenRequest } from "../lib/requests";
import { useNotifications } from "../components/NotificationCenter";

function formatDate(value: number | null) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch {
    return "—";
  }
}

export default function AdminPage() {
  return (
    <AuthGate>
      <AdminSurface />
    </AuthGate>
  );
}

function AdminSurface() {
  const user = useAuthUser();
  const profile = useUserProfile(user?.uid);
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const isAdmin = Boolean(profile?.isAdmin ?? profile?.roles?.admin);

  React.useEffect(() => {
    if (profile === undefined) return;
    if (profile && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [profile, isAdmin, navigate]);

  const loadOverview = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminOverview();
      setOverview(data);
    } catch (err: any) {
      console.error("[admin] overview fetch failed", err);
      setError(err?.message ?? "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleFocusOnHome = React.useCallback(
    (requestId: string) => {
      navigate("/", {
        state: { focusRequestId: requestId },
        replace: false,
      });
    },
    [navigate]
  );

  const handleDeleteRequest = React.useCallback(
    async (requestId: string) => {
      const request = overview?.recentRequests.find((r) => r.id === requestId);
      if (!request) return;
      const confirmed = window.confirm(
        `Delete request "${request.title}"? This cannot be undone.`
      );
      if (!confirmed) return;
      try {
        await deleteOpenRequest(requestId);
        notify({ message: "Request removed.", variant: "info" });
        void loadOverview();
      } catch (err: any) {
        console.error("[admin] delete request failed", err);
        notify({
          message: err?.message ?? "Failed to delete request.",
          variant: "error",
        });
      }
    },
    [overview?.recentRequests, notify, loadOverview]
  );

  if (profile === undefined) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100dvh-80px)] max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">
            Admin Console
          </h1>
          <p className="text-sm text-gray-500">
            Monitor platform activity, intervene on requests, and keep the
            community healthy.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadOverview}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
          {error && (
            <span className="text-sm font-medium text-rose-600">{error}</span>
          )}
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Open requests"
            value={overview?.stats.openRequests ?? 0}
            tone="indigo"
          />
          <StatCard
            title="Active (accepted)"
            value={overview?.stats.activeRequests ?? 0}
            tone="emerald"
          />
          <StatCard
            title="Completed"
            value={overview?.stats.completedRequests ?? 0}
            tone="sky"
          />
          <StatCard
            title="Total users"
            value={overview?.stats.totalUsers ?? 0}
            tone="amber"
          />
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Recent requests
              </h2>
              <p className="text-xs text-gray-500">
                Last activity ordered by creation time.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-gray-700">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Requester</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {overview?.recentRequests?.length ? (
                  overview.recentRequests.map((req) => (
                    <tr
                      key={req.id}
                      className="border-t border-gray-100 last:border-b"
                    >
                      <td className="px-3 py-3 font-medium text-gray-900">
                        {req.title || "Untitled"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-gray-200 px-2 py-1 text-xs capitalize">
                          {req.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-indigo-600">
                        {req.requesterId ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {formatDate(req.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:border-indigo-200 hover:text-indigo-600"
                            onClick={() => handleFocusOnHome(req.id)}
                          >
                            View on map
                          </button>
                          {req.status === "open" && (
                            <button
                              className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                              onClick={() => handleDeleteRequest(req.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-sm text-gray-500"
                    >
                      {loading
                        ? "Loading latest requests…"
                        : "No recent requests found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Recent sign-ups
              </h2>
              <p className="text-xs text-gray-500">
                Track newest community members and their join dates.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {overview?.recentUsers?.length ? (
              overview.recentUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {user.displayName ?? "Unknown user"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {user.email ?? "No email"}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Joined {formatDate(user.createdAt)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white/90 p-6 text-center text-sm text-gray-500">
                {loading
                  ? "Loading recent users…"
                  : "No recent sign-ups to display."}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

type StatTone = "indigo" | "emerald" | "sky" | "amber";

function StatCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: StatTone;
}) {
  const toneMap: Record<StatTone, string> = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-200/60 text-indigo-600",
    emerald:
      "from-emerald-500/10 to-emerald-500/5 border-emerald-200/60 text-emerald-600",
    sky: "from-sky-500/10 to-sky-500/5 border-sky-200/60 text-sky-600",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-200/60 text-amber-600",
  };

  return (
    <div
      className={`rounded-3xl border bg-gradient-to-br p-5 shadow-lg ${toneMap[tone]}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}


