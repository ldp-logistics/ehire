import type { Request } from "express";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    _sql = neon(url);
  }
  return _sql;
}

export type AuditRequestMeta = {
  ipAddress: string | null;
  userAgent: string | null;
};

/** Authenticated actor + client metadata for audit rows. */
export type AuditActorContext = AuditRequestMeta & { userId: string };

/** Prefer X-Forwarded-For first hop when behind a proxy. */
export function getClientAuditMeta(req: Request): AuditRequestMeta {
  const xf = req.headers["x-forwarded-for"];
  const fromForwarded =
    typeof xf === "string"
      ? xf.split(",")[0]?.trim()
      : Array.isArray(xf)
        ? xf[0]?.trim()
        : "";
  const ip = (fromForwarded || req.ip || (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress || "")
    .trim() || null;
  const uaRaw = req.headers["user-agent"];
  const userAgent = (typeof uaRaw === "string" ? uaRaw : uaRaw?.[0] || "").trim() || null;
  return { ipAddress: ip, userAgent };
}

export type AppendAuditEntry = {
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Best-effort insert into `audit_logs` (legacy: `audit_log` without IP/UA if table missing).
 * Never throws into callers; failures are console.warn only.
 */
export async function appendAuditLog(entry: AppendAuditEntry): Promise<void> {
  try {
    const detailsJson = entry.details ? JSON.stringify(entry.details) : null;
    await getSql()`
      INSERT INTO audit_logs(entity_type, entity_id, action, performed_by, details, ip_address, user_agent, created_at)
      VALUES(
        ${entry.entityType},
        ${entry.entityId},
        ${entry.action},
        ${entry.performedBy},
        ${detailsJson}::jsonb,
        ${entry.ipAddress ?? null},
        ${entry.userAgent ?? null},
        NOW()
      )
    `;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      try {
        const detailsJson = entry.details ? JSON.stringify(entry.details) : null;
        await getSql()`
          INSERT INTO audit_log(entity_type, entity_id, action, performed_by, details, created_at)
          VALUES(
            ${entry.entityType},
            ${entry.entityId},
            ${entry.action},
            ${entry.performedBy},
            ${detailsJson}::jsonb,
            NOW()
          )
        `;
      } catch (e2: unknown) {
        console.warn("[audit] appendAuditLog legacy insert failed:", (e2 as Error)?.message);
      }
    } else {
      console.warn("[audit] appendAuditLog failed:", (e as Error)?.message);
    }
  }
}
