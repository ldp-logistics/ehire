/**
 * Canonical merge field names for offer letters — same keys for:
 * - DOCX templates: {{applicant.name}}, {{job.title}}, …
 * - AcroForm PDF templates: form field names must match these strings exactly (including dots).
 *
 * Signature / date placeholders are DOCX-only (markers replaced at e-sign); PDF uses overlay for signature.
 */

/** Keys that receive normal text from offer/candidate/job data (excludes e-sign marker fields). */
export const OFFER_MERGE_TEXT_FIELD_KEYS = [
  "applicant.name",
  "applicant.first_name",
  "applicant.last_name",
  "applicant.email",
  "offer.job_title",
  "offer.department",
  "offer.salary",
  "offer.pay_rate_value",
  "offer.currency",
  "offer.start_date",
  "offer.effective_date",
  "offer.employment_type",
  "offer.location",
  "offer.terms",
  "offer.created_at",
  "offer.date_of_joining",
  "offer.pay_method",
  "employee_portal.company_name",
  "company.name",
  "company_name",
  "job.title",
  "job.department",
  "job.location",
  "candidate.name",
  "candidate.first_name",
  "candidate.last_name",
  "candidate.email",
] as const;

export type OfferMergeTextFieldKey = (typeof OFFER_MERGE_TEXT_FIELD_KEYS)[number];

/** Alias for PDF tooling — same names as DOCX merge placeholders (without {{ }}). */
export const OFFER_PDF_FIELD_NAMES = OFFER_MERGE_TEXT_FIELD_KEYS;

/**
 * Build string values for all merge fields from a row like getOfferFullDetails / getOfferByToken.
 * Used by RecruitmentService (DOCX merge) and pdfFormService (PDF AcroForm fill).
 */
export function buildOfferMergeStringsFromDetails(d: Record<string, unknown>): Record<OfferMergeTextFieldKey, string> {
  const str = (v: unknown): string => (v != null ? String(v) : "");

  const salary =
    d.salary != null && d.salary !== ""
      ? Number(d.salary).toLocaleString("en-US")
      : "";

  const startDate = d.start_date
    ? new Date(str(d.start_date)).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const companyName = str(
    (typeof process !== "undefined" && process.env?.COMPANY_NAME) || "LDP Logistics",
  ).trim();

  const candidateName = `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim();

  const formatGb = (dt: Date) =>
    dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const createdAt = d.offer_created_at
    ? formatGb(new Date(str(d.offer_created_at)))
    : d.created_at
      ? formatGb(new Date(str(d.created_at)))
      : formatGb(new Date());

  return {
    "applicant.name": candidateName,
    "applicant.first_name": str(d.first_name),
    "applicant.last_name": str(d.last_name),
    "applicant.email": str(d.candidate_email),
    "offer.job_title": str(d.job_title ?? d.job_posting_title),
    "offer.department": str(d.department ?? d.job_posting_department),
    "offer.salary": salary,
    "offer.pay_rate_value": salary,
    "offer.currency": str(d.salary_currency),
    "offer.start_date": startDate,
    "offer.effective_date": startDate,
    "offer.employment_type": str(d.employment_type).replace(/_/g, " "),
    "offer.location": str(d.job_location),
    "offer.terms": str(d.terms),
    "offer.created_at": createdAt,
    "offer.date_of_joining": startDate,
    "offer.pay_method": str(d.pay_method) || "bank transfer",
    "employee_portal.company_name": companyName,
    "company.name": companyName,
    company_name: companyName,
    "job.title": str(d.job_title ?? d.job_posting_title),
    "job.department": str(d.department ?? d.job_posting_department),
    "job.location": str(d.job_location),
    "candidate.name": candidateName,
    "candidate.first_name": str(d.first_name),
    "candidate.last_name": str(d.last_name),
    "candidate.email": str(d.candidate_email),
  };
}
