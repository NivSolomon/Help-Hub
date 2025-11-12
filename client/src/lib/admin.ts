import { apiFetch } from "./api";

export type AdminOverview = {
  stats: {
    openRequests: number;
    activeRequests: number;
    completedRequests: number;
    totalUsers: number;
  };
  recentRequests: Array<{
    id: string;
    title: string;
    status: string;
    requesterId: string | null;
    helperId: string | null;
    createdAt: number | null;
    updatedAt: number | null;
  }>;
  recentUsers: Array<{
    id: string;
    displayName: string | null;
    email: string | null;
    createdAt: number | null;
    roles: Record<string, unknown> | null;
  }>;
};

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/admin/overview");
}


