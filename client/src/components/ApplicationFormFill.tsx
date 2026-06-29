/**
 * Renders a job application form for data entry (career page, HR manual add, link existing applicant).
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, Plus, Trash2, Briefcase, GraduationCap } from "lucide-react";
import type { FormConfig, FormField, FormSection } from "@/components/ApplicationFormBuilderCore";

export const APPLICATION_FORM_EMPTY: Record<string, string> = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  middleName: "",
  personalEmail: "",
  dateOfBirth: "",
  gender: "",
  maritalStatus: "",
  bloodGroup: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  currentCompany: "",
  currentTitle: "",
  experienceYears: "",
  expectedSalary: "",
  salaryCurrency: "AED",
  linkedinUrl: "",
  coverLetter: "",
};

export type ApplicationFormFillMode = "full" | "customOnly";

export function resetApplicationFormState(): {
  form: Record<string, string>;
  customAnswers: Record<string, string>;
  repeatableEntries: Record<string, Record<string, string>[]>;
  resumeData: null;
} {
  return {
    form: { ...APPLICATION_FORM_EMPTY },
    customAnswers: {},
    repeatableEntries: {},
    resumeData: null,
  };
}

/** Job-specific custom fields + repeatable sections (for linking an existing candidate). */
export function filterFormConfigForCustomOnly(config: FormConfig): FormConfig {
  const sections: FormSection[] = [];
  for (const section of config.sections) {
    if (section.repeatable) {
      sections.push(section);
      continue;
    }
    const customFields = section.fields.filter((f) => !f.systemKey);
    if (customFields.length === 0) continue;
    sections.push({ ...section, fields: customFields });
  }
  return { sections };
}

function sectionVisible(section: FormSection, mode: ApplicationFormFillMode): boolean {
  if (mode === "full") return true;
  if (section.repeatable) return true;
  return section.fields.some((f) => !f.systemKey);
}

function fieldVisible(field: FormField, mode: ApplicationFormFillMode): boolean {
  if (mode === "full") return true;
  return !field.systemKey;
}

export function validateApplicationFormFill(
  formConfig: FormConfig | null,
  form: Record<string, string>,
  customAnswers: Record<string, string>,
  repeatableEntries: Record<string, Record<string, string>[]>,
  resumeData: { url: string; filename: string } | null,
  options: { mode: ApplicationFormFillMode; requireResume?: boolean },
): string | null {
  const { mode, requireResume = mode === "full" } = options;

  if (formConfig) {
    for (const section of formConfig.sections) {
      if (!sectionVisible(section, mode)) continue;

      if (section.repeatable) {
        const entries = repeatableEntries[section.id] ?? [];
        for (let i = 0; i < entries.length; i++) {
          for (const field of section.fields) {
            if (!field.required) continue;
            const val = entries[i][field.id] ?? "";
            if (!String(val).trim()) {
              return `${field.label} is required in ${section.title} entry ${i + 1}`;
            }
          }
        }
        continue;
      }

      for (const field of section.fields) {
        if (!fieldVisible(field, mode)) continue;
        if (!field.required) continue;
        if (field.type === "file") {
          if (requireResume && !resumeData?.url) return `${field.label} is required`;
          continue;
        }
        if (field.systemKey) {
          const val = form[field.systemKey] ?? "";
          if (!String(val).trim()) return `${field.label} is required`;
        } else {
          const val = customAnswers[field.id] ?? "";
          if (!String(val).trim()) return `${field.label} is required`;
        }
      }
    }
    return null;
  }

  if (mode === "customOnly") return null;
  if (!form.firstName?.trim() || !form.lastName?.trim() || !form.email?.trim()) {
    return "First name, last name, and email are required";
  }
  if (requireResume && !resumeData?.url) return "Resume is required";
  return null;
}

export function buildCandidatePayloadFromForm(
  form: Record<string, string>,
  resumeData: { url: string; filename: string } | null,
  source: string,
  notes?: string,
) {
  return {
    firstName: form.firstName?.trim() || "",
    lastName: form.lastName?.trim() || "",
    email: form.email?.trim() || "",
    phone: form.phone?.trim() || undefined,
    middleName: form.middleName?.trim() || undefined,
    personalEmail: form.personalEmail?.trim() || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    gender: form.gender || undefined,
    maritalStatus: form.maritalStatus || undefined,
    bloodGroup: form.bloodGroup || undefined,
    street: form.street?.trim() || undefined,
    city: form.city?.trim() || undefined,
    state: form.state?.trim() || undefined,
    zipCode: form.zipCode?.trim() || undefined,
    country: form.country?.trim() || undefined,
    linkedinUrl: form.linkedinUrl?.trim() || undefined,
    currentCompany: form.currentCompany?.trim() || undefined,
    currentTitle: form.currentTitle?.trim() || undefined,
    experienceYears: form.experienceYears?.trim() ? parseInt(form.experienceYears, 10) : undefined,
    expectedSalary: form.expectedSalary?.trim() ? parseFloat(form.expectedSalary) : undefined,
    salaryCurrency: form.salaryCurrency?.trim() || undefined,
    resumeUrl: resumeData?.url ?? undefined,
    resumeFilename: resumeData?.filename ?? undefined,
    source,
    notes: notes?.trim() || undefined,
  };
}

