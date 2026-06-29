import { emailCtaButtonHtml, escapeHtmlAttrForEmail, escapeHtmlForEmail } from "./emailNotifications.js";

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+/gi;

function stripTrailingUrlPunctuation(url: string): string {
  return url.replace(/[),.;:!?]+$/, "");
}

function extractUrls(raw: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.match(URL_IN_TEXT_RE) ?? []) {
    const u = stripTrailingUrlPunctuation(match.trim());
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  const text = raw
    .replace(URL_IN_TEXT_RE, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, urls };
}

const LABEL_STYLE = "margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;line-height:1.4";

/**
 * Renders onsite interview location for HTML email templates: address block + Maps CTA
 * (avoids breaking table layout with long raw URLs on mobile).
 */
export function formatOnsiteLocationForEmailHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const { text, urls } = extractUrls(trimmed);
  const esc = escapeHtmlForEmail;
  const addressLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parts: string[] = [
    '<div style="margin:0;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;max-width:100%;box-sizing:border-box">',
  ];

  if (addressLines.length > 0) {
    parts.push(`<p style="${LABEL_STYLE}">Office Address:</p>`);
    parts.push(
      `<p style="margin:0${urls.length ? " 0 12px" : ""};font-size:13px;line-height:1.55;color:#334155;word-break:break-word">${addressLines.map(esc).join("<br/>")}</p>`,
    );
  }

  if (urls.length > 0) {
    const primary = urls[0];
    parts.push(`<p style="${LABEL_STYLE}${addressLines.length ? "" : " margin-top:0"}">Current Location:</p>`);
    parts.push(
      `<p style="margin:0;text-align:center;line-height:1.4">${emailCtaButtonHtml(primary, "Open in Google Maps", { backgroundColor: "#0d9488" })}</p>`,
    );
    if (urls.length > 1) {
      for (const extra of urls.slice(1)) {
        parts.push(
          `<p style="margin:8px 0 0;font-size:11px;line-height:1.45;color:#64748b;text-align:center;word-break:break-all"><a href="${escapeHtmlAttrForEmail(extra)}" style="color:#2563eb;text-decoration:underline">${esc(extra)}</a></p>`,
        );
      }
    }
  } else if (addressLines.length === 0) {
    parts.push(`<p style="${LABEL_STYLE}">Office Address:</p>`);
    parts.push(
      `<p style="margin:0;font-size:13px;line-height:1.55;color:#334155;word-break:break-word">${esc(trimmed).replace(/\n/g, "<br/>")}</p>`,
    );
  }

  parts.push("</div>");
  return parts.join("");
}

/** Wrapper inserted into interview invite email templates. */
export function interviewLocationEmailBlock(locationPlain: string): string {
  const inner = formatOnsiteLocationForEmailHtml(locationPlain);
  if (!inner) return "";
  return `<div style="margin:6px 0 0"><p style="margin:0 0 4px;font-size:13px;color:#64748b">Location</p>${inner}</div>`;
}

const LOCATION_BLOCK_RE =
  /<div style="margin:6px 0 0"><p style="margin:0 0 4px;font-size:13px;color:#64748b">Location<\/p>[\s\S]*?<\/div>/i;

const LEGACY_LOCATION_RE =
  /<p style="margin:6px 0 0;font-size:13px;color:#64748b">Location:\s*<strong[^>]*>[\s\S]*?<\/strong><\/p>/i;

/** Replaces location section in composed invite HTML before send (handles stale editor preview). */
export function replaceInterviewLocationInEmailHtml(html: string, locationPlain: string): string {
  const block = interviewLocationEmailBlock(locationPlain);
  if (!block) return html;
  if (LOCATION_BLOCK_RE.test(html)) return html.replace(LOCATION_BLOCK_RE, block);
  if (LEGACY_LOCATION_RE.test(html)) return html.replace(LEGACY_LOCATION_RE, block);
  return html;
}

const INTERVIEWERS_LINE_RE =
  /<p style="margin:(?:8px 0 0|0);font-size:13px;color:#64748b">Interviewers:\s*<strong style="color:#1e293b">[\s\S]*?<\/strong><\/p>/gi;

/** Ensures composed invite HTML lists the final interviewer panel (send-time truth). */
export function replaceInterviewersListInInviteHtml(html: string, interviewerNames: string): string {
  if (!html?.trim() || !interviewerNames.trim()) return html;
  const esc = escapeHtmlForEmail(interviewerNames.trim());
  return html.replace(INTERVIEWERS_LINE_RE, (match) => {
    const margin = match.includes("margin:8px") ? "8px 0 0" : "0";
    return `<p style="margin:${margin};font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">${esc}</strong></p>`;
  });
}
