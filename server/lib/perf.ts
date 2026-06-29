import { Request, Response, NextFunction } from "express";

const SLOW_THRESHOLD_MS = 300;

/**
 * Middleware that logs API response times and warns for slow endpoints.
 * Already integrates with the existing express logger — this adds per-route timing.
 */
export function perfLogger(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();

  const start = Date.now();
  const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;

  (res as any).end = function (chunk?: unknown, encoding?: unknown, cb?: unknown) {
    const duration = Date.now() - start;
    if (duration >= SLOW_THRESHOLD_MS) {
      console.warn(`[PERF] SLOW ${req.method} ${req.path} ${res.statusCode} took ${duration}ms`);
    }
    return originalEnd(chunk, encoding, cb);
  };

  next();
}

// ==================== In-Memory Cache ====================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Simple in-memory TTL cache.
 * Use for stable or expensive data (dashboard stats, policies, lookup lists).
 */
export const memCache = {
  get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.data as T;
  },

  set<T>(key: string, data: T, ttlMs: number) {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
  },

  invalidate(keyPrefix: string) {
    for (const key of Array.from(store.keys())) {
      if (key.startsWith(keyPrefix)) store.delete(key);
    }
  },

  clear() {
    store.clear();
  },
};
