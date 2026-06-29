/**
 * Resolve an employee's effective region in raw SQL: branch.region_code first,
 * then location/country heuristics (aligned with branches.region_code in DB).
 */
export function sqlEmployeeEffectiveRegion(eAlias = "e", bAlias = "b"): string {
  return `COALESCE(
    ${bAlias}.region_code,
    ${sqlLocationOnlyRegion(`${eAlias}.location`, `${eAlias}.country`)}
  )`;
}

/** Location/country → region (jobs, employees without branch). Order matters. */
export function sqlLocationOnlyRegion(locationExpr: string, countryExpr?: string): string {
  const country = countryExpr ?? "NULL";
  return `CASE
      WHEN ${locationExpr} ILIKE '%ashok vihar%' THEN 'IN-N'
      WHEN ${locationExpr} ILIKE '%moti nagar%' THEN 'IN-S'
      WHEN ${locationExpr} ILIKE '%india remote%' THEN 'IN-S'
      WHEN ${locationExpr} ILIKE '%new delhi%' AND ${locationExpr} NOT ILIKE '%ashok%' THEN 'IN-S'
      WHEN ${locationExpr} ILIKE '%karachi%' OR ${locationExpr} ILIKE '%PK Karachi%' THEN 'PK'
      WHEN ${locationExpr} ILIKE '%pakistan remote%' OR ${locationExpr} ILIKE '%uae remote%' THEN 'PK'
      WHEN ${locationExpr} ILIKE '%washington rd%' OR ${locationExpr} ILIKE '%sayreville%' OR ${locationExpr} ILIKE '%US NJ%' THEN 'US'
      WHEN ${locationExpr} ILIKE '%us remote%' THEN 'US'
      WHEN ${country} ILIKE 'PK' OR ${country} ILIKE '%pakistan%' THEN 'PK'
      WHEN ${country} ILIKE 'US' OR ${country} ILIKE '%united states%' THEN 'US'
      WHEN ${country} ILIKE 'IN' AND ${locationExpr} ILIKE '%ashok vihar%' THEN 'IN-N'
      WHEN ${country} ILIKE 'IN' THEN 'IN-S'
    END`;
}

export type LocationRegionCode = "PK" | "US" | "IN-N" | "IN-S";

/** TypeScript mirror of sqlLocationOnlyRegion for job create/update. */
export function inferRegionFromLocationString(location: string | null | undefined): LocationRegionCode | null {
  const loc = (location ?? "").toLowerCase();
  if (!loc.trim()) return null;
  if (loc.includes("ashok vihar")) return "IN-N";
  if (loc.includes("moti nagar")) return "IN-S";
  if (loc.includes("india remote")) return "IN-S";
  if (loc.includes("new delhi") && !loc.includes("ashok")) return "IN-S";
  if (loc.includes("karachi") || loc.includes("pk karachi")) return "PK";
  if (loc.includes("pakistan remote") || loc.includes("uae remote")) return "PK";
  if (loc.includes("washington rd") || loc.includes("sayreville") || loc.includes("us nj")) return "US";
  if (loc.includes("us remote")) return "US";
  return null;
}

/** Append WHERE fragment: effective employee region = ANY(regions). Requires branches LEFT JOIN. */
export function appendEffectiveRegionFilter(
  regions: string[] | null | undefined,
  eAlias: string,
  bAlias: string,
  conds: string[],
  params: unknown[],
): void {
  if (regions == null) return;
  if (regions.length === 0) {
    conds.push("1=0");
    return;
  }
  params.push(regions);
  conds.push(`${sqlEmployeeEffectiveRegion(eAlias, bAlias)} = ANY($${params.length})`);
}
