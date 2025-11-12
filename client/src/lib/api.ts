import axios, { type AxiosRequestConfig, type Method } from "axios";

import { auth } from "./firebase";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string) {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  return `/${trimmed}`;
}

function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_URL;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return trimTrailingSlash(explicit.trim());
  }

  const basePath =
    typeof import.meta.env.VITE_API_BASE_PATH === "string" &&
    import.meta.env.VITE_API_BASE_PATH.trim() !== ""
      ? ensureLeadingSlash(import.meta.env.VITE_API_BASE_PATH.trim())
      : "/api/v1";

  if (typeof window !== "undefined" && window.location) {
    return `${trimTrailingSlash(window.location.origin)}${basePath}`;
  }

  const fallbackOrigin =
    typeof import.meta.env.VITE_DEV_SERVER_URL === "string" &&
    import.meta.env.VITE_DEV_SERVER_URL.trim() !== ""
      ? trimTrailingSlash(import.meta.env.VITE_DEV_SERVER_URL.trim())
      : "http://localhost:4000";

  return `${fallbackOrigin}${basePath}`;
}

export const API_BASE = resolveApiBase();

const http = axios.create({
  baseURL: API_BASE,
});

async function getToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

type RequestOptions = {
  auth?: boolean;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, unknown>;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    auth: requireAuth = true,
    method = "GET",
    headers,
    body,
    params,
  } = options;

  const requestHeaders = new Headers(headers);

  let token: string | null = null;
  if (requireAuth) {
    token = await getToken();
    if (!token) {
      throw new Error("Authentication required");
    }
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const buildConfig = (): AxiosRequestConfig => {
    const relativePath = path.startsWith("/") ? path.slice(1) : path;

    const config: AxiosRequestConfig = {
      url: relativePath,
      method: method as Method,
      headers: Object.fromEntries(requestHeaders.entries()),
      params,
    };

    if (body !== undefined && method.toUpperCase() !== "GET") {
      config.data = body;
    } else if (body !== undefined && method.toUpperCase() === "GET") {
      config.params = { ...(params ?? {}), ...(typeof body === "object" ? body : {}) };
    }

    return config;
  };

  const execute = async () => {
    const config = buildConfig();
    const response = await http.request<T>(config);
    return response.data;
  };

  try {
    return await execute();
  } catch (error) {
    if (
      requireAuth &&
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      const refreshedToken = await getToken(true);
      if (refreshedToken && refreshedToken !== token) {
        requestHeaders.set("Authorization", `Bearer ${refreshedToken}`);
        try {
          return await execute();
        } catch (retryError) {
          if (axios.isAxiosError(retryError)) {
            const message =
              (retryError.response?.data as any)?.message ?? retryError.message;
            throw new Error(message);
          }
          throw retryError;
        }
      }
    }

    if (axios.isAxiosError(error)) {
      const message = (error.response?.data as any)?.message ?? error.message;
      throw new Error(message);
    }

    throw error;
  }
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