export function buildCustomAnswersPayload(
  customAnswers: Record<string, string>,
  repeatableEntries: Record<string, Record<string, string>[]>,
): Record<string, unknown> {
  const repeatablePayload = Object.fromEntries(
    Object.entries(repeatableEntries).filter(([, entries]) => entries.length > 0),
  );
  return { ...customAnswers, ...repeatablePayload };
}

export function getCoverLetterFromForm(form: Record<string, string>): string | undefined {
  const v = form.coverLetter?.trim();
  return v || undefined;
}

function DynamicField({
  field,
  form,
  customAnswers,
  resumeData,
  onFormChange,
  onCustomChange,
  onResumeChange,
  onResumeClear,
}: {
  field: FormField;
  form: Record<string, string>;
  customAnswers: Record<string, string>;
  resumeData: { url: string; filename: string } | null;
  onFormChange: (key: string, val: string) => void;
  onCustomChange: (id: string, val: string) => void;
  onResumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResumeClear: () => void;
}) {
  const isSystem = !!field.systemKey;
  const val = isSystem ? (form[field.systemKey!] ?? "") : (customAnswers[field.id] ?? "");
  const onChange = isSystem
    ? (v: string) => onFormChange(field.systemKey!, v)
    : (v: string) => onCustomChange(field.id, v);

  const labelEl = (
    <Label className="text-sm">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );

  if (field.type === "file") {
    return (
      <div className="space-y-2">
        {labelEl}
        <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-primary/40 transition-colors">
          {resumeData ? (
            <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{resumeData.filename}</span>
              <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={onResumeClear}>
                Remove
              </Button>
            </div>
          ) : (
            <label className="cursor-pointer block">
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
              <p className="text-sm text-muted-foreground">Click to upload (PDF, max 5MB)</p>
              <input type="file" accept=".pdf,application/pdf,.doc,.docx" className="hidden" onChange={onResumeChange} />
            </label>
          )}
        </div>
      </div>
    );
  }

  if (field.type === "textarea" || field.systemKey === "coverLetter") {
    return (
      <div className="space-y-2">
        {labelEl}
        <Textarea value={val} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder ?? ""} />
      </div>
    );
  }

  if (field.type === "select" && field.options?.length) {
    return (
      <div className="space-y-2">
        {labelEl}
        <Select value={val || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || "Select…"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={val === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          className="rounded border-input h-4 w-4"
        />
        <span className="text-sm">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </span>
      </label>
    );
  }

  const inputType = field.type === "phone" ? "tel" : field.type === "url" ? "url" : field.type;
  return (
    <div className="space-y-2">
      {labelEl}
      <Input
        type={inputType}
        value={val}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
      />
    </div>
  );
}

function RepeatableSectionBlock({
  section,
  entries,
  onChange,
}: {
  section: FormSection;
  entries: Record<string, string>[];
  onChange: (entries: Record<string, string>[]) => void;
}) {
  const addEntry = () => onChange([...entries, {}]);
  const removeEntry = (idx: number) => onChange(entries.filter((_, i) => i !== idx));
  const setField = (idx: number, fieldId: string, val: string) => {
    const next = [...entries];
    next[idx] = { ...next[idx], [fieldId]: val };
    onChange(next);
  };

  const sectionIcon =
    section.templateKey === "employment_history" ? (
      <Briefcase className="h-4 w-4 text-primary" />
    ) : (
      <GraduationCap className="h-4 w-4 text-primary" />
    );

  return (
    <div>
      <div className="flex items-center gap-2 border-t pt-4 mb-3">
        {sectionIcon}
        <p className="text-sm font-semibold">{section.title}</p>
      </div>

      {entries.map((entry, idx) => {
        const currentlyKey = section.fields.find(
          (f) => f.type === "checkbox" && (f.label.toLowerCase().includes("currently") || f.label.toLowerCase().includes("present")),
        )?.id;
        const isCurrent = currentlyKey ? entry[currentlyKey] === "true" : false;

        return (
          <div key={idx} className="relative rounded-lg border bg-muted/30 p-4 mb-3 space-y-3">
            <button
              type="button"
              className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => removeEntry(idx)}
              aria-label="Remove entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {section.fields.map((field) => {
              const val = entry[field.id] ?? "";
              const isToField = field.label.toLowerCase() === "to" || field.label.toLowerCase() === "end";

              if (field.type === "checkbox") {
                return (
                  <label key={field.id} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={val === "true"}
                      onChange={(e) => setField(idx, field.id, e.target.checked ? "true" : "")}
                      className="rounded border-input h-4 w-4"
                    />
                    <span className="text-sm">{field.label}</span>
                  </label>
                );
              }

              if (field.type === "textarea") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Textarea
                      value={val}
                      onChange={(e) => setField(idx, field.id, e.target.value)}
                      rows={3}
                      placeholder={field.placeholder ?? ""}
                    />
                  </div>
                );
              }

              if (field.type === "date") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && !isCurrent && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      type="date"
                      value={val}
                      disabled={isToField && isCurrent}
                      onChange={(e) => setField(idx, field.id, e.target.value)}
                    />
                  </div>
                );
              }

              return (
                <div key={field.id} className="space-y-1.5">
                  <Label className="text-sm">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={val}
                    onChange={(e) => setField(idx, field.id, e.target.value)}
                    placeholder={field.placeholder ?? ""}
                  />
                </div>
              );
            })}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addEntry}>
        <Plus className="h-4 w-4" />
        Add {section.title.replace(/ies$/, "y").replace(/s$/, "")}
      </Button>
    </div>
  );
}

