/**
 * Freshteam-style timezone labels: "(GMT+05:30) Kolkata - IST"
 * Values stored in DB remain IANA ids (e.g. Asia/Kolkata).
 */

import { IANA_TIME_ZONES_FULL } from "./ianaTimeZonesFull";

/** Extra lowercase tokens so search finds zones by country / region, not only city name. */
const ZONE_SEARCH_HINTS: Partial<Record<string, string>> = {
  "Asia/Karachi": "pakistan pk",
  "Asia/Kolkata": "india in bharat",
  "Asia/Dhaka": "bangladesh",
  "Asia/Colombo": "sri lanka",
  "Asia/Kathmandu": "nepal",
  "Asia/Thimphu": "bhutan",
  "Asia/Yangon": "myanmar burma",
  "Asia/Bangkok": "thailand",
  "Asia/Singapore": "singapore",
  "Asia/Kuala_Lumpur": "malaysia",
  "Asia/Jakarta": "indonesia",
  "Asia/Manila": "philippines",
  "Asia/Ho_Chi_Minh": "vietnam",
  "Asia/Shanghai": "china prc",
  "Asia/Chongqing": "china",
  "Asia/Hong_Kong": "hong kong china",
  "Asia/Taipei": "taiwan",
  "Asia/Seoul": "south korea korea",
  "Asia/Tokyo": "japan",
  "Asia/Riyadh": "saudi arabia ksa",
  "Asia/Dubai": "uae dubai united arab emirates",
  "Asia/Muscat": "oman",
  "Asia/Bahrain": "bahrain",
  "Asia/Kuwait": "kuwait",
  "Asia/Qatar": "qatar",
  "Asia/Tehran": "iran",
  "Asia/Baghdad": "iraq",
  "Asia/Amman": "jordan",
  "Asia/Beirut": "lebanon",
  "Asia/Jerusalem": "israel palestine",
  "Asia/Damascus": "syria",
  "Europe/London": "uk united kingdom britain england gb",
  "Europe/Dublin": "ireland",
  "Europe/Paris": "france",
  "Europe/Berlin": "germany",
  "Europe/Rome": "italy",
  "Europe/Madrid": "spain",
  "Europe/Amsterdam": "netherlands holland",
  "Europe/Brussels": "belgium",
  "Europe/Zurich": "switzerland",
  "Europe/Vienna": "austria",
  "Europe/Warsaw": "poland",
  "Europe/Stockholm": "sweden",
  "Europe/Oslo": "norway",
  "Europe/Copenhagen": "denmark",
  "Europe/Helsinki": "finland",
  "Europe/Athens": "greece",
  "Europe/Lisbon": "portugal",
  "Europe/Moscow": "russia",
  "Europe/Istanbul": "turkey turkiye",
  "Africa/Cairo": "egypt",
  "Africa/Johannesburg": "south africa",
  "Africa/Lagos": "nigeria",
  "Africa/Nairobi": "kenya",
  "Australia/Sydney": "australia nsw",
  "Australia/Melbourne": "australia victoria",
  "Australia/Brisbane": "australia queensland",
  "Australia/Perth": "australia western",
  "Pacific/Auckland": "new zealand",
  "America/Sao_Paulo": "brazil",
  "America/Buenos_Aires": "argentina",
  "America/Santiago": "chile",
  "America/Bogota": "colombia",
  "America/Lima": "peru",
  "America/Mexico_City": "mexico",
  "America/Toronto": "canada",
  "America/Vancouver": "canada",
  "America/Montreal": "canada quebec",
  "America/Winnipeg": "canada",
  "America/Edmonton": "canada",
  "America/Halifax": "canada",
  "America/St_Johns": "canada newfoundland",
  "America/Regina": "canada",
  "America/Whitehorse": "canada yukon",
  "America/Yellowknife": "canada nwt",
  "America/Rainy_River": "canada",
  "America/Atikokan": "canada",
  "America/New_York": "usa united states eastern us",
  "America/Chicago": "usa united states central us",
  "America/Denver": "usa mountain us",
  "America/Los_Angeles": "usa united states pacific us",
  "America/Anchorage": "usa alaska",
  "Pacific/Honolulu": "usa hawaii",
};

