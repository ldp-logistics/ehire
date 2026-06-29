import type { FormConfig, FormField, FormSection } from "@/components/ApplicationFormBuilderCore";
import { formatLeaveDisplayDate } from "@/lib/dateUtils";

export type ApplicationDisplayScope = "full" | "application";

export const SYSTEM_KEY_TO_CANDIDATE: Record<string, string> = {
  firstName: "first_name",
  middleName: "middle_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  personalEmail: "personal_email",
  dateOfBirth: "date_of_birth",
  gender: "gender",
  maritalStatus: "marital_status",
  bloodGroup: "blood_group",
  street: "street",
  city: "city",
  state: "state",
  country: "country",
  zipCode: "zip_code",
  currentCompany: "current_company",
  currentTitle: "current_title",
  experienceYears: "experience_years",
  expectedSalary: "expected_salary",
  salaryCurrency: "salary_currency",
  linkedinUrl: "linkedin_url",
};

export type DisplayRow = {
  label: string;
  value: string;
  href?: string;
  multiline?: boolean;
};

export type DisplaySection = {
  id: string;
  title: string;
  templateKey?: string;
  repeatable?: boolean;
  rows: DisplayRow[];
  entries?: DisplayRow[][];
};

export function formatFormFieldValue(field: FormField, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "" || raw === false) return null;
  if (field.type === "checkbox") return raw === true || raw === "true" ? "Yes" : null;
  if (field.type === "date" && typeof raw === "string") {
    const formatted = formatLeaveDisplayDate(raw, null, null);
    if (formatted !== "—") return formatted;
  }
  if (field.systemKey === "expectedSalary" && (typeof raw === "number" || typeof raw === "string")) {
    const n = Number(raw);
    return Number.isFinite(n) ? n.toLocaleString() : String(raw);
  }
  if (field.type === "number" && typeof raw === "number") return String(raw);
  return String(raw);
}

export function resolveSystemFieldRaw(
  field: FormField,
  candidate: Record<string, unknown> | null | undefined,
  application: { cover_letter?: string | null } | null | undefined,
): unknown {
  if (field.systemKey === "coverLetter") return application?.cover_letter;
  if (field.systemKey === "resume") {
    if (candidate?.resume_filename) return candidate.resume_filename;
    if (candidate?.resume_url || candidate?.has_resume) return "Resume on file";
    return null;
  }
  const col = field.systemKey ? SYSTEM_KEY_TO_CANDIDATE[field.systemKey] : null;
  if (!col || !candidate) return null;
  return candidate[col];
}

function rowForField(
  field: FormField,
  raw: unknown,
  resumeHref?: string,
): DisplayRow | null {
  const display = formatFormFieldValue(field, raw);
  if (!display) return null;

  if (field.systemKey === "resume" && resumeHref) {
    return { label: field.label, value: display, href: resumeHref };
  }
  if (field.systemKey === "linkedinUrl" && typeof raw === "string" && raw.trim()) {
    return { label: field.label, value: display, href: raw.trim() };
  }
  if ((field.systemKey === "email" || field.systemKey === "personalEmail") && typeof raw === "string" && raw.trim()) {
    return { label: field.label, value: display, href: `mailto:${raw.trim()}` };
  }
  if (field.type === "textarea" || field.systemKey === "coverLetter") {
    return { label: field.label, value: display, multiline: true };
  }
  return { label: field.label, value: display };
}

/** Profile-level repeatable blocks — shown on Overview, not repeated per job on Applications tab. */
export function isProfileRepeatableSection(section: FormSection): boolean {
  return Boolean(
    section.repeatable &&
    (section.templateKey === "employment_history" || section.templateKey === "education"),
  );
}

function shouldIncludeSection(section: FormSection, scope: ApplicationDisplayScope): boolean {
  if (scope === "full") return true;
  if (isProfileRepeatableSection(section)) return false;
  return true;
}

function sectionDisplayTitle(section: FormSection, scope: ApplicationDisplayScope): string {
  if (scope === "application" && section.system) return "Job-specific responses";
  return section.title || "Application details";
}

function shouldIncludeField(field: FormField, scope: ApplicationDisplayScope): boolean {
  if (scope === "full") return true;
  if (field.systemKey && field.systemKey !== "coverLetter") return false;
  return true;
}

function resolveFieldRaw(
  field: FormField,
  scope: ApplicationDisplayScope,
  candidate: Record<string, unknown> | null | undefined,
  customAnswers: Record<string, unknown> | null | undefined,
  coverLetter: string | null | undefined,
): unknown {
  if (field.systemKey) {
    if (scope === "application" && field.systemKey !== "coverLetter") return null;
    return resolveSystemFieldRaw(field, candidate, { cover_letter: coverLetter });
  }
  return customAnswers?.[field.id];
}