export function ApplicationFormFill({
  formConfig,
  mode,
  form,
  customAnswers,
  repeatableEntries,
  resumeData,
  onFormChange,
  onCustomChange,
  onRepeatableChange,
  onResumeChange,
  onResumeClear,
  requireResume,
}: {
  formConfig: FormConfig | null;
  mode: ApplicationFormFillMode;
  form: Record<string, string>;
  customAnswers: Record<string, string>;
  repeatableEntries: Record<string, Record<string, string>[]>;
  resumeData: { url: string; filename: string } | null;
  onFormChange: (key: string, val: string) => void;
  onCustomChange: (id: string, val: string) => void;
  onRepeatableChange: (sectionId: string, entries: Record<string, string>[]) => void;
  onResumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResumeClear: () => void;
  requireResume?: boolean;
}) {
  const effectiveConfig =
    formConfig && mode === "customOnly" ? filterFormConfigForCustomOnly(formConfig) : formConfig;

  const handleResumeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = "";
      onResumeChange(e);
      return;
    }
    onResumeChange(e);
    e.target.value = "";
  };

  if (effectiveConfig && effectiveConfig.sections.length > 0) {
    return (
      <div className="space-y-5">
        {effectiveConfig.sections.map((section) => {
          if (!sectionVisible(section, mode)) return null;

          if (section.repeatable) {
            return (
              <RepeatableSectionBlock
                key={section.id}
                section={section}
                entries={repeatableEntries[section.id] ?? []}
                onChange={(entries) => onRepeatableChange(section.id, entries)}
              />
            );
          }

          const visibleFields = section.fields.filter((f) => fieldVisible(f, mode));
          if (visibleFields.length === 0) return null;

          return (
            <div key={section.id} className="space-y-4">
              {!section.system && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold">{section.title}</p>
                  {section.description && <p className="text-xs text-muted-foreground mt-1">{section.description}</p>}
                </div>
              )}
              {visibleFields.map((field) => (
                <DynamicField
                  key={field.id}
                  field={field}
                  form={form}
                  customAnswers={customAnswers}
                  resumeData={resumeData}
                  onFormChange={onFormChange}
                  onCustomChange={onCustomChange}
                  onResumeChange={handleResumeFile}
                  onResumeClear={onResumeClear}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === "customOnly") {
    return <p className="text-sm text-muted-foreground py-2">No job-specific questions for this role.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>First name *</Label>
          <Input value={form.firstName ?? ""} onChange={(e) => onFormChange("firstName", e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Last name *</Label>
          <Input value={form.lastName ?? ""} onChange={(e) => onFormChange("lastName", e.target.value)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Email *</Label>
        <Input type="email" value={form.email ?? ""} onChange={(e) => onFormChange("email", e.target.value)} className="mt-1" />
      </div>
      {requireResume !== false && (
        <DynamicField
          field={{
            id: "resume",
            type: "file",
            label: "Resume / CV",
            required: true,
            system: true,
            systemKey: "resume",
          }}
          form={form}
          customAnswers={customAnswers}
          resumeData={resumeData}
          onFormChange={onFormChange}
          onCustomChange={onCustomChange}
          onResumeChange={handleResumeFile}
          onResumeClear={onResumeClear}
        />
      )}
    </div>
  );
}