const PREFIX_SEARCH_HINTS: Array<{ prefix: string; hint: string }> = [
  { prefix: "America/Argentina/", hint: "argentina" },
  { prefix: "America/Indiana/", hint: "usa united states" },
  { prefix: "America/Kentucky/", hint: "usa united states" },
  { prefix: "America/North_Dakota/", hint: "usa united states" },
];

function extraHintsForZone(iana: string): string {
  const direct = ZONE_SEARCH_HINTS[iana];
  if (direct) return direct;
  for (const { prefix, hint } of PREFIX_SEARCH_HINTS) {
    if (iana.startsWith(prefix)) return hint;
  }
  return "";
}

export function listIanaTimeZones(): string[] {
  const intl: string[] = [];
  try {
    const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) intl.push(...supported);
  } catch {
    /* ignore */
  }
  // Always union with bundled snapshot so older runtimes / embedded webviews still get the full list.
  return Array.from(new Set<string>([...IANA_TIME_ZONES_FULL, ...intl]));
}

/** City fragment shown in UI (last segment of IANA, underscores → spaces). */
export function timezoneCityLabel(iana: string | null | undefined): string {
  if (!iana?.trim()) return "UTC";
  const s = iana.trim();
  return s.split("/").pop()?.replace(/_/g, " ") ?? s;
}

export function timezoneAbbr(iana: string | null | undefined, refDate = new Date()): string {
  const tz = iana?.trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(refDate);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

/** Offset in minutes east of UTC for the given instant (matches "wall clock" in that zone vs UTC). */
function offsetMinutesEast(iana: string, refDate: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(refDate);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = n("year");
  const mo = n("month");
  const d = n("day");
  const h = n("hour");
  const mi = n("minute");
  const sec = n("second");
  const wallAsUtcMs = Date.UTC(y, mo - 1, d, h, mi, sec);
  return Math.round((wallAsUtcMs - refDate.getTime()) / 60000);
}

function gmtParenthesesFromMinutes(totalMinutes: number): string {
  const sign = totalMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `(GMT${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")})`;
}

/** Single-line label like "(GMT+05:30) Kolkata - IST". */
export function formatFreshteamStyleTimezoneLabel(iana: string | null | undefined, refDate = new Date()): string {
  const tz = iana?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(refDate);
  } catch {
    return "UTC";
  }
  const off = offsetMinutesEast(tz, refDate);
  const gmt = gmtParenthesesFromMinutes(off);
  const city = timezoneCityLabel(tz);
  const abbr = timezoneAbbr(tz, refDate);
  return `${gmt} ${city} - ${abbr}`;
}

export type TimezonePickerOption = {
  iana: string;
  label: string;
  /** For sorting — minutes east of UTC. */
  offsetMinutes: number;
  city: string;
  abbr: string;
  /** Lowercase tokens for Command search (region, country synonyms, path). */
  searchHints: string;
};

function buildSearchHints(iana: string, city: string, abbr: string, label: string): string {
  const segment = iana.includes("/") ? iana.split("/")[0] : "";
  const rest = iana.includes("/") ? iana.slice(iana.indexOf("/") + 1) : iana;
  const pathWords = rest.replace(/_/g, " ");
  const extra = extraHintsForZone(iana);
  return [
    iana,
    iana.replace(/\//g, " "),
    segment,
    pathWords,
    city,
    abbr,
    label,
    extra,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildTimezonePickerOptions(refDate = new Date()): TimezonePickerOption[] {
  const ids = listIanaTimeZones();
  const out: TimezonePickerOption[] = [];
  for (const iana of ids) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: iana }).format(refDate);
    } catch {
      continue;
    }
    const offsetMinutes = offsetMinutesEast(iana, refDate);
    const city = timezoneCityLabel(iana);
    const abbr = timezoneAbbr(iana, refDate);
    const gmt = gmtParenthesesFromMinutes(offsetMinutes);
    const label = `${gmt} ${city} - ${abbr}`;
    out.push({
      iana,
      label,
      offsetMinutes,
      city,
      abbr,
      searchHints: buildSearchHints(iana, city, abbr, label),
    });
  }
  out.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city) || a.iana.localeCompare(b.iana));
  return out;
}
