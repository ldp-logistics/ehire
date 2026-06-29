/**
 * Email Notification Engine
 *
 * Single entry-point: notifyEmail(eventKey, context, recipients)
 *
 * Flow:
 *  1. Load the setting for this event from DB (or fall back to catalog defaults).
 *  2. If disabled, skip.
 *  3. Render subject + body by replacing {{variables}} with context values.
 *  4. Wrap body in the branded HTML email frame.
 *  5. Send via SendGrid for each recipient.
 *  6. Log result to email_notification_logs.
 *
 * This function is FIRE-AND-FORGET safe — callers should not await it.
 * All errors are swallowed and logged to console only.
 */

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { sendEmail } from "./email.js";
import { EMAIL_EVENT_MAP } from "../../shared/emailEventCatalog.js";
import { REGIONAL_SUPER_ADMIN_GRANT } from "./rbac.js";
import { SUPER_REGION_CODE } from "./regionAccess.js";
import { sqlEmployeeEffectiveRegion } from "./employeeRegionSql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let envLoaded = false;
function ensureNotifyEnv() {
  if (!envLoaded) {
    config({ path: path.resolve(__dirname, "../../.env") });
    envLoaded = true;
  }
}

/** First non-empty trimmed env value. */
function pickFrom(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v) return v;
  }
  return "";
}

/**
 * SendGrid "From" for `notifyEmail` events, by module (event key prefix).
 *
 * Each module can set `EMAIL_FROM_<MODULE>`; all fall back to
 * `EMAIL_FROM_NOTIFICATIONS`, then `EMAIL_FROM`.
 *
 * | Prefix        | Env var (optional)        |
 * |---------------|-----------------------------|
 * | leave.        | EMAIL_FROM_LEAVE            |
 * | recruit./candidate. | EMAIL_FROM_RECRUITMENT |
 * | task.         | EMAIL_FROM_TASK             |
 * | it.           | EMAIL_FROM_IT               |
 * | onboarding.   | EMAIL_FROM_ONBOARDING       |
 * | offboarding.  | EMAIL_FROM_OFFBOARDING → ONBOARDING |
 * | company.      | EMAIL_FROM_COMPANY          |
 * | general.      | EMAIL_FROM_GENERAL          |
 */
