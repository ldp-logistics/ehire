import {
  parseDataUrl,
  uploadFileToSharePoint,
  isSharePointAvatarConfigured,
  getMissingSharePointEnvVars,
  getAvatarContentBySharingUrl,
} from "../../lib/sharepoint.js";
import { ValidationError } from "../../core/types/index.js";
import { AppSettingsRepository } from "./AppSettingsRepository.js";
import { memCache } from "../../lib/perf.js";
import { bustEmailBrandingCache } from "../../lib/emailNotifications.js";
import {
  ONSITE_INTERVIEW_LOCATION_MAX_LENGTH,
  ONSITE_INTERVIEW_LOCATIONS_MAX_COUNT,
} from "../../../shared/interviewOnsiteLocation.js";

const KEY_BANNER = "employee_profile_banner_url";
const KEY_EMAIL_BRANDING = "email_branding";
const KEY_ORG_IANA_TIMEZONE = "org_iana_timezone";
const KEY_INTERVIEW_ONSITE_LOCATIONS = "interview_onsite_locations";
const MAX_BYTES = 5 * 1024 * 1024;

/** HR-selectable zones for interview/meeting email placeholders (IANA → labels). */
export const ORG_IANA_TIMEZONE_PRESETS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "America/New_York", label: "US Eastern — New York (EST/EDT)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
] as const;

const ALLOWED_ORG_IANA = new Set<string>(ORG_IANA_TIMEZONE_PRESETS.map((p) => p.value));

export interface EmailBrandingDTO {
  logoUrl: string;
  logoHeight: number;
  headerBg: string;
  headerTitleColor: string;
  cardBg: string;
  contentText: string;
  footerBg: string;
  footerBorder: string;
  footerText: string;
  outerBg: string;
}

export const EMAIL_BRANDING_DEFAULTS: EmailBrandingDTO = {
  logoUrl: "",
  logoHeight: 36,
  headerBg: "#2563eb",
  headerTitleColor: "#ffffff",
  cardBg: "#ffffff",
  contentText: "#334155",
  footerBg: "#f8fafc",
  footerBorder: "#e2e8f0",
  footerText: "#94a3b8",
  outerBg: "#f4f6f8",
};

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mime.split(";")[0].trim().toLowerCase()] || "png";
}

/** Same-origin URL the browser can use in CSS/img; image bytes come from SharePoint via our proxy. */
export const EMPLOYEE_PROFILE_BANNER_IMAGE_PATH = "/api/settings/employee-profile-banner/image";

export class AppSettingsService {
  private readonly repo = new AppSettingsRepository();

  /** Public JSON payload: never expose raw SharePoint URL to the client (CSS background cannot use it reliably). */
  async getEmployeeProfileBannerDto(): Promise<{ bannerUrl: string | null; updatedAt: string | null }> {
    const entry = await this.repo.getEntry(KEY_BANNER);
    if (!entry?.value?.trim()) return { bannerUrl: null, updatedAt: null };
    return {
      bannerUrl: EMPLOYEE_PROFILE_BANNER_IMAGE_PATH,
      updatedAt: entry.updatedAt,
    };
  }

  /** Fetch bytes for GET …/image (SharePoint sharing link or data URL in DB). */
  async getEmployeeProfileBannerBinary(): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cached = memCache.get<{ buffer: Buffer; contentType: string }>("banner:image:bytes");
    if (cached) return cached;

    const raw = await this.repo.getValue(KEY_BANNER);
    if (!raw?.trim()) return null;
    const avatar = raw.trim();

