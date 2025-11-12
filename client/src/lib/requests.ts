import { apiFetch, buildQuery } from "./api";
import type { HelpRequest } from "./types";

export type CreateRequestInput = {
  title: string;
  description: string;
  category: "errand" | "carry" | "fix" | "other";
  reward?: string | null;
  address?: {
    city?: string;
    street?: string;
    houseNumber?: string;
    notes?: string;
  } | null;
  location: { lat: number; lng: number };
  requesterId?: string;
};

export type MapBounds = { west: number; south: number; east: number; north: number };

type Unsubscribe = () => void;

type RequestsResponse = { items: HelpRequest[] };

function toHelpRequest(item: any): HelpRequest {
  return {
    id: item.id,
    title: item.title ?? "",
    description: item.description ?? "",
    category: item.category ?? "other",
    reward: item.reward ?? null,
    requesterId: item.requesterId,
    helperId: item.helperId ?? undefined,
    status: item.status ?? "open",
    location: item.location ?? undefined,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
    address: item.address ?? null,
  };
}

function createPollingSubscription<T>(
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  intervalMs = 5000
): Unsubscribe {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function run() {
    if (stopped) return;
    try {
      const data = await fetcher();
      if (!stopped) onData(data);
    } catch (error) {
      console.error("[poll] fetch failed", error);
    } finally {
      if (!stopped) {
        timer = setTimeout(run, intervalMs);
      }
    }
  }

  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export async function createRequest(input: CreateRequestInput) {
  const payload = {
    title: input.title?.trim(),
    description: input.description?.trim() ?? "",
    category: input.category ?? "other",
    reward: input.reward ?? null,
    address: input.address ?? null,
    location: input.location,
  };

  const data = await apiFetch<HelpRequest>("/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return toHelpRequest(data);
}

export function listenOpenRequests(cb: (items: HelpRequest[]) => void): Unsubscribe {
  return createPollingSubscription(
    async () => {
      const data = await apiFetch<RequestsResponse>("/requests/open", { auth: false });
      return data.items.map(toHelpRequest);
    },
    cb
  );
}

export function listenOpenRequestsNearby(
  bounds: MapBounds | null,
  _geohashRange: { start: string; end: string } | null,
  cb: (items: HelpRequest[]) => void
): Unsubscribe {
  return createPollingSubscription(
    async () => {
      const params = bounds ?? {};
      const query = buildQuery(params as Record<string, number>);
      const data = await apiFetch<RequestsResponse>(`/requests/open${query}`, { auth: false });
      return data.items.map(toHelpRequest);
    },
    cb
  );
}

export function listenParticipatingRequests(
  _myId: string,
  cb: (items: HelpRequest[]) => void
): Unsubscribe {
  return createPollingSubscription(
    async () => {
      const data = await apiFetch<RequestsResponse>("/requests/participating");
      return data.items.map(toHelpRequest);
    },
    cb
  );
}

export async function acceptRequestAtomic(
  reqId: string,
  _helperId: string,
  nextStatus: "accepted" | "in_progress" = "accepted"
) {
  const data = await apiFetch<HelpRequest>(`/requests/${reqId}/accept`, {
    method: "POST",
    body: JSON.stringify({ nextStatus }),
  });
  return toHelpRequest(data);
}

export async function markDone(reqId: string) {
  const data = await apiFetch<HelpRequest>(`/requests/${reqId}/complete`, {
    method: "POST",
  });
  return toHelpRequest(data);
}

export async function deleteOpenRequest(reqId: string) {
  await apiFetch<void>(`/requests/${reqId}`, {
    method: "DELETE",
  });
}

export function listenUserHistory(
  _myId: string,
  cb: (items: HelpRequest[]) => void
): Unsubscribe {
  return createPollingSubscription(
    async () => {
      const data = await apiFetch<RequestsResponse>("/requests/history");
      return data.items.map(toHelpRequest);
    },
    cb,
    10000
  );
}

export function listenMyRequests(uid: string, callback: (reqs: HelpRequest[]) => void) {
  return listenUserHistory(uid, callback);
}