export function buildDisplaySections(
  formConfig: FormConfig | null | undefined,
  candidate: Record<string, unknown> | null | undefined,
  application: {
    customAnswers?: Record<string, unknown> | null;
    coverLetter?: string | null;
    referralSource?: string | null;
  },
  resumeHref?: string,
  scope: ApplicationDisplayScope = "full",
): DisplaySection[] {
  const { customAnswers, coverLetter, referralSource } = application;
  const sections: DisplaySection[] = [];

  if (formConfig?.sections?.length) {
    for (const section of formConfig.sections) {
      if (!shouldIncludeSection(section, scope)) continue;

      if (section.repeatable) {
        const entries = (customAnswers?.[section.id] as Record<string, unknown>[] | undefined) ?? [];
        if (entries.length === 0) continue;
        const entryRows = entries.map((entry) =>
          section.fields
            .map((field) => {
              const raw = entry[field.id];
              const display = formatFormFieldValue(field, raw);
              return display ? ({ label: field.label, value: display, multiline: field.type === "textarea" } as DisplayRow) : null;
            })
            .filter((r): r is DisplayRow => r != null),
        );
        if (entryRows.some((e) => e.length > 0)) {
          sections.push({
            id: section.id,
            title: sectionDisplayTitle(section, scope),
            templateKey: section.templateKey,
            repeatable: true,
            rows: [],
            entries: entryRows,
          });
        }
        continue;
      }

      const rows: DisplayRow[] = [];
      for (const field of section.fields) {
        if (!shouldIncludeField(field, scope)) continue;
        const raw = resolveFieldRaw(field, scope, candidate, customAnswers ?? null, coverLetter);
        const row = rowForField(field, raw, resumeHref);
        if (row) rows.push(row);
      }
      if (rows.length > 0) {
        sections.push({
          id: section.id,
          title: sectionDisplayTitle(section, scope),
          rows,
        });
      }
    }
  } else if (scope === "full") {
    if (coverLetter?.trim()) {
      sections.push({
        id: "cover_letter",
        title: "Cover Letter",
        rows: [{ label: "Cover Letter", value: coverLetter.trim(), multiline: true }],
      });
    }
    if (customAnswers) {
      const flatRows: DisplayRow[] = [];
      for (const [key, value] of Object.entries(customAnswers)) {
        if (Array.isArray(value)) continue;
        if (value !== null && value !== undefined && value !== "") {
          flatRows.push({
            label: key.replace(/_/g, " "),
            value: value === true || value === "true" ? "Yes" : String(value),
          });
        }
      }
      if (flatRows.length > 0) {
        sections.push({ id: "custom", title: "Additional answers", rows: flatRows });
      }
      for (const [key, value] of Object.entries(customAnswers)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        const first = value[0] as Record<string, unknown>;
        const entryRows = (value as Record<string, unknown>[]).map((entry) =>
          Object.entries(entry)
            .map(([fid, raw]) => {
              if (raw === undefined || raw === null || raw === "" || raw === false) return null;
              const display =
                raw === true || raw === "true"
                  ? "Yes"
                  : String(raw);
              return {
                label: fid.replace(/tpl_\w+_/g, "").replace(/_/g, " "),
                value: display,
              };
            })
            .filter((r): r is DisplayRow => r != null),
        );
        sections.push({
          id: key,
          title: key.replace(/_/g, " "),
          repeatable: true,
          rows: [],
          entries: entryRows,
        });
      }
    }
  } else {
    if (coverLetter?.trim()) {
      sections.push({
        id: "cover_letter",
        title: "Cover Letter",
        rows: [{ label: "Cover Letter", value: coverLetter.trim(), multiline: true }],
      });
    }
    if (customAnswers) {
      const flatRows: DisplayRow[] = [];
      for (const [key, value] of Object.entries(customAnswers)) {
        if (Array.isArray(value)) continue;
        if (value !== null && value !== undefined && value !== "") {
          flatRows.push({
            label: key.replace(/_/g, " "),
            value: value === true || value === "true" ? "Yes" : String(value),
          });
        }
      }
      if (flatRows.length > 0) {
        sections.push({ id: "custom", title: "Job-specific answers", rows: flatRows });
      }
    }
  }

  if (referralSource?.trim()) {
    sections.push({
      id: "referral",
      title: scope === "application" ? "How they applied" : "Application source",
      rows: [
        {
          label: "Applied via",
          value: referralSource.trim().replace(/_/g, " "),
        },
      ],
    });
  }

  if (scope === "application" && coverLetter?.trim() && !sections.some((s) => s.id === "cover_letter" || s.rows.some((r) => r.label.toLowerCase().includes("cover")))) {
    sections.unshift({
      id: "cover_letter",
      title: "Cover Letter",
      rows: [{ label: "Cover Letter", value: coverLetter.trim(), multiline: true }],
    });
  }

  return sections;
}
