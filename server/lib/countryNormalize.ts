/** Canonical ISO 3166-1 alpha-2 for org holiday matching and payroll consistency. */

const NAME_TO_ISO: Record<string, string> = {
  PAKISTAN: "PK",
  INDIA: "IN",
  "UNITED STATES": "US",
  USA: "US",
  "UNITED KINGDOM": "GB",
  UK: "GB",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  CANADA: "CA",
  AUSTRALIA: "AU",
  GERMANY: "DE",
  FRANCE: "FR",
  BANGLADESH: "BD",
  NEPAL: "NP",
  SRI_LANKA: "LK",
  "SRI LANKA": "LK",
};

/**
 * Normalize free-text country (or 2-letter code) to ISO alpha-2, or null if unknown.
 */
export function normalizeCountryToIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const key = t.toUpperCase().replace(/\s+/g, " ").replace(/,/g, "");
  const mapped = NAME_TO_ISO[key];
  if (mapped) return mapped;
  const underscored = key.replace(/ /g, "_");
  return NAME_TO_ISO[underscored] ?? null;
}