export function resolveNotificationFromAddress(eventKey: string): string | undefined {
  ensureNotifyEnv();
  const globalFallback = () =>
    pickFrom(process.env.EMAIL_FROM_NOTIFICATIONS, process.env.EMAIL_FROM);
  const recruitmentFallback = () =>
    pickFrom(
      process.env.EMAIL_FROM_RECRUITMENT,
      process.env.EMAIL_FROM_NOTIFICATIONS,
      process.env.EMAIL_FROM,
    );

  let chosen = "";
  if (eventKey.startsWith("offboarding.")) {
    chosen = pickFrom(
      process.env.EMAIL_FROM_OFFBOARDING,
      process.env.EMAIL_FROM_ONBOARDING,
      globalFallback(),
    );
  } else if (eventKey.startsWith("onboarding.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_ONBOARDING, globalFallback());
  } else if (eventKey.startsWith("recruit.") || eventKey.startsWith("candidate.")) {
    chosen = recruitmentFallback();
  } else if (eventKey.startsWith("it.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_IT, globalFallback());
  } else if (eventKey.startsWith("task.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_TASK, globalFallback());
  } else if (eventKey.startsWith("leave.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_LEAVE, globalFallback());
  } else if (eventKey.startsWith("loan.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_LOANS, globalFallback());
  } else if (eventKey.startsWith("company.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_COMPANY, globalFallback());
  } else if (eventKey.startsWith("general.")) {
    chosen = pickFrom(process.env.EMAIL_FROM_GENERAL, globalFallback());
  } else {
    chosen = globalFallback();
  }

  return chosen || undefined;
}

// ── Email branding (DB-backed, managed in Settings UI) ──────────────────────

import type { EmailBrandingDTO } from "../modules/settings/AppSettingsService.js";
import { EMAIL_BRANDING_DEFAULTS } from "../modules/settings/AppSettingsService.js";

let _brandingCache: { data: EmailBrandingDTO; expiresAt: number } | null = null;
const BRANDING_TTL_MS = 2 * 60 * 1000;

async function loadEmailBranding(): Promise<EmailBrandingDTO> {
  if (_brandingCache && Date.now() < _brandingCache.expiresAt) return _brandingCache.data;
  try {
    const sql = getSql();
    const rows = (await sql`SELECT value FROM app_settings WHERE key = 'email_branding'`) as { value: string }[];
    const raw = rows[0]?.value;
    if (raw) {
      const parsed = { ...EMAIL_BRANDING_DEFAULTS, ...JSON.parse(raw) } as EmailBrandingDTO;
      _brandingCache = { data: parsed, expiresAt: Date.now() + BRANDING_TTL_MS };
      return parsed;
    }
  } catch { /* fall through */ }
  return { ...EMAIL_BRANDING_DEFAULTS };
}

/** Bust the in-process branding cache (called after Settings save). */
export function bustEmailBrandingCache(): void {
  _brandingCache = null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifyContext = Record<string, string | number | null | undefined>;

/** A resolved recipient ready for dispatch. */
export interface Recipient {
  email: string;
  name?: string;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

interface SettingRow {
  event_key: string;
  enabled: boolean;
  subject_template: string;
  body_template: string;
}

async function loadSetting(eventKey: string): Promise<SettingRow | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT event_key, enabled, subject_template, body_template
      FROM email_notification_settings
      WHERE event_key = ${eventKey}
    `) as SettingRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function logResult(
  eventKey: string,
  recipientEmail: string,
  subject: string | null,
  status: "sent" | "failed" | "skipped",
  error?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO email_notification_logs (event_key, recipient_email, subject, status, error, metadata)
      VALUES (
        ${eventKey},
        ${recipientEmail},
        ${subject},
        ${status},
        ${error ?? null},
        ${metadata ? JSON.stringify(metadata) : null}
      )
    `;
  } catch {
    // Log failures are silently ignored — they must never break the main flow.
  }
}

// ── Public app URL (for {{app_url}} in templates) ─────────────────────────────

/**
 * Strips accidental `/api/.../inbound-email` style paths so emails link to the SPA, not webhooks.
 */
export function normalizePublicAppUrl(rawInput: string): string {
  const raw = (rawInput ?? "").trim().replace(/\/$/, "");
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const p = u.pathname.toLowerCase();
    if (p.includes("/inbound-email") || p.includes("/api/recruitment/inbound")) {
      return u.origin;
    }
    return raw;
  } catch {
    return raw;
  }
}

/** `APP_URL` from env, normalized for {{app_url}} and offer links. */
export function resolvePublicAppUrlForTemplates(): string {
  return normalizePublicAppUrl(process.env.APP_URL ?? "");
}

/** Escape plain text for safe use inside HTML email bodies (names, titles, free text). */
export function escapeHtmlForEmail(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function escapeHtmlAttrForEmail(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Renders a primary action as a pill “button” (anchor) for HTML emails — solid fill, padding,
 * shadow — so links read as CTAs rather than underlined text or bare URLs.
 */
export function emailCtaButtonHtml(
  href: string,
  label: string,
  options?: { backgroundColor?: string; color?: string },
): string {
  const bg = options?.backgroundColor ?? "#2563eb";
  const fg = options?.color ?? "#ffffff";
  const h = escapeHtmlAttrForEmail(href);
  const lbl = escapeHtmlForEmail(label);
  return `<a href="${h}" style="display:inline-block;padding:12px 28px;background:${bg};color:${fg};text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;line-height:1.25;box-shadow:0 1px 2px rgba(0,0,0,.1);font-family:'Segoe UI',Arial,sans-serif">${lbl}</a>`;
}

const SINGLE_URL_PARAGRAPH = /^https?:\/\/\S+$/i;

/**
 * Turns plain-text recruitment emails (from the UI composer / “Send to candidate”) into styled HTML:
 * paragraphs that are only a URL become centered CTA buttons + fallback link; other paragraphs become
 * readable blocks. Used so SendGrid delivers the same branded look as notifyEmail, not raw &lt;br&gt; soup.
 */
export function plainTextRecruitmentEmailToHtml(plain: string): string {
  const esc = escapeHtmlForEmail;
  const trimmed = (plain ?? "").trim();
  if (!trimmed) return "<p></p>";
  const parts: string[] = [];
  for (const para of trimmed.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    const oneLine = p.replace(/\s+/g, " ").trim();
    if (SINGLE_URL_PARAGRAPH.test(oneLine)) {
      const url = oneLine;
      let label = "Open link";
      let bg = "#2563eb";
      if (url.includes("/tentative-portal/")) {
        label = "Open document portal";
        bg = "#ca8a04";
      } else if (url.includes("/offer-sign/") || url.includes("/offer-response/")) {
        label = "Review & sign your offer";
        bg = "#15803d";
      }
      parts.push(`<p style="margin:20px 0 12px;text-align:center">${emailCtaButtonHtml(url, label, { backgroundColor: bg })}</p>`);
      parts.push(
        `<p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#64748b;text-align:center">If the button doesn&rsquo;t work, copy this link:<br/><span style="word-break:break-all;color:#475569">${esc(url)}</span></p>`,
      );
    } else {
      parts.push(
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155">${esc(p).replace(/\n/g, "<br/>")}</p>`,
      );
    }
  }
  return parts.length ? parts.join("\n") : `<p style="margin:0;font-size:15px;line-height:1.65;color:#334155">${esc(trimmed).replace(/\n/g, "<br/>")}</p>`;
}

// ── Template renderer ─────────────────────────────────────────────────────────

function renderTemplate(template: string, context: NotifyContext): string {
  // Conditional blocks: {{#key}}...{{/key}} — rendered only when key is truthy
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content: string) => {
    const val = context[key];
    return val ? content : "";
  });
  // Simple substitutions
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val != null ? String(val) : "";
  });
  return out;
}

/**
 * Wraps the rendered body in a clean, branded HTML email frame.
 * Branding (colors, logo) is loaded from the DB `app_settings` table
 * (managed by Settings → Email branding) with an in-process cache.
 *
 * If body already contains HTML tags it is embedded as-is;
 * otherwise each line is wrapped in a <p>.
 */
export async function wrapInEmailFrame(body: string, subject: string, _eventKey?: string): Promise<string> {
  ensureNotifyEnv();
  const companyName = (process.env.COMPANY_NAME ?? "LDP Logistics").trim();
  const softwareName = (process.env.SOFTWARE_NAME ?? "eHire").trim();

  let b: EmailBrandingDTO;
  try { b = await loadEmailBranding(); } catch { b = { ...EMAIL_BRANDING_DEFAULTS }; }

  const appUrl = resolvePublicAppUrlForTemplates();
  const logoUrl = b.logoUrl ? (b.logoUrl.startsWith("http") ? b.logoUrl : `${appUrl}${b.logoUrl}`) : "";
  const logoH = String(b.logoHeight || 36);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" height="${logoH}" style="display:block;height:${logoH}px;max-height:80px;width:auto;border:0" />`
    : `<span style="color:${b.headerTitleColor};font-size:18px;font-weight:600;letter-spacing:.3px">${companyName}</span>`;

  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const htmlBody = isHtml
    ? body
    : body
        .split(/\n{2,}/)
        .map((para) =>
          `<p style="margin:0 0 12px 0">${para
            .split("\n")
            .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
            .join("<br>")}</p>`,
        )
        .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${subject.replace(/</g, "&lt;")}</title>
</head>
<body style="margin:0;padding:0;background:${b.outerBg};font-family:'Segoe UI',Arial,sans-serif;color:${b.contentText}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:${b.cardBg};border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:${b.headerBg};padding:24px 32px">
          ${logoHtml}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;font-size:15px;line-height:1.6;color:${b.contentText}">
          ${htmlBody}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:${b.footerBg};padding:20px 32px;border-top:1px solid ${b.footerBorder}">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:12px;color:${b.footerText};line-height:1.5">
                ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" height="20" style="display:inline-block;height:20px;width:auto;border:0;vertical-align:middle;margin-right:6px;opacity:.6" />` : ""}
                <span style="vertical-align:middle">${companyName}</span>
                <br/>
                <span style="font-size:11px;opacity:.75">
                  Powered by <strong>${softwareName}</strong> &middot; This is an automated notification. Please do not reply.
                </span>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Load notification templates from DB (or catalog), render subject + body for preview / custom sends.
 * Does not send email. Seeds DB from catalog on first use (same as notifyEmail).
 */
export async function getRenderedNotificationTemplate(
  eventKey: string,
  context: NotifyContext,
): Promise<{ subject: string; body: string; enabled: boolean } | null> {
  const appUrl = resolvePublicAppUrlForTemplates();
  const companyName = (process.env.COMPANY_NAME ?? "LDP Logistics").trim();
  let fullContext: NotifyContext = {
    company_name: companyName,
    app_url: appUrl,
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    ...context,
  };
  fullContext = await normalizeNotifyContext(fullContext);
  const catalogDef = EMAIL_EVENT_MAP[eventKey];
  let setting = await loadSetting(eventKey);
  if (!setting && catalogDef) {
    try {
      const sql = getSql();
      await sql`
        INSERT INTO email_notification_settings (event_key, enabled, subject_template, body_template)
        VALUES (
          ${eventKey},
          ${catalogDef.defaultEnabled},
          ${catalogDef.defaultSubject},
          ${catalogDef.defaultBody}
        )
        ON CONFLICT (event_key) DO NOTHING
      `;
    } catch {
      /* ignore */
    }
    setting = {
      event_key: eventKey,
      enabled: catalogDef.defaultEnabled,
      subject_template: catalogDef.defaultSubject,
      body_template: catalogDef.defaultBody,
    };
  }
  if (!setting) return null;
  const subject = renderTemplate(setting.subject_template, fullContext);
  const perCtx: NotifyContext = {
    ...fullContext,
    recipient_name: (fullContext.recipient_name as string | undefined)?.length
      ? (fullContext.recipient_name as string)
      : "",
  };
  const body = renderTemplate(setting.body_template, perCtx);
  return { subject, body, enabled: setting.enabled };
}

// ── Active employee email helpers ─────────────────────────────────────────────

/** Fetch work emails of all active employees (used for company-wide events). */
export async function getAllActiveEmployeeEmails(): Promise<Recipient[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT first_name || ' ' || last_name AS name, work_email AS email
      FROM employees
      WHERE employment_status = 'active' AND work_email IS NOT NULL AND work_email <> ''
    `) as { name: string; email: string }[];
    return rows.map((r) => ({ email: r.email, name: r.name }));
  } catch {
    return [];
  }
}

/** Map function role → cross-region scope grant that widens email recipient reach. */
const ROLE_TO_GLOBAL_SCOPE_GRANT: Record<string, string> = {
  hr: "global_hr",
  limited_hr: "global_hr",
  onboarding_specialist: "global_hr",
  admin: REGIONAL_SUPER_ADMIN_GRANT,
  it: "global_it",
  recruiter: "global_recruiter",
  hiring_manager: "global_recruiter",
  limited_recruiter: "global_recruiter",
};

/** Fetch work emails of users who have a given role (primary enum column or grant in users.roles). */
export async function getEmailsByRole(role: string): Promise<Recipient[]> {
  const tag = JSON.stringify([role]);
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT COALESCE(e.first_name || ' ' || e.last_name, u.email) AS name, u.email
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.is_active = true AND u.email IS NOT NULL AND u.email <> ''
        AND (
          u.role::text = ${role}
          OR u.roles::jsonb @> ${tag}::jsonb
        )
    `) as { name: string; email: string }[];
    return rows.map((r) => ({ email: r.email, name: r.name }));
  } catch (e: any) {
    if (e?.code === "42703") {
      try {
        const rows = (await sql`
          SELECT COALESCE(e.first_name || ' ' || e.last_name, u.email) AS name, u.email
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          WHERE u.is_active = true AND u.email IS NOT NULL AND u.email <> ''
            AND u.role::text = ${role}
        `) as { name: string; email: string }[];
        return rows.map((r) => ({ email: r.email, name: r.name }));
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Users with `role` whose regional scope includes `regionCode`:
 *   - same region as the triggering entity
 *   - matching global_* scope grant (global_hr, global_it, global_recruiter)
 *   - regional_super_admin grant
 *   - Pakistan admin (automatic super region)
 */
export async function getEmailsByRoleForRegion(
  role: string,
  regionCode: string | null | undefined,
): Promise<Recipient[]> {
  if (!regionCode) return [];
  const tag = JSON.stringify([role]);
  const globalGrant = ROLE_TO_GLOBAL_SCOPE_GRANT[role];
  const globalTag = globalGrant ? JSON.stringify([globalGrant]) : null;
  const superTag = JSON.stringify([REGIONAL_SUPER_ADMIN_GRANT]);
  const adminTag = JSON.stringify(["admin"]);
  const sql = getSql();
  try {
    const rows = globalTag
      ? (await sql`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name, u.email
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          LEFT JOIN branches bu ON bu.id = u.branch_id
          LEFT JOIN branches be ON be.id = e.branch_id
          WHERE u.is_active = true AND u.email IS NOT NULL AND u.email <> ''
            AND (u.role::text = ${role} OR u.roles::jsonb @> ${tag}::jsonb)
            AND (
              COALESCE(bu.region_code, be.region_code) = ${regionCode}
              OR u.roles::jsonb @> ${globalTag}::jsonb
              OR u.roles::jsonb @> ${superTag}::jsonb
              OR (
                (u.role::text = 'admin' OR u.roles::jsonb @> ${adminTag}::jsonb)
                AND COALESCE(bu.region_code, be.region_code) = ${SUPER_REGION_CODE}
              )
            )
        `) as { name: string; email: string }[]
      : (await sql`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name, u.email
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          LEFT JOIN branches bu ON bu.id = u.branch_id
          LEFT JOIN branches be ON be.id = e.branch_id
          WHERE u.is_active = true AND u.email IS NOT NULL AND u.email <> ''
            AND (u.role::text = ${role} OR u.roles::jsonb @> ${tag}::jsonb)
            AND (
              COALESCE(bu.region_code, be.region_code) = ${regionCode}
              OR u.roles::jsonb @> ${superTag}::jsonb
              OR (
                (u.role::text = 'admin' OR u.roles::jsonb @> ${adminTag}::jsonb)
                AND COALESCE(bu.region_code, be.region_code) = ${SUPER_REGION_CODE}
              )
            )
        `) as { name: string; email: string }[];
    return rows.map((r) => ({ email: r.email, name: r.name }));
  } catch (e: any) {
    if (e?.code === "42703") {
      try {
        const rows = (await sql`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name, u.email
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          LEFT JOIN branches bu ON bu.id = u.branch_id
          LEFT JOIN branches be ON be.id = e.branch_id
          WHERE u.is_active = true AND u.email IS NOT NULL AND u.email <> ''
            AND u.role::text = ${role}
            AND COALESCE(bu.region_code, be.region_code) = ${regionCode}
        `) as { name: string; email: string }[];
        return rows.map((r) => ({ email: r.email, name: r.name }));
      } catch {
        return [];
      }
    }
    return [];
  }
}

/** Multiple roles for one region — deduplicated. */
export async function getEmailsByRolesForRegion(
  roles: string[],
  regionCode: string | null | undefined,
): Promise<Recipient[]> {
  const results = await Promise.all(roles.map((r) => getEmailsByRoleForRegion(r, regionCode)));
  return dedupeRecipientsByEmail(results.flat());
}

/** Multiple roles across several regions — deduplicated. */
export async function getEmailsByRolesForRegions(
  roles: string[],
  regionCodes: string[],
): Promise<Recipient[]> {
  const unique = [...new Set(regionCodes.filter(Boolean))];
  if (!unique.length) return [];
  const all: Recipient[] = [];
  for (const rc of unique) {
    all.push(...(await getEmailsByRolesForRegion(roles, rc)));
  }
  return dedupeRecipientsByEmail(all);
}

/** Active employees in a single region (for company feed, etc.). */
export async function getActiveEmployeeEmailsForRegion(
  regionCode: string | null | undefined,
): Promise<Recipient[]> {
  if (!regionCode) return [];
  const regionExpr = sqlEmployeeEffectiveRegion("e", "b");
  try {
    const sql = getSql();
    const rows = (await sql(`
      SELECT TRIM(e.first_name || ' ' || e.last_name) AS name, e.work_email AS email
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.employment_status = 'active'
        AND e.work_email IS NOT NULL AND e.work_email <> ''
        AND ${regionExpr} = $1
    `, [regionCode])) as { name: string; email: string }[];
    return rows.map((r) => ({ email: r.email, name: r.name }));
  } catch {
    return [];
  }
}

/** Fetch a single employee's work email by employee row id. */
export async function getEmployeeEmail(employeeId: string): Promise<Recipient | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT first_name || ' ' || last_name AS name, work_email AS email
      FROM employees
      WHERE id = ${employeeId} AND work_email IS NOT NULL AND work_email <> ''
    `) as { name: string; email: string }[];
    const r = rows[0];
    return r ? { email: r.email, name: r.name } : null;
  } catch {
    return null;
  }
}

/**
 * Best email to reach an employee for lifecycle emails (onboarding, offboarding welcome, etc.).
 * Prefers `work_email`, then `personal_email` when work is missing — pre-hires often have no company mailbox yet.
 */
export async function getEmployeeNotificationRecipient(employeeId: string): Promise<Recipient | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        TRIM(CONCAT_WS(' ', first_name, last_name)) AS name,
        COALESCE(
          NULLIF(TRIM(work_email), ''),
          NULLIF(TRIM(personal_email), '')
        ) AS email
      FROM employees
      WHERE id = ${employeeId}
    `) as { name: string; email: string | null }[];
    const r = rows[0];
    if (!r?.email) return null;
    const name = (r.name && r.name.length > 0 ? r.name : "Employee").trim();
    return { email: r.email, name };
  } catch {
    return null;
  }
}

const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Template context keys that should show a person name, never a raw user/employee UUID. */
const ACTOR_NOTIFY_CONTEXT_KEYS = new Set([
  "doer_name",
  "granter_name",
  "organizer_name",
  "performed_by",
  "updated_by",
  "created_by",
  "assigned_by",
  "moved_by",
  "sent_by",
  "resolved_by",
  "cancelled_by",
  "initiated_by",
  "completed_by",
  "posted_by",
  "applied_by",
  "owner_name",
  "author_name",
  "mentioned_name",
  "recipient_name",
  "employee_name",
  "candidate_name",
  "reviewer_name",
  "assignee_name",
  "interviewer_name",
  "approved_by",
  "rejected_by",
]);

/** Keys whose values must stay as raw IDs/URLs for links (not resolved to display names). */
function shouldPreserveRawContextKey(key: string): boolean {
  if (key.endsWith("_url") || key.endsWith("_link") || key.endsWith("_token")) return true;
  if (key === "app_url" || key === "careers_url" || key === "portal_url" || key === "date") return true;
  if (key.endsWith("_id")) return true;
  if (key.endsWith("_number") || key.endsWith("_amount") || key.endsWith("_date")) return true;
  return false;
}

function isPersonDisplayContextKey(key: string): boolean {
  if (ACTOR_NOTIFY_CONTEXT_KEYS.has(key)) return true;
  if (key.endsWith("_name")) return true;
  if (key.endsWith("_by")) return true;
  return false;
}

/**
 * Resolve `users.id`, `employees.id`, or `candidates.id` to a display string for email templates.
 * Never returns a UUID to the template.
 */
export async function resolvePersonDisplayForEmail(actorId: string | null | undefined): Promise<string> {
  if (!actorId || typeof actorId !== "string" || !actorId.trim()) return "—";
  const id = actorId.trim();
  if (id.toLowerCase() === "system") return "System";
  if (!UUID_LIKE_RE.test(id)) return id;

  const fallback = "HR Team";
  try {
    const sql = getSql();
    const userRows = (await sql`
      SELECT
        NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), '') AS emp_name,
        NULLIF(TRIM(u.email), '') AS user_email
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = ${id}
      LIMIT 1
    `) as { emp_name: string | null; user_email: string | null }[];

    const u = userRows[0];
    if (u?.emp_name) return u.emp_name;
    if (u?.user_email) return u.user_email;

    const empRows = (await sql`
      SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') AS display
      FROM employees WHERE id = ${id}
      LIMIT 1
    `) as { display: string | null }[];
    if (empRows[0]?.display?.trim()) return empRows[0].display!.trim();

    const candRows = (await sql`
      SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') AS display
      FROM candidates WHERE id = ${id}
      LIMIT 1
    `) as { display: string | null }[];
    if (candRows[0]?.display?.trim()) return candRows[0].display!.trim();

    return fallback;
  } catch {
    return fallback;
  }
}

/** @deprecated Alias — use resolvePersonDisplayForEmail */
export async function resolveActorDisplayForEmail(actorId: string | null | undefined): Promise<string> {
  return resolvePersonDisplayForEmail(actorId);
}

/**
 * Sanitize notification template context so human-facing fields never show raw UUIDs.
 * Applied automatically in notifyEmail and getRenderedNotificationTemplate.
 */
export async function normalizeNotifyContext(context: NotifyContext): Promise<NotifyContext> {
  const out: NotifyContext = { ...context };
  await Promise.all(
    Object.keys(out).map(async (key) => {
      const v = out[key];
      if (typeof v !== "string" || !v.trim()) return;
      const trimmed = v.trim();
      if (!UUID_LIKE_RE.test(trimmed)) return;
      if (shouldPreserveRawContextKey(key)) return;
      if (!isPersonDisplayContextKey(key)) return;
      out[key] = await resolvePersonDisplayForEmail(trimmed);
    }),
  );
  return out;
}

/** @deprecated Alias — use normalizeNotifyContext */
export async function normalizeActorContextFields(context: NotifyContext): Promise<NotifyContext> {
  return normalizeNotifyContext(context);
}

/** Lowercase-email dedupe; keeps first occurrence (e.g. HR + same address as employee → one send). */
export function dedupeRecipientsByEmail(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const rec of recipients) {
    const key = (rec.email ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out;
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

/**
 * Dispatch an email notification for a given event.
 *
 * @param eventKey  - catalog key, e.g. "leave.submitted"
 * @param context   - key/value pairs for {{variable}} substitution
 * @param recipients - resolved email addresses (and optional names)
 *
 * Call this fire-and-forget:
 *   notifyEmail("leave.submitted", ctx, recipients).catch(() => {});
 */
export async function notifyEmail(
  eventKey: string,
  context: NotifyContext,
  recipients: Recipient[],
): Promise<void> {
  if (!recipients.length) return;

  // Build context defaults
  const appUrl = resolvePublicAppUrlForTemplates();
  const companyName = (process.env.COMPANY_NAME ?? "LDP Logistics").trim();
  let fullContext: NotifyContext = {
    company_name: companyName,
    app_url: appUrl,
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    ...context,
  };
  fullContext = await normalizeNotifyContext(fullContext);

  // Load setting from DB, fall back to catalog default
  const catalogDef = EMAIL_EVENT_MAP[eventKey];
  let setting = await loadSetting(eventKey);

  // If no row exists yet seed from catalog defaults (lazy init)
  if (!setting && catalogDef) {
    try {
      const sql = getSql();
      await sql`
        INSERT INTO email_notification_settings (event_key, enabled, subject_template, body_template)
        VALUES (
          ${eventKey},
          ${catalogDef.defaultEnabled},
          ${catalogDef.defaultSubject},
          ${catalogDef.defaultBody}
        )
        ON CONFLICT (event_key) DO NOTHING
      `;
    } catch {
      // ignore — we'll still use catalog defaults below
    }
    setting = {
      event_key: eventKey,
      enabled: catalogDef.defaultEnabled,
      subject_template: catalogDef.defaultSubject,
      body_template: catalogDef.defaultBody,
    };
  }

  if (!setting) return; // unknown event key — skip
  if (!setting.enabled) {
    // Log a skipped entry for the first recipient so HR can audit
    await logResult(eventKey, recipients[0].email, null, "skipped");
    return;
  }

  const subject = renderTemplate(setting.subject_template, fullContext);

  for (const recipient of recipients) {
    // Per-recipient context override (e.g. recipient_name)
    const perCtx: NotifyContext = {
      ...fullContext,
      recipient_name: recipient.name ?? "",
      // If the template uses {{employee_name}} and it is not set, fall back to recipient_name
      employee_name: (fullContext.employee_name as string | undefined)?.length
        ? (fullContext.employee_name as string)
        : (recipient.name ?? ""),
    };

    const renderedBody = renderTemplate(setting.body_template, perCtx);
    const html = await wrapInEmailFrame(renderedBody, subject, eventKey);
    const text = renderedBody;

    const from = resolveNotificationFromAddress(eventKey);
    const result = await sendEmail({
      ...(from ? { from } : {}),
      to: recipient.email,
      subject,
      html,
      text,
    });

    if (result.ok) {
      await logResult(eventKey, recipient.email, subject, "sent", undefined, { messageId: result.id });
    } else {
      console.error(`[email-notify] Failed to send ${eventKey} → ${recipient.email}: ${result.message}`);
      await logResult(eventKey, recipient.email, subject, "failed", result.message);
    }
  }
}
