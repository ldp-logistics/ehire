import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Super Region view filter (Step 7d). When a Pakistan Super Region admin selects
 * a single region in the top nav, we append `?region=<code>` to every /api GET so
 * the whole UI scopes to that region. null = show all regions (default).
 * The backend only honors this for super admins (effectiveRegionsFor); others ignore it.
 */
const REGION_VIEW_KEY = "ehire:region-view";
export const REGION_VIEW_CHANGED = "ehire:region-view-changed";

/** Paths that must never receive ?region= (auth identity, public, region config). */
const REGION_VIEW_SKIP_PREFIXES = [
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/assignment-visibility",
  "/api/settings/regions",
  "/api/departments/branches",
  "/api/onboarding-templates",
  "/api/feed",
  "/api/audit",
  "/api/assets/public/",
  // Public careers page — returns ALL published jobs; region filtering is client-side only.
  // Must never be scoped by the HR user's region-view cookie.
  "/api/recruitment/jobs/published",
];

let activeRegionView: string | null = (() => {
  try { return localStorage.getItem(REGION_VIEW_KEY); } catch { return null; }
})();

export function getRegionView(): string | null {
  return activeRegionView;
}

export function setRegionView(region: string | null) {
  activeRegionView = region && region.trim() ? region.trim() : null;
  try {
    if (activeRegionView) localStorage.setItem(REGION_VIEW_KEY, activeRegionView);
    else localStorage.removeItem(REGION_VIEW_KEY);
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent(REGION_VIEW_CHANGED, { detail: activeRegionView }));
  } catch { /* ignore */ }
  // Defer invalidation so the region dropdown can close before a full UI refetch.
  queueMicrotask(() => {
    void queryClient.invalidateQueries();
  });
}

export function withRegionView(url: string): string {
  if (!activeRegionView || !url.startsWith("/api/")) return url;
  if (REGION_VIEW_SKIP_PREFIXES.some((p) => url.startsWith(p))) return url;
  if (/[?&]region=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "region=" + encodeURIComponent(activeRegionView);
}

/** Patch global fetch so custom queryFns / useEffect fetches also honor the region filter. */
export function installRegionAwareFetch() {
  if (typeof window === "undefined") return;
  const native = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") return native(input, init);
    if (typeof input === "string") {
      return native(withRegionView(input), init);
    }
    if (input instanceof URL) {
      return native(withRegionView(input.toString()), init);
    }
    if (input instanceof Request) {
      const nextUrl = withRegionView(input.url);
      if (nextUrl === input.url) return native(input, init);
      return native(new Request(nextUrl, input), init);
    }
    return native(input, init);
  }) as typeof fetch;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const finalUrl =
    method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD"
      ? withRegionView(url)
      : url;
  const res = await fetch(finalUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const first = Array.isArray(queryKey) && queryKey.length > 0 ? queryKey[0] : "";
    const baseUrl =
      typeof first === "string" && first.startsWith("/")
        ? first
        : (queryKey.join("/") as string);
    // withRegionView is also applied in installRegionAwareFetch; keep explicit for clarity.
    const res = await fetch(withRegionView(baseUrl), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      staleTime: 5_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
