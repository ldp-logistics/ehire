/**
 * True when the error is likely a transient network / pool / Neon connectivity issue,
 * not bad SQL or validation. Used to avoid 500s on notification polling when DB is briefly unreachable.
 */
export function isTransientDbError(err: unknown): boolean {
  if (err == null) return false;
  const o = err as Record<string, unknown>;
  if (String(o.name ?? "") === "NeonDbError") return true;
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? err)
      : String(err);
  if (/fetch failed|connect timeout|connection.*timeout|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg)) return true;
  const cause = o.cause as Record<string, unknown> | undefined;
  if (cause && String(cause.code ?? "") === "UND_ERR_CONNECT_TIMEOUT") return true;
  if (cause && /Connect Timeout/i.test(String(cause.message ?? ""))) return true;
  return false;
}