    if (avatar.startsWith("data:")) {
      const parsed = parseDataUrl(avatar);
      if (!parsed) return null;
      const contentType = parsed.contentType.split(";")[0].trim() || "image/png";
      return { buffer: parsed.buffer, contentType };
    }

    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      const sp = await getAvatarContentBySharingUrl(avatar);
      if (sp) {
        memCache.set("banner:image:bytes", sp, 10 * 60 * 1000);
        return sp;
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch(avatar, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return null;
        const contentType = r.headers.get("Content-Type") || "image/png";
        const buffer = Buffer.from(await r.arrayBuffer());
        const out = { buffer, contentType };
        memCache.set("banner:image:bytes", out, 10 * 60 * 1000);
        return out;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Upload banner image to SharePoint (same drive/folder pattern as other company files)
   * and persist the sharing URL in app_settings.
   */
  async setEmployeeProfileBannerFromDataUrl(
    dataUrl: string
  ): Promise<{ bannerUrl: string | null; updatedAt: string | null }> {
    const parsed = parseDataUrl(dataUrl.trim());
    if (!parsed) throw new ValidationError("Invalid image data");
    const mime = parsed.contentType.split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) throw new ValidationError("File must be an image");
    if (parsed.buffer.length > MAX_BYTES) throw new ValidationError("Image must be 5MB or smaller");

    if (!isSharePointAvatarConfigured()) {
      throw new ValidationError(
        `SharePoint is not configured. Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID. Missing: ${getMissingSharePointEnvVars().join(", ")}`
      );
    }

    const fileName = `employee-profile-banner.${extFromMime(parsed.contentType)}`;
    const url = await uploadFileToSharePoint("CompanyBranding", fileName, parsed.buffer, mime);
    if (!url) throw new ValidationError("Failed to upload banner to SharePoint");

    await this.repo.setValue(KEY_BANNER, url);
    memCache.invalidate("banner:image");
    const entry = await this.repo.getEntry(KEY_BANNER);
    return {
      bannerUrl: EMPLOYEE_PROFILE_BANNER_IMAGE_PATH,
      updatedAt: entry?.updatedAt ?? null,
    };
  }

  async clearEmployeeProfileBanner(): Promise<void> {
    await this.repo.deleteKey(KEY_BANNER);
    memCache.invalidate("banner:image");
  }

  // ── Email branding ────────────────────────────────────────────────────────

  async getEmailBranding(): Promise<EmailBrandingDTO> {
    const cached = memCache.get<EmailBrandingDTO>("email_branding");
    if (cached) return cached;
    const raw = await this.repo.getValue(KEY_EMAIL_BRANDING);
    if (!raw) return { ...EMAIL_BRANDING_DEFAULTS };
    try {
      const parsed = JSON.parse(raw);
      const dto: EmailBrandingDTO = { ...EMAIL_BRANDING_DEFAULTS, ...parsed };
      memCache.set("email_branding", dto, 5 * 60 * 1000);
      return dto;
    } catch {
      return { ...EMAIL_BRANDING_DEFAULTS };
    }
  }

  async updateEmailBranding(patch: Partial<EmailBrandingDTO>): Promise<EmailBrandingDTO> {
    const current = await this.getEmailBranding();
    const updated: EmailBrandingDTO = { ...current, ...patch };
    if (updated.logoHeight < 16) updated.logoHeight = 16;
    if (updated.logoHeight > 80) updated.logoHeight = 80;
    await this.repo.setValue(KEY_EMAIL_BRANDING, JSON.stringify(updated));
    memCache.invalidate("email_branding");
    bustEmailBrandingCache();
    return updated;
  }

  async resetEmailBranding(): Promise<EmailBrandingDTO> {
    await this.repo.deleteKey(KEY_EMAIL_BRANDING);
    memCache.invalidate("email_branding");
    bustEmailBrandingCache();
    return { ...EMAIL_BRANDING_DEFAULTS };
  }

  async listPublicLogos(): Promise<string[]> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    // Dev reads client/public; production Docker image only ships dist/public (see index-prod.ts).
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates =
      process.env.NODE_ENV === "production"
        ? [path.resolve(baseDir, "public"), path.resolve(process.cwd(), "dist/public")]
        : [
            path.resolve(baseDir, "../../../client/public"),
            path.resolve(process.cwd(), "client/public"),
          ];

    for (const dir of candidates) {
      try {
        const files = await fs.promises.readdir(dir);
        return files
          .filter((f) => /\.(png|jpg|jpeg|svg|webp)$/i.test(f))
          .map((f) => `/${f}`);
      } catch {
        continue;
      }
    }
    return [];
  }

  // ── Onsite interview locations ───────────────────────────────────────────

  async getInterviewOnsiteLocations(): Promise<string[]> {
    const raw = await this.repo.getValue(KEY_INTERVIEW_ONSITE_LOCATIONS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      return [];
    } catch {
      return [];
    }
  }

  async setInterviewOnsiteLocations(locations: string[]): Promise<string[]> {
    const cleaned = locations
      .filter((x) => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim().slice(0, ONSITE_INTERVIEW_LOCATION_MAX_LENGTH))
      .slice(0, ONSITE_INTERVIEW_LOCATIONS_MAX_COUNT);
    await this.repo.setValue(KEY_INTERVIEW_ONSITE_LOCATIONS, JSON.stringify(cleaned));
    return cleaned;
  }

  // ── Org timezone (email interview/meeting placeholders) ───────────────────

  /** Resolved IANA zone for `buildInterviewScheduleTimeFields` / `buildMeetingTimeFields`. */
  async getEffectiveOrgIanaTimezone(): Promise<string> {
    const cached = memCache.get<string>("org_iana:tz");
    if (cached) return cached;
    const raw = (await this.repo.getValue(KEY_ORG_IANA_TIMEZONE))?.trim();
    const env = (process.env.DEFAULT_TIMEZONE ?? "").trim();
    let chosen: string = "Asia/Karachi";
    if (raw && ALLOWED_ORG_IANA.has(raw)) chosen = raw;
    else if (env && ALLOWED_ORG_IANA.has(env)) chosen = env;
    memCache.set("org_iana:tz", chosen, 60_000);
    return chosen;
  }

}
