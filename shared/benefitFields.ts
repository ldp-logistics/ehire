/** Custom field on a benefit card (limits, coverage details, etc.) */
export type BenefitFieldType = "text" | "number" | "currency" | "boolean";

export interface BenefitCustomField {
  key: string;
  label: string;
  type: BenefitFieldType;
  unit?: string;
  value: string;
}

export const BENEFIT_FIELD_TYPES: { id: BenefitFieldType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "currency", label: "Currency" },
  { id: "boolean", label: "Yes / No" },
];

/** Suggested fields per benefit category — HR can edit, remove, or add more. */
export const BENEFIT_CATEGORY_FIELD_PRESETS: Record<string, Omit<BenefitCustomField, "value">[]> = {
  medical: [
    { key: "opd_limit", label: "OPD Limit", type: "currency", unit: "PKR" },
    { key: "ipd_limit", label: "IPD Limit", type: "currency", unit: "PKR" },
    { key: "room_limit", label: "Room Limit (per day)", type: "currency", unit: "PKR" },
    { key: "maternity", label: "Maternity Cover", type: "currency", unit: "PKR" },
    { key: "dental", label: "Dental", type: "text" },
    { key: "optical", label: "Optical", type: "text" },
    { key: "network_hospitals", label: "Panel / Network", type: "text" },
  ],
  life_insurance: [
    { key: "sum_insured", label: "Sum Insured", type: "currency", unit: "PKR" },
    { key: "accidental_death", label: "Accidental Death Benefit", type: "currency", unit: "PKR" },
    { key: "critical_illness", label: "Critical Illness", type: "currency", unit: "PKR" },
    { key: "beneficiary", label: "Beneficiary", type: "text" },
  ],
  gym: [
    { key: "monthly_fee", label: "Monthly Membership", type: "currency", unit: "PKR" },
    { key: "sessions", label: "Sessions per Month", type: "number" },
    { key: "gym_location", label: "Gym / Club", type: "text" },
  ],
  transport: [
    { key: "fuel_allowance", label: "Fuel Allowance", type: "currency", unit: "PKR" },
    { key: "monthly_cap", label: "Monthly Cap", type: "currency", unit: "PKR" },
    { key: "vehicle_type", label: "Vehicle / Card Type", type: "text" },
  ],
  meal: [
    { key: "daily_allowance", label: "Daily Allowance", type: "currency", unit: "PKR" },
    { key: "monthly_cap", label: "Monthly Cap", type: "currency", unit: "PKR" },
  ],
  other: [],
};

export function getCategoryFieldPresets(category: string): BenefitCustomField[] {
  const presets = BENEFIT_CATEGORY_FIELD_PRESETS[category] ?? BENEFIT_CATEGORY_FIELD_PRESETS.other;
  return presets.map((p) => ({ ...p, value: "" }));
}

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "field";
}

export function parseBenefitCustomFields(raw: unknown): BenefitCustomField[] {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: BenefitCustomField[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = String(o.label ?? o.key ?? "").trim();
    if (!label) continue;
    let key = String(o.key ?? slugifyLabel(label)).trim();
    if (!key) key = slugifyLabel(label);
    let n = 1;
    const base = key;
    while (seen.has(key)) { key = `${base}_${n++}`; }
    seen.add(key);
    const typeRaw = String(o.type ?? "text");
    const type: BenefitFieldType = ["text", "number", "currency", "boolean"].includes(typeRaw)
      ? (typeRaw as BenefitFieldType)
      : "text";
    out.push({
      key,
      label,
      type,
      unit: o.unit != null && String(o.unit).trim() ? String(o.unit).trim() : undefined,
      value: o.value != null ? String(o.value) : "",
    });
  }
  return out.slice(0, 30);
}

export function normalizeBenefitCustomFields(raw: unknown): BenefitCustomField[] {
  return parseBenefitCustomFields(raw).map((f) => ({
    key: f.key.slice(0, 60),
    label: f.label.slice(0, 120),
    type: f.type,
    unit: f.unit?.slice(0, 30),
    value: f.value.slice(0, 500),
  }));
}

export function formatBenefitFieldValue(field: BenefitCustomField): string {
  if (field.type === "boolean") {
    const v = field.value.toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return "Yes";
    if (v === "false" || v === "no" || v === "0") return "No";
    return field.value || "—";
  }
  if (field.type === "currency" && field.value) {
    const num = Number(field.value.replace(/,/g, ""));
    const formatted = Number.isFinite(num)
      ? num.toLocaleString("en-PK")
      : field.value;
    return field.unit ? `${field.unit} ${formatted}` : formatted;
  }
  if (field.type === "number" && field.value) {
    return field.unit ? `${field.value} ${field.unit}` : field.value;
  }
  return field.value || "—";
}
