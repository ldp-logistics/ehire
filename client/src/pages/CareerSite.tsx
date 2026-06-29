import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin,
  Clock,
  CalendarDays,
  ArrowRight,
  Briefcase,
  Search,
  Upload,
  FileText,
  Menu,
  Truck,
  MapPin as LocationIcon,
  Plus,
  Trash2,
  GraduationCap,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { FormConfig, FormField } from "@/pages/settings/ApplicationFormBuilderPage";
import { toast } from "sonner";
import { sanitizeJobHtml, isHtmlContent } from "@/lib/utils";
import { LOGO_DARK, LOGO_LIGHT } from "@/lib/logo";
import { CAREERS_LOGO, CAREERS_LOGO_FOOTER, CAREERS_TIA_BADGE } from "@/lib/careersLogo";

// Inject Overpass font (same as ldplogistics.com / careers/index.html) + responsive footer grid
if (typeof document !== "undefined" && !document.getElementById("ldp-overpass-font")) {
  const link = document.createElement("link");
  link.id = "ldp-overpass-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Overpass:wght@300;400;600;700;800;900&family=Overpass+Mono:wght@400;600;700&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.textContent = `
    #careers-page, #careers-page * { font-family: 'Overpass', sans-serif; }
    #careers-page input, #careers-page button { font-family: 'Overpass', sans-serif; }
    #careers-page input::placeholder { color: #84868B; }
    #careers-page .text-\[10px\] { font-family: 'Overpass Mono', monospace; }
    @media (max-width: 820px) {
      .grid-footer-cols { grid-template-columns: 1fr 1fr !important; }
    }
    @media (max-width: 500px) {
      .grid-footer-cols { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(style);
}

interface PublishedJob {
  id: string;
  title: string;
  department: string;
  location: string | null;
  employment_type: string | null;
  description: string | null;
  requirements: string | null;
  salary_range_min: string | null;
  salary_range_max: string | null;
  salary_currency: string | null;
  published_at: string | null;
  region_code: string | null;
}

function formatType(t: string | null) {
  if (!t) return "";
  return t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatPublishedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Theme — matches ldplogistics.com (careers/index.html)
const THEME = {
  red: "#D6212B",
  redDark: "#B01820",
  black: "#131417",
  paper: "#F8F8F6",
  ink: "#141518",
} as const;

function hasPlaceholderToken(value: string, token: string): boolean {
  return value.includes(token);
}

// Placeholder image per department (optional; could use real URLs later)
function getJobCardImage(department: string): string {
  const dept = (department || "").toLowerCase();
  if (dept.includes("it") || dept.includes("tech")) return "https://images.unsplash.com/photo-1551431009-a802eeec77b1?w=400&h=260&fit=crop";
  if (dept.includes("logistics") || dept.includes("operations")) return "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&h=260&fit=crop";
  if (dept.includes("hr") || dept.includes("admin")) return "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&h=260&fit=crop";
  return "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=260&fit=crop";
}

// â”€â”€ Dynamic field renderer (career-page apply dialog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DynamicField({
  field, form, customAnswers, resumeData, onFormChange, onCustomChange, onResumeChange, onResumeClear, theme,
}: {
  field: FormField;
  form: Record<string, string>;
  customAnswers: Record<string, string>;
  resumeData: { url: string; filename: string } | null;
  onFormChange: (key: string, val: string) => void;
  onCustomChange: (id: string, val: string) => void;
  onResumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResumeClear: () => void;
  theme: { red: string; redDark: string };
}) {
  const isSystem = !!field.systemKey;
  const val = isSystem ? (form[field.systemKey!] ?? "") : (customAnswers[field.id] ?? "");
  const onChange = isSystem
    ? (v: string) => onFormChange(field.systemKey!, v)
    : (v: string) => onCustomChange(field.id, v);

  const labelEl = (
    <Label className="text-sm">
      {field.label}
      {field.required && <span className="text-red-600 ml-1">*</span>}
    </Label>
  );

  if (field.type === "file") {
    return (
      <div className="space-y-2">
        {labelEl}
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-red-400/50 transition-colors">
          {resumeData ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText className="h-4 w-4" style={{ color: theme.red }} />
              <span className="font-medium">{resumeData.filename}</span>
              <Button variant="ghost" size="sm" className="text-xs" onClick={onResumeClear}>Remove</Button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Click to upload (PDF, max 5MB)</p>
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={onResumeChange} />
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
          <SelectTrigger><SelectValue placeholder={field.placeholder || "Selectâ€¦"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">â€”</SelectItem>
            {field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
          className="rounded border-slate-300 h-4 w-4"
        />
        <span className="text-sm">
          {field.label}
          {field.required && <span className="text-red-600 ml-1">*</span>}
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

// â”€â”€ Repeatable section block (employment, education, etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RepeatableSectionBlock({
  section,
  entries,
  onChange,
  theme,
}: {
  section: import("@/components/ApplicationFormBuilderCore").FormSection;
  entries: Record<string, string>[];
  onChange: (entries: Record<string, string>[]) => void;
  theme: { red: string; redDark: string };
}) {
  const addEntry = () => onChange([...entries, {}]);
  const removeEntry = (idx: number) => onChange(entries.filter((_, i) => i !== idx));
  const setField = (idx: number, fieldId: string, val: string) => {
    const next = [...entries];
    next[idx] = { ...next[idx], [fieldId]: val };
    onChange(next);
  };

  const sectionIcon =
    section.templateKey === "employment_history"
      ? <Briefcase className="h-4 w-4" style={{ color: theme.red }} />
      : <GraduationCap className="h-4 w-4" style={{ color: theme.red }} />;

  return (
    <div>
      <div className="flex items-center gap-2 border-t pt-4 mb-3">
        {sectionIcon}
        <p className="text-sm font-semibold text-slate-900">{section.title}</p>
      </div>

      {entries.map((entry, idx) => {
        const currentlyKey = section.fields.find(
          (f) => f.type === "checkbox" && (f.label.toLowerCase().includes("currently") || f.label.toLowerCase().includes("present"))
        )?.id;
        const isCurrent = currentlyKey ? entry[currentlyKey] === "true" : false;

        return (
          <div
            key={idx}
            className="relative rounded-lg border border-slate-200 bg-slate-50 p-4 mb-3 space-y-3"
          >
            {/* Remove button */}
            <button
              type="button"
              className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition-colors"
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
                      className="rounded border-slate-300 h-4 w-4"
                    />
                    <span className="text-sm text-slate-700">{field.label}</span>
                  </label>
                );
              }

              if (field.type === "textarea") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-red-600 ml-1">*</span>}
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
                const disabled = isToField && isCurrent;
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && !isCurrent && <span className="text-red-600 ml-1">*</span>}
                    </Label>
                    <Input
                      type="date"
                      value={val}
                      disabled={disabled}
                      onChange={(e) => setField(idx, field.id, e.target.value)}
                      className={disabled ? "opacity-40" : ""}
                    />
                  </div>
                );
              }

              return (
                <div key={field.id} className="space-y-1.5">
                  <Label className="text-sm">
                    {field.label}
                    {field.required && <span className="text-red-600 ml-1">*</span>}
                  </Label>
                  <Input
                    type="text"
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

      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium rounded-md px-3 py-1.5 border border-dashed transition-colors"
        style={{ color: theme.red, borderColor: `${theme.red}55` }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${theme.red}0d`)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        onClick={addEntry}
      >
        <Plus className="h-4 w-4" />
        Add {section.title.replace(/ies$/, "y").replace(/s$/, "")}
      </button>
    </div>
  );
}

// â”€â”€ Form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EMPTY_FORM = {
  firstName: "", lastName: "", email: "", phone: "", middleName: "",
  personalEmail: "", dateOfBirth: "", gender: "", maritalStatus: "", bloodGroup: "",
  street: "", city: "", state: "", zipCode: "", country: "",
  currentCompany: "", currentTitle: "", experienceYears: "",
  expectedSalary: "", salaryCurrency: "AED", linkedinUrl: "", coverLetter: "",
};

// Region config — maps region_code values to display labels + flags
const REGIONS = [
  { code: "all", label: "All Regions", flag: "🌐" },
  { code: "PK", label: "Pakistan", flag: "🇵🇰" },
  { code: "IN", label: "India", flag: "🇮🇳" },
  { code: "US", label: "United States", flag: "🇺🇸" },
] as const;

const JOBS_PER_PAGE = 9;

export default function CareerSite() {
  const [jobs, setJobs] = useState<PublishedJob[]>([]);
  const [search, setSearch] = useState("");
  // Initialize region from URL ?region= param (e.g. when page opened with ?region=PK)
  const initialRegion = (() => {
    if (typeof window === "undefined") return "all";
    const p = new URLSearchParams(window.location.search).get("region");
    const code = (p ?? "").toUpperCase();
    return REGIONS.some(r => r.code !== "all" && r.code === code) ? code : "all";
  })();
  const [region, setRegion] = useState<string>(initialRegion);
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [jobDetailDialog, setJobDetailDialog] = useState<{ open: boolean; job: PublishedJob | null }>({ open: false, job: null });
  const [applyDialog, setApplyDialog] = useState<{ open: boolean; job: PublishedJob | null }>({ open: false, job: null });
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  /** Keyed by sectionId; each value is an array of field-value maps for repeatable sections. */
  const [repeatableEntries, setRepeatableEntries] = useState<Record<string, Record<string, string>[]>>({});
  const [resumeData, setResumeData] = useState<{ url: string; filename: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterAccepted, setNewsletterAccepted] = useState(false);
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);

  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    const url = region === "all"
      ? "/api/recruitment/jobs/published"
      : `/api/recruitment/jobs/published?region=${encodeURIComponent(region)}`;
    setJobsLoading(true);
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setJobs(Array.isArray(data) ? data : []); setPage(1); })
      .catch(() => { setJobs([]); })
      .finally(() => setJobsLoading(false));
  }, [region]);

  // Fetch the per-job application form config whenever the apply dialog opens
  useEffect(() => {
    if (!applyDialog.open || !applyDialog.job) return;
    setFormConfig(null);
    fetch(`/api/recruitment/jobs/${applyDialog.job.id}/application-form`)
      .then((r) => r.json())
      .then((data) => { if (data?.sections) setFormConfig(data as FormConfig); })
      .catch(() => { });
  }, [applyDialog.open, applyDialog.job?.id]);

  // Open apply form directly when URL has ?job=JOB_ID (e.g. from Webflow link)
  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const jobId = params.get("job");
    if (!jobId || jobs.length === 0) return;
    const job = jobs.find((j) => j.id === jobId);
    if (job) setApplyDialog({ open: true, job });
  }, [jobs]);

  // Region filtered server-side; dept/type/search are client-side only
  const filteredJobs = jobs.filter((j) => {
    if (deptFilter !== "all" && (j.department ?? "") !== deptFilter) return false;
    if (typeFilter !== "all" && (j.employment_type ?? "") !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !j.title.toLowerCase().includes(q) &&
        !(j.department ?? "").toLowerCase().includes(q) &&
        !(j.location ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const pagedJobs = filteredJobs.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);
  // Skeleton placeholders shown while fetching
  const skeletonCount = 6;


  // Derived filter options from all jobs
  const allDepts = Array.from(new Set(jobs.map(j => j.department).filter(Boolean))).sort() as string[];
  const allTypes = Array.from(new Set(jobs.map(j => j.employment_type).filter(Boolean))).sort() as string[];

  // Reset page when filters change; also sync region to URL cleanly
  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(1);
  };

  // Keep URL in sync with region selection (replaces ?region= in address bar)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (region === "all") {
      url.searchParams.delete("region");
    } else {
      url.searchParams.set("region", region);
    }
    window.history.replaceState({}, "", url.toString());
  }, [region]);


  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setResumeData({ url: reader.result as string, filename: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleApply = async () => {
    // Validate required fields from config
    if (formConfig) {
      for (const section of formConfig.sections) {
        if (section.repeatable) {
          // Validate each repeatable entry's required fields
          const entries = repeatableEntries[section.id] ?? [];
          for (let i = 0; i < entries.length; i++) {
            for (const field of section.fields) {
              if (!field.required) continue;
              const val = entries[i][field.id] ?? "";
              if (!val.trim()) {
                toast.error(`${field.label} is required in ${section.title} entry ${i + 1}`);
                return;
              }
            }
          }
          continue;
        }
        for (const field of section.fields) {
          if (!field.required) continue;
          if (field.type === "file") {
            if (!resumeData) { toast.error("Resume / CV is required"); return; }
          } else if (field.systemKey) {
            const val = form[field.systemKey] ?? "";
            if (!val.trim()) { toast.error(`${field.label} is required`); return; }
          } else {
            const val = customAnswers[field.id] ?? "";
            if (!val.trim()) { toast.error(`${field.label} is required`); return; }
          }
        }
      }
    } else {
      if (!form.firstName?.trim() || !form.lastName?.trim() || !form.email?.trim()) {
        toast.error("Name and email are required"); return;
      }
      if (!resumeData) { toast.error("Please upload your resume"); return; }
    }
    if (!applyDialog.job) return;

    setLoading(true);
    try {
      const candidateRes = await fetch("/api/recruitment/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName?.trim() || "",
          lastName: form.lastName?.trim() || "",
          email: form.email?.trim() || "",
          phone: form.phone || null,
          middleName: form.middleName?.trim() || null,
          personalEmail: form.personalEmail?.trim() || null,
          dateOfBirth: form.dateOfBirth || null,
          gender: form.gender || null,
          maritalStatus: form.maritalStatus || null,
          bloodGroup: form.bloodGroup || null,
          street: form.street?.trim() || null,
          city: form.city?.trim() || null,
          state: form.state?.trim() || null,
          zipCode: form.zipCode?.trim() || null,
          country: form.country?.trim() || null,
          linkedinUrl: form.linkedinUrl || null,
          currentCompany: form.currentCompany || null,
          currentTitle: form.currentTitle || null,
          experienceYears: form.experienceYears ? parseInt(form.experienceYears) : null,
          expectedSalary: form.expectedSalary ? parseFloat(form.expectedSalary) : null,
          salaryCurrency: form.salaryCurrency || null,
          resumeUrl: resumeData?.url ?? null,
          resumeFilename: resumeData?.filename ?? null,
          source: "career_page",
        }),
      });
      if (!candidateRes.ok) {
        const errData = await candidateRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to submit application");
      }
      const candidate = await candidateRes.json();

      // Build custom_answers: flat custom fields + repeatable section arrays keyed by sectionId
      const repeatablePayload = Object.fromEntries(
        Object.entries(repeatableEntries).filter(([, entries]) => entries.length > 0)
      );
      const merged = { ...customAnswers, ...repeatablePayload };
      const allCustom = Object.keys(merged).length > 0 ? merged : null;

      const appRes = await fetch("/api/recruitment/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: applyDialog.job.id,
          coverLetter: form.coverLetter || null,
          customAnswers: allCustom,
          referralSource: "career_page",
        }),
      });
      if (!appRes.ok) {
        const errData = await appRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to submit application");
      }

      toast.success("Application submitted!", { description: "We'll review your profile and get back to you." });
      setApplyDialog({ open: false, job: null });
      setForm(EMPTY_FORM);
      setCustomAnswers({});
      setRepeatableEntries({});
      setResumeData(null);
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) {
      toast.error("Please enter your email");
      return;
    }
    if (!newsletterAccepted) {
      toast.error("Please accept the privacy policy & terms of service");
      return;
    }
    toast.success("Thanks for subscribing!");
    setNewsletterEmail("");
    setNewsletterAccepted(false);
  };

  return (
    <div id="careers-page" className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#F8F8F6", color: "#141518" }}>
      {/* ========== MAIN HEADER — matches index.html nav ========== */}
      <header style={{ position: "sticky", top: 0, zIndex: 60, background: "rgba(248,248,246,0.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid #E2E1DE" }}>
        <div className="max-w-7xl mx-auto px-6" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "68px" }}>
          <a href="#hero" style={{ display: "flex", alignItems: "baseline", gap: "7px", textDecoration: "none", lineHeight: 1 }}>
            <img src={!hasPlaceholderToken(CAREERS_LOGO, "PASTE_YOUR_BASE64_HERE") ? CAREERS_LOGO : LOGO_DARK} alt="LDP Logistics" style={{ height: "58px", width: "auto", maxWidth: "220px", objectFit: "contain", display: "block" }} />
          </a>
          <nav className="hidden md:flex items-center" style={{ gap: "4px", listStyle: "none" }}>
            {[
              ["https://www.ldplogistics.com", "Home", true],
              ["#jobs", "Open Positions", false],
              ["https://www.ldplogistics.com/contact", "Contact", true],
            ].map(([href, label, external]) => (
              <a key={String(href)} href={String(href)}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                style={{ textDecoration: "none", fontWeight: 600, fontSize: "14px", color: "#3E4044", padding: "9px 10px", borderRadius: "6px", transition: "background .12s,color .12s" }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "#F0F0EE"; (e.currentTarget as HTMLElement).style.color = "#131417" }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#3E4044" }}
              >{String(label)}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              style={{ background: THEME.black, color: THEME.paper, border: "none", borderRadius: "8px", padding: "11px 22px", fontWeight: 700, fontSize: "14px", cursor: "pointer", transition: "background .15s ease, transform .15s ease", letterSpacing: ".01em" }}
              onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = THEME.red; el.style.transform = "translateY(-2px)"; }}
              onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = THEME.black; el.style.transform = "none"; }}
              onClick={() => document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth" })}
            >View Roles</button>
            <button type="button" className="md:hidden p-2" aria-label="Menu" style={{ background: "none", border: "none" }}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>


      {/* ========== HERO ========== */}
      <section id="hero" style={{
        background: "linear-gradient(135deg, #131417 0%, #1e2027 60%, #23262D 100%)",
        paddingTop: "72px",
        paddingBottom: "64px",
        borderBottom: "3px solid " + THEME.red,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle grid overlay */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.04) 1px, transparent 0)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
        {/* Red glow top-right */}
        <div style={{ position: "absolute", top: "-120px", right: "-120px", width: "420px", height: "420px", borderRadius: "50%", background: "radial-gradient(circle, rgba(214,33,43,.18) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center" style={{ position: "relative", zIndex: 1 }}>
          {/* Pill badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(214,33,43,.15)", border: "1px solid rgba(214,33,43,.30)", borderRadius: "100px", padding: "6px 16px", marginBottom: "28px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: THEME.red, display: "inline-block", boxShadow: "0 0 6px " + THEME.red }} />
            <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".14em", color: "rgba(255,255,255,.85)", textTransform: "uppercase" }}>We're Hiring</span>
          </div>

          <h1 style={{ fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.06, color: "#fff", marginBottom: "20px", fontFamily: "'Overpass',sans-serif" }}>
            Build Your Career at{" "}
            <span style={{ color: THEME.red }}>LDP Logistics</span>
          </h1>
          <p style={{ fontSize: "clamp(15px,2vw,19px)", color: "rgba(255,255,255,.65)", maxWidth: "620px", margin: "0 auto 40px", lineHeight: 1.65, fontFamily: "'Overpass',sans-serif" }}>
            Join a fast-growing logistics company operating across Pakistan, India, and the US. Real careers. Real impact.
          </p>

          {/* CTA */}
          <button
            type="button"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "52px", padding: "0 32px", background: THEME.red, color: "#fff", border: "none", borderRadius: "10px", fontWeight: 800, fontSize: "16px", cursor: "pointer", transition: "transform .18s ease, box-shadow .18s ease", letterSpacing: ".01em", fontFamily: "inherit", boxShadow: "0 4px 24px rgba(214,33,43,.35)" }}
            onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-3px)"; el.style.boxShadow = "0 8px 32px rgba(214,33,43,.5)"; }}
            onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "none"; el.style.boxShadow = "0 4px 24px rgba(214,33,43,.35)"; }}
            onClick={() => document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth" })}
          >
            Explore Open Roles
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          {/* Stats strip */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0", marginTop: "56px", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: "40px" }}>
            {[
              { value: "3", label: "Countries" },
              { value: "10+", label: "Departments" },
              { value: "100+", label: "Team Members" },
              { value: "Fast", label: "Career Growth" },
            ].map((stat, i, arr) => (
              <div key={stat.label} style={{
                flex: "1 1 140px",
                padding: "0 28px",
                textAlign: "center",
                borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,.08)" : "none",
              }}>
                <div style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 900, color: "#fff", letterSpacing: "-.03em", fontFamily: "'Overpass',sans-serif", lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,.45)", marginTop: "6px", letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "'Overpass Mono',monospace" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ========== JOB LISTINGS — filter + 3-col paginated grid ========== */}
      <section id="jobs" className="py-16 lg:py-24" style={{ background: "#F0F0EE" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* ── Section header ── */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <h2 style={{ fontFamily: "'Overpass',sans-serif", fontWeight: 900, fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-.02em", color: THEME.ink, margin: 0 }}>
                Open Positions
              </h2>
              <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: ".1em", color: "#fff", background: filteredJobs.length > 0 ? THEME.red : "#84868B", borderRadius: "20px", padding: "4px 12px" }}>
                {filteredJobs.length} {filteredJobs.length === 1 ? "role" : "roles"}
              </span>
            </div>
            <p style={{ fontSize: "14px", color: "#84868B", margin: 0 }}>Find your next role at LDP Logistics. Openings vary by department and location.</p>
          </div>

          {/* ── Filter Bar ── */}
          <div style={{ background: "#fff", border: "1px solid #E2E1DE", borderRadius: "14px", padding: "20px 24px", marginBottom: "28px", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>

            {/* Row 1: Region tabs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #F0F0EE" }}>
              <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "10px", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "#84868B", alignSelf: "center", marginRight: "4px" }}>Region</span>
              {REGIONS.map(r => {
                const active = region === r.code;
                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => handleFilterChange(() => setRegion(r.code))}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "7px 16px", borderRadius: "8px", border: "1.5px solid",
                      borderColor: active ? THEME.black : "transparent",
                      background: active ? THEME.black : "#F4F4F2",
                      color: active ? "#fff" : "#3E4044",
                      fontFamily: "inherit", fontWeight: 700, fontSize: "13px",
                      cursor: "pointer", transition: "all .12s ease",
                    }}
                    onMouseOver={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "#EAEAE8"; } }}
                    onMouseOut={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "#F4F4F2"; } }}
                  >
                    <span style={{ fontSize: "16px", lineHeight: 1 }}>{r.flag}</span>
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Row 2: Search + Dept + Type dropdowns */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
              {/* Search */}
              <div style={{ flex: "1 1 220px", position: "relative", minWidth: "200px" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#84868B", pointerEvents: "none", display: "flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                </span>
                <input
                  type="text"
                  placeholder="Search by title, department, location…"
                  value={search}
                  onChange={e => handleFilterChange(() => setSearch(e.target.value))}
                  style={{ width: "100%", paddingLeft: "36px", paddingRight: "12px", height: "40px", border: "1.5px solid #E2E1DE", borderRadius: "8px", fontFamily: "'Overpass',sans-serif", fontSize: "14px", color: THEME.ink, outline: "none", background: "#FAFAF9", boxSizing: "border-box", transition: "border-color .15s" }}
                  onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = THEME.black; }}
                  onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E1DE"; }}
                />
              </div>

              {/* Department */}
              <div style={{ flex: "0 1 180px", minWidth: "140px" }}>
                <select
                  value={deptFilter}
                  onChange={e => handleFilterChange(() => setDeptFilter(e.target.value))}
                  style={{ width: "100%", height: "40px", padding: "0 12px", border: "1.5px solid #E2E1DE", borderRadius: "8px", fontFamily: "'Overpass',sans-serif", fontSize: "14px", color: deptFilter === "all" ? "#84868B" : THEME.ink, background: "#FAFAF9", cursor: "pointer", outline: "none", boxSizing: "border-box" }}
                >
                  <option value="all">All Departments</option>
                  {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Employment Type */}
              <div style={{ flex: "0 1 160px", minWidth: "130px" }}>
                <select
                  value={typeFilter}
                  onChange={e => handleFilterChange(() => setTypeFilter(e.target.value))}
                  style={{ width: "100%", height: "40px", padding: "0 12px", border: "1.5px solid #E2E1DE", borderRadius: "8px", fontFamily: "'Overpass',sans-serif", fontSize: "14px", color: typeFilter === "all" ? "#84868B" : THEME.ink, background: "#FAFAF9", cursor: "pointer", outline: "none", boxSizing: "border-box" }}
                >
                  <option value="all">All Job Types</option>
                  {allTypes.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
                </select>
              </div>

              {/* Clear all */}
              {(search || region !== "all" || deptFilter !== "all" || typeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setRegion("all"); setDeptFilter("all"); setTypeFilter("all"); setPage(1); }}
                  style={{ height: "40px", padding: "0 14px", background: "transparent", border: "1.5px solid #E2E1DE", borderRadius: "8px", fontFamily: "inherit", fontWeight: 700, fontSize: "13px", color: "#84868B", cursor: "pointer", whiteSpace: "nowrap", transition: "border-color .12s, color .12s" }}
                  onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.red; el.style.color = THEME.red; }}
                  onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#E2E1DE"; el.style.color = "#84868B"; }}
                >✕ Clear filters</button>
              )}
            </div>

            {/* Active filter chips */}
            {(region !== "all" || deptFilter !== "all" || typeFilter !== "all") && (
              <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {region !== "all" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, fontFamily: "'Overpass Mono',monospace", letterSpacing: ".06em", padding: "4px 10px 4px 12px", background: THEME.black, color: "#fff", borderRadius: "20px" }}>
                    {REGIONS.find(r => r.code === region)?.flag} {REGIONS.find(r => r.code === region)?.label}
                    <button onClick={() => handleFilterChange(() => setRegion("all"))} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: "0 2px" }}>✕</button>
                  </span>
                )}
                {deptFilter !== "all" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, fontFamily: "'Overpass Mono',monospace", letterSpacing: ".06em", padding: "4px 10px 4px 12px", background: "#23262D", color: "#fff", borderRadius: "20px" }}>
                    {deptFilter}
                    <button onClick={() => handleFilterChange(() => setDeptFilter("all"))} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: "0 2px" }}>✕</button>
                  </span>
                )}
                {typeFilter !== "all" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, fontFamily: "'Overpass Mono',monospace", letterSpacing: ".06em", padding: "4px 10px 4px 12px", background: "#23262D", color: "#fff", borderRadius: "20px" }}>
                    {formatType(typeFilter)}
                    <button onClick={() => handleFilterChange(() => setTypeFilter("all"))} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: "0 2px" }}>✕</button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Job Cards Grid ── */}
          {jobsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: skeletonCount }).map((_, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #E2E1DE", borderRadius: "10px", overflow: "hidden" }}>
                  <div style={{ height: "4px", background: "linear-gradient(90deg,#E2E1DE 25%,#EDECEA 50%,#E2E1DE 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                  <div style={{ padding: "20px" }}>
                    <div style={{ height: "10px", width: "60%", background: "#F0F0EE", borderRadius: "4px", marginBottom: "14px" }} />
                    <div style={{ height: "18px", width: "85%", background: "#E8E7E5", borderRadius: "4px", marginBottom: "10px" }} />
                    <div style={{ height: "12px", width: "100%", background: "#F4F4F2", borderRadius: "4px", marginBottom: "6px" }} />
                    <div style={{ height: "12px", width: "75%", background: "#F4F4F2", borderRadius: "4px", marginBottom: "20px" }} />
                    <div style={{ height: "1px", background: "#E2E1DE", marginBottom: "16px" }} />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ height: "12px", width: "30%", background: "#F0F0EE", borderRadius: "4px" }} />
                      <div style={{ height: "32px", width: "28%", background: "#E2E1DE", borderRadius: "8px" }} />
                    </div>
                  </div>
                </div>
              ))}
              <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", background: "#fff", border: "1px solid #E2E1DE", borderRadius: "12px" }}>
              <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "#F0F0EE", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Briefcase style={{ color: "#C2C3C6", width: 28, height: 28 }} />
              </div>
              <p style={{ fontWeight: 700, fontSize: "17px", color: THEME.ink, marginBottom: "6px" }}>No positions match your filters</p>
              <p style={{ fontSize: "14px", color: "#84868B", marginBottom: "18px" }}>Try adjusting your search or clearing some filters.</p>
              <button
                type="button"
                onClick={() => { setSearch(""); setRegion("all"); setDeptFilter("all"); setTypeFilter("all"); setPage(1); }}
                style={{ padding: "10px 22px", background: THEME.black, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}
              >Clear all filters</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {pagedJobs.map((job) => {

                  const postedOn = formatPublishedDate(job.published_at);
                  const metaParts = [
                    job.department,
                    formatType(job.employment_type) || null,
                    job.location || null,
                  ].filter(Boolean);
                  const rawExcerpt = (job.description || "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                  const excerpt = rawExcerpt.length > 140
                    ? rawExcerpt.slice(0, 140).trimEnd() + "..."
                    : rawExcerpt;
                  const regionInfo = REGIONS.find(r => r.code === (job.region_code ?? "").toUpperCase());
                  return (
                    <div
                      key={job.id}
                      className="group relative overflow-hidden flex flex-col cursor-pointer"
                      style={{ background: "#fff", border: "1px solid #E2E1DE", borderRadius: "10px", boxShadow: "0 1px 0 rgba(0,0,0,.02)", transition: "transform .16s ease,box-shadow .16s ease,border-color .16s ease" }}
                      onClick={() => setJobDetailDialog({ open: true, job })}
                      onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-4px)"; el.style.boxShadow = "0 14px 30px rgba(20,21,24,.08)"; el.style.borderColor = "#141518"; }}
                      onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "none"; el.style.boxShadow = "0 1px 0 rgba(0,0,0,.02)"; el.style.borderColor = "#E2E1DE"; }}
                    >
                      <div style={{ height: "4px", width: "100%", backgroundColor: THEME.black }} />
                      <div className="flex flex-col flex-1 p-5">
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px", gap: "6px" }}>
                          <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "10px", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "#84868B", margin: 0, lineHeight: 1.6 }}>
                            {metaParts.join(" · ")}
                            {postedOn && <span style={{ display: "block", fontWeight: 400, marginTop: "2px" }}>{postedOn}</span>}
                          </p>
                          {regionInfo && regionInfo.code !== "all" && (
                            <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#84868B", border: "1.5px solid #E2E1DE", borderRadius: "5px", padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                              {regionInfo.flag} {regionInfo.label}
                            </span>
                          )}
                        </div>
                        <h3 style={{ fontFamily: "'Overpass',sans-serif", fontWeight: 800, fontSize: "16px", letterSpacing: "-.01em", color: THEME.ink, marginBottom: "8px", lineHeight: 1.25 }}>
                          {job.title}
                        </h3>
                        {excerpt && (
                          <p style={{ fontSize: "14px", lineHeight: 1.65, color: "#494B4F", flex: 1 }}>{excerpt}</p>
                        )}
                        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #E2E1DE", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <a
                            href="#"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setJobDetailDialog({ open: true, job }); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none", color: THEME.black, fontFamily: "'Overpass Mono',monospace", letterSpacing: ".04em", transition: "color .15s" }}
                            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = THEME.red; }}
                            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = THEME.black; }}
                          >View details →</a>
                          <button
                            type="button"
                            style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "8px 16px", background: THEME.black, color: THEME.paper, border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", fontFamily: "inherit", transition: "background .15s, transform .15s", whiteSpace: "nowrap" }}
                            onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = THEME.red; el.style.transform = "translateY(-1px)"; }}
                            onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = THEME.black; el.style.transform = "none"; }}
                            onClick={e => { e.stopPropagation(); setApplyDialog({ open: true, job }); }}
                          >Apply Now →</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div style={{ marginTop: "36px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
                  {/* Prev */}
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ height: "38px", padding: "0 14px", border: "1.5px solid #E2E1DE", borderRadius: "8px", background: page === 1 ? "#F4F4F2" : "#fff", color: page === 1 ? "#C2C3C6" : THEME.ink, fontWeight: 700, fontSize: "13px", cursor: page === 1 ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .12s" }}
                    onMouseOver={e => { if (page > 1) { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.black; } }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2E1DE"; }}
                  >← Prev</button>

                  {/* Page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => {
                    const active = n === page;
                    // Show first, last, current ±1, and ellipsis
                    const show = n === 1 || n === totalPages || Math.abs(n - page) <= 1;
                    const isEllipsisBefore = n === 2 && page > 3;
                    const isEllipsisAfter = n === totalPages - 1 && page < totalPages - 2;
                    if (!show) return null;
                    if (isEllipsisBefore || isEllipsisAfter) {
                      return <span key={n} style={{ color: "#84868B", fontWeight: 700, padding: "0 4px" }}>…</span>;
                    }
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        style={{ width: "38px", height: "38px", border: "1.5px solid", borderColor: active ? THEME.black : "#E2E1DE", borderRadius: "8px", background: active ? THEME.black : "#fff", color: active ? "#fff" : THEME.ink, fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", transition: "all .12s" }}
                        onMouseOver={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.black; el.style.background = "#F4F4F2"; } }}
                        onMouseOut={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#E2E1DE"; el.style.background = "#fff"; } }}
                      >{n}</button>
                    );
                  })}

                  {/* Next */}
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{ height: "38px", padding: "0 14px", border: "1.5px solid #E2E1DE", borderRadius: "8px", background: page === totalPages ? "#F4F4F2" : "#fff", color: page === totalPages ? "#C2C3C6" : THEME.ink, fontWeight: 700, fontSize: "13px", cursor: page === totalPages ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .12s" }}
                    onMouseOver={e => { if (page < totalPages) { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.black; } }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2E1DE"; }}
                  >Next →</button>

                  {/* Page info */}
                  <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", color: "#84868B", marginLeft: "8px" }}>
                    Page {page} of {totalPages} · {filteredJobs.length} results
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </section>


      {/* ========== CTA SECTION ========== */}
      <section id="cta" className="py-16 lg:py-20 border-t" style={{ background: "#fff", borderColor: "#E2E1DE" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#141518", fontWeight: 800, letterSpacing: "-.015em" }}>
            Get started with expert logistics <span style={{ color: THEME.red }}>solutions!</span>
          </h2>
          <a
            href="https://www.ldplogistics.com/shippers"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "15px", textDecoration: "none", padding: "14px 26px", borderRadius: "8px", border: "2px solid #141518", color: "#141518", background: "transparent", transition: "transform .15s,box-shadow .15s,background .15s", letterSpacing: ".01em" }}
            onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#F0F0EE"; el.style.transform = "translateY(-2px)" }}
            onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.transform = "none" }}
          >
            Get a quote <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ========== FOOTER — matches careers/index.html ========== */}
      <footer style={{ background: "#141518", color: "#9C9EA2", padding: "54px 0 30px" }}>
        <div className="max-w-7xl mx-auto px-6">
          {/* 4-col grid */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "30px", marginBottom: "36px" }} className="grid-footer-cols">
            {/* Col 1: logo + description + socials */}
            <div>
              <img src={!hasPlaceholderToken(CAREERS_LOGO_FOOTER, "PASTE_YOUR_FOOTER_BASE64_HERE") ? CAREERS_LOGO_FOOTER : LOGO_LIGHT} alt="LDP Logistics" style={{ height: "34px", width: "auto", display: "block", marginBottom: "10px" }} />
              <p style={{ fontSize: "13.5px", lineHeight: 1.6, maxWidth: "300px", marginTop: "10px", color: "#9C9EA2" }}>
                Freight brokerage built around the gate. Full truckload, LTL, drayage, intermodal, and specialized capacity across the lower 48 — every carrier through a documented six-point screen.
              </p>
              {/* TIA Member badge */}
              {!hasPlaceholderToken(CAREERS_TIA_BADGE, "PASTE_YOUR_TIA_BADGE_BASE64_HERE") && (
                <img
                  src={CAREERS_TIA_BADGE}
                  alt="Transportation Intermediaries Association (TIA) Member 2026"
                  style={{ width: "74px", height: "auto", display: "block", marginTop: "18px", opacity: 0.92 }}
                />
              )}
              <div style={{ display: "flex", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
                {/* LinkedIn */}
                <a href="https://www.linkedin.com/company/ldplogistics" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "8px", color: "#C7C9CC", textDecoration: "none", transition: "all .16s ease" }}
                  onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#D6212B"; el.style.borderColor = "#D6212B"; el.style.color = "#fff"; el.style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.borderColor = "rgba(255,255,255,.18)"; el.style.color = "#C7C9CC"; el.style.transform = ""; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z" /></svg>
                </a>
                {/* Instagram */}
                <a href="https://www.instagram.com/ldp_logistics/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "8px", color: "#C7C9CC", textDecoration: "none", transition: "all .16s ease" }}
                  onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#D6212B"; el.style.borderColor = "#D6212B"; el.style.color = "#fff"; el.style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.borderColor = "rgba(255,255,255,.18)"; el.style.color = "#C7C9CC"; el.style.transform = ""; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.17.42.37 1.06.42 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.17-1.06.37-2.23.42-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.42a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.17-.42-.37-1.06-.42-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.17 1.06-.37 2.23-.42C8.42 2.17 8.8 2.16 12 2.16zm0 10.88a4.28 4.28 0 1 0 0-8.56 4.28 4.28 0 0 0 0 8.56zm8.4-11.12a1.54 1.54 0 1 1-3.08 0 1.54 1.54 0 0 1 3.08 0z" /></svg>
                </a>
                {/* X */}
                <a href="https://x.com/LDP_Logistics" target="_blank" rel="noopener noreferrer" aria-label="X"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "8px", color: "#C7C9CC", textDecoration: "none", transition: "all .16s ease" }}
                  onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#D6212B"; el.style.borderColor = "#D6212B"; el.style.color = "#fff"; el.style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.borderColor = "rgba(255,255,255,.18)"; el.style.color = "#C7C9CC"; el.style.transform = ""; }}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M18.24 2.25h3.31l-7.23 8.26L22.84 21.75h-6.66l-5.22-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64z" /></svg>
                </a>
                {/* YouTube */}
                <a href="https://www.youtube.com/@LDP_Logistics" target="_blank" rel="noopener noreferrer" aria-label="YouTube"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "8px", color: "#C7C9CC", textDecoration: "none", transition: "all .16s ease" }}
                  onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#D6212B"; el.style.borderColor = "#D6212B"; el.style.color = "#fff"; el.style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.borderColor = "rgba(255,255,255,.18)"; el.style.color = "#C7C9CC"; el.style.transform = ""; }}
                >
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2C0 8.08 0 12 0 12s0 3.92.5 5.8a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" /></svg>
                </a>
                {/* Facebook */}
                <a href="https://www.facebook.com/ldplogistic" target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "8px", color: "#C7C9CC", textDecoration: "none", transition: "all .16s ease" }}
                  onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#D6212B"; el.style.borderColor = "#D6212B"; el.style.color = "#fff"; el.style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.borderColor = "rgba(255,255,255,.18)"; el.style.color = "#C7C9CC"; el.style.transform = ""; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z" /></svg>
                </a>
              </div>
            </div>
            {/* Col 2: Modes */}
            <div>
              <h4 style={{ fontFamily: "monospace", fontSize: "11px", letterSpacing: ".16em", textTransform: "uppercase", color: "#6B6D72", marginBottom: "14px" }}>Modes</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {([
                  ["Full Truckload", "https://www.ldplogistics.com/modes/ftl/"],
                  ["LTL", "https://www.ldplogistics.com/modes/ltl/"],
                  ["Port Drayage", "https://www.ldplogistics.com/modes/drayage/"],
                  ["Intermodal Rail", "https://www.ldplogistics.com/modes/intermodal/"],
                  ["Flatbed & Open Deck", "https://www.ldplogistics.com/modes/flatbed/"],
                  ["Refrigerated", "https://www.ldplogistics.com/modes/reefer/"],
                  ["Expedited", "https://www.ldplogistics.com/modes/expedited/"],
                  ["Power Only", "https://www.ldplogistics.com/modes/poweronly/"],
                ] as [string, string][]).map(([label, href]) => (
                  <li key={label} style={{ marginBottom: "9px" }}><a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#BDBFC3", textDecoration: "none", fontSize: "14px", transition: "color .12s" }} onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.textDecoration = "underline" }} onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = "#BDBFC3"; (e.currentTarget as HTMLElement).style.textDecoration = "none" }}>{label}</a></li>
                ))}
              </ul>
            </div>
            {/* Col 3: Work with us */}
            <div>
              <h4 style={{ fontFamily: "monospace", fontSize: "11px", letterSpacing: ".16em", textTransform: "uppercase", color: "#6B6D72", marginBottom: "14px" }}>Work with us</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {([
                  ["Pay an invoice", "https://www.ldplogistics.com/#pay"],
                  ["Shippers", "https://www.ldplogistics.com/#shippers"],
                  ["Carriers", "https://www.ldplogistics.com/#carriers"],
                  ["Network & coverage", "https://www.ldplogistics.com/#network"],
                  ["Customer onboarding", "https://www.ldplogistics.com/#credit"],
                  ["Get a quote", "https://www.ldplogistics.com/#shippers"],
                ] as [string, string][]).map(([label, href]) => (
                  <li key={label} style={{ marginBottom: "9px" }}><a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#BDBFC3", textDecoration: "none", fontSize: "14px", transition: "color .12s" }} onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.textDecoration = "underline" }} onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = "#BDBFC3"; (e.currentTarget as HTMLElement).style.textDecoration = "none" }}>{label}</a></li>
                ))}
              </ul>
            </div>
            {/* Col 4: Company */}
            <div>
              <h4 style={{ fontFamily: "monospace", fontSize: "11px", letterSpacing: ".16em", textTransform: "uppercase", color: "#6B6D72", marginBottom: "14px" }}>Company</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {([
                  ["About", "https://www.ldplogistics.com/#about"],
                  ["Careers", "#jobs"],
                  ["Trust Center", "https://www.ldplogistics.com/#trust"],
                  ["Insights", "https://www.ldplogistics.com/#insights"],
                  ["Glossary", "https://www.ldplogistics.com/#glossary"],
                  ["Contact", "https://www.ldplogistics.com/#contact"],
                ] as [string, string][]).map(([label, href]) => (
                  <li key={label} style={{ marginBottom: "9px" }}><a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#BDBFC3", textDecoration: "none", fontSize: "14px", transition: "color .12s" }} onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.textDecoration = "underline" }} onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = "#BDBFC3"; (e.currentTarget as HTMLElement).style.textDecoration = "none" }}>{label}</a></li>
                ))}
              </ul>
            </div>
          </div>
          {/* Legal bar */}
          <div style={{ borderTop: "1px solid #2E2F33", paddingTop: "22px", display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", fontFamily: "monospace", fontSize: "11.5px", letterSpacing: ".06em", color: "#6B6D72" }}>
            <span>© 2026 LDP Logistics · Sayreville, NJ 08872 · <a href="https://ldplogistics.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }} onMouseOver={e => { (e.currentTarget as HTMLElement).style.textDecoration = "underline" }} onMouseOut={e => { (e.currentTarget as HTMLElement).style.textDecoration = "none" }}>Privacy</a> · <a href="https://ldplogistics.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }} onMouseOver={e => { (e.currentTarget as HTMLElement).style.textDecoration = "underline" }} onMouseOut={e => { (e.currentTarget as HTMLElement).style.textDecoration = "none" }}>Terms of Use</a></span>
            <span>MC #1041005 · USDOT #03288570</span>
          </div>
        </div>
      </footer>


      {/* ========== JOB DETAIL MODAL ========== */}
      {jobDetailDialog.open && jobDetailDialog.job && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => setJobDetailDialog({ open: false, job: null })}
        >
          {/* Backdrop */}
          <div style={{ position: "absolute", inset: 0, background: "rgba(30,32,38,.55)", backdropFilter: "blur(4px)" }} />
          {/* Sheet */}
          <div
            style={{ position: "relative", width: "min(720px, 94vw)", maxHeight: "88vh", overflowY: "auto", background: THEME.paper, borderRadius: "16px", boxShadow: "0 30px 80px rgba(0,0,0,.4)", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header band */}
            <div style={{ background: "#23262D", color: "#C7C9CC", padding: "28px 32px 24px", borderRadius: "16px 16px 0 0", position: "sticky", top: 0, zIndex: 2 }}>
              {/* Eyebrow */}
              <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: THEME.red, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "inline-block", width: "22px", height: "2px", background: THEME.red, flexShrink: 0 }} />
                Open Position
              </p>
              <h2 style={{ fontFamily: "'Overpass',sans-serif", fontWeight: 900, fontSize: "clamp(22px,3.4vw,30px)", letterSpacing: "-.02em", lineHeight: 1.1, color: "#fff", marginBottom: "14px" }}>
                {jobDetailDialog.job.title}
              </h2>
              {/* Meta chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {[jobDetailDialog.job.department, formatType(jobDetailDialog.job.employment_type), jobDetailDialog.job.location].filter(Boolean).map(chip => (
                  <span key={chip} style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#E9E9EB", border: "1.5px solid rgba(255,255,255,.22)", borderRadius: "6px", padding: "6px 12px", background: "rgba(255,255,255,.06)" }}>{chip}</span>
                ))}
                {formatPublishedDate(jobDetailDialog.job.published_at) && (
                  <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", color: "rgba(255,255,255,.5)", padding: "6px 4px" }}>Posted {formatPublishedDate(jobDetailDialog.job.published_at)}</span>
                )}
              </div>
              {/* Close btn */}
              <button
                onClick={() => setJobDetailDialog({ open: false, job: null })}
                style={{ position: "absolute", top: "20px", right: "20px", background: "rgba(255,255,255,.12)", border: "none", borderRadius: "9px", width: "36px", height: "36px", fontSize: "16px", color: "#DDDFE3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = THEME.red; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)"; (e.currentTarget as HTMLElement).style.color = "#DDDFE3"; }}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: "28px 32px", flex: 1 }}>
              {/* Salary */}
              {jobDetailDialog.job.salary_range_min && jobDetailDialog.job.salary_range_max && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#fff", border: "1px solid #E2E1DE", borderLeft: `4px solid ${THEME.black}`, borderRadius: "0 8px 8px 0", padding: "10px 16px", marginBottom: "22px" }}>
                  <span style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "10.5px", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#84868B" }}>Salary</span>
                  <span style={{ fontWeight: 800, fontSize: "15px", color: THEME.ink }}>
                    {jobDetailDialog.job.salary_currency || ""} {Number(jobDetailDialog.job.salary_range_min).toLocaleString()} – {Number(jobDetailDialog.job.salary_range_max).toLocaleString()}
                  </span>
                </div>
              )}

              {/* About the role */}
              {jobDetailDialog.job.description && (
                <div style={{ marginBottom: "24px" }}>
                  <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: THEME.red, marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                    About the role
                    <span style={{ flex: 1, height: "1px", background: "#E2E1DE" }} />
                  </p>
                  {isHtmlContent(jobDetailDialog.job.description) ? (
                    <div
                      className="prose prose-sm max-w-none"
                      style={{ fontSize: "15px", lineHeight: 1.75, color: "#2E2F33" }}
                      dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(jobDetailDialog.job.description) }}
                    />
                  ) : (
                    <p style={{ fontSize: "15px", lineHeight: 1.75, color: "#2E2F33", whiteSpace: "pre-wrap" }}>{jobDetailDialog.job.description}</p>
                  )}
                </div>
              )}

              {/* Requirements */}
              {jobDetailDialog.job.requirements && (
                <div style={{ marginBottom: "24px" }}>
                  <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: THEME.red, marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                    Requirements
                    <span style={{ flex: 1, height: "1px", background: "#E2E1DE" }} />
                  </p>
                  {isHtmlContent(jobDetailDialog.job.requirements) ? (
                    <div
                      className="prose prose-sm max-w-none"
                      style={{ fontSize: "15px", lineHeight: 1.75, color: "#2E2F33" }}
                      dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(jobDetailDialog.job.requirements) }}
                    />
                  ) : (
                    <p style={{ fontSize: "15px", lineHeight: 1.75, color: "#2E2F33", whiteSpace: "pre-wrap" }}>{jobDetailDialog.job.requirements}</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div style={{ padding: "20px 32px 28px", borderTop: "1px solid #E2E1DE", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "#fff", borderRadius: "0 0 16px 16px" }}>
              <button
                onClick={() => setJobDetailDialog({ open: false, job: null })}
                style={{ background: "transparent", border: "2px solid #E2E1DE", borderRadius: "8px", padding: "11px 22px", fontWeight: 700, fontSize: "14px", color: "#3E4044", cursor: "pointer", fontFamily: "inherit", transition: "border-color .15s, color .15s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.black; el.style.color = THEME.black; }}
                onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#E2E1DE"; el.style.color = "#3E4044"; }}
              >Close</button>
              <button
                onClick={() => { setApplyDialog({ open: true, job: jobDetailDialog.job }); setJobDetailDialog({ open: false, job: null }); }}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: THEME.black, color: THEME.paper, border: "none", borderRadius: "8px", padding: "12px 26px", fontWeight: 700, fontSize: "15px", cursor: "pointer", fontFamily: "inherit", letterSpacing: ".01em", transition: "background .15s, transform .15s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = THEME.red; el.style.transform = "translateY(-2px)"; }}
                onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = THEME.black; el.style.transform = "none"; }}
              >Apply for this position →</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== APPLY MODAL ========== */}
      {applyDialog.open && applyDialog.job && (

        <div
          style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => setApplyDialog({ open: false, job: null })}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(30,32,38,.55)", backdropFilter: "blur(4px)" }} />
          <div
            style={{ position: "relative", width: "min(640px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: THEME.paper, borderRadius: "16px", boxShadow: "0 30px 80px rgba(0,0,0,.4)", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header band */}
            <div style={{ background: "#23262D", color: "#C7C9CC", padding: "24px 32px 22px", borderRadius: "16px 16px 0 0", borderTop: `5px solid ${THEME.red}`, position: "sticky", top: 0, zIndex: 2 }}>
              <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: THEME.red, marginBottom: "8px" }}>Application</p>
              <h2 style={{ fontFamily: "'Overpass',sans-serif", fontWeight: 900, fontSize: "clamp(18px,2.8vw,24px)", letterSpacing: "-.02em", lineHeight: 1.2, color: "#fff", marginBottom: "10px" }}>
                {applyDialog.job.title}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {[applyDialog.job.department, applyDialog.job.location].filter(Boolean).map(chip => (
                  <span key={chip} style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "10.5px", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.6)", border: "1.5px solid rgba(255,255,255,.18)", borderRadius: "5px", padding: "4px 10px", background: "rgba(255,255,255,.05)" }}>{chip}</span>
                ))}
              </div>
              <button
                onClick={() => setApplyDialog({ open: false, job: null })}
                style={{ position: "absolute", top: "18px", right: "18px", background: "rgba(255,255,255,.12)", border: "none", borderRadius: "9px", width: "34px", height: "34px", fontSize: "15px", color: "#DDDFE3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = THEME.red; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)"; (e.currentTarget as HTMLElement).style.color = "#DDDFE3"; }}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Form body */}
            <div style={{ padding: "28px 32px", flex: 1 }}>
              {formConfig ? (
                formConfig.sections.map((section) => {
                  if (section.repeatable) {
                    return (
                      <RepeatableSectionBlock
                        key={section.id}
                        section={section}
                        entries={repeatableEntries[section.id] ?? []}
                        onChange={(entries) =>
                          setRepeatableEntries((prev) => ({ ...prev, [section.id]: entries }))
                        }
                        theme={THEME}
                      />
                    );
                  }
                  return (
                    <div key={section.id} style={{ marginBottom: "24px" }}>
                      {!section.system && (
                        <div style={{ marginBottom: "16px", paddingTop: "16px", borderTop: "1.5px solid #E2E1DE" }}>
                          <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: THEME.black, marginBottom: "4px" }}>{section.title}</p>
                          {section.description && <p style={{ fontSize: "13px", color: "#84868B", marginTop: "2px" }}>{section.description}</p>}
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {section.fields.map((field: FormField) => (
                          <DynamicField
                            key={field.id}
                            field={field}
                            form={form}
                            customAnswers={customAnswers}
                            resumeData={resumeData}
                            onFormChange={(key, val) => setForm((f) => ({ ...f, [key]: val }))}
                            onCustomChange={(id, val) => setCustomAnswers((a) => ({ ...a, [id]: val }))}
                            onResumeChange={handleResumeChange}
                            onResumeClear={() => setResumeData(null)}
                            theme={THEME}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Fallback skeleton */
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#4A4B50", marginBottom: "6px" }}>First Name *</label>
                      <input value={form.firstName ?? ""} onChange={e => setForm({ ...form, firstName: e.target.value })}
                        style={{ width: "100%", fontFamily: "'Overpass',sans-serif", fontSize: "15px", padding: "12px 14px", border: "1.5px solid #E2E1DE", borderRadius: "8px", background: "#fff", color: THEME.ink, outline: "none", boxSizing: "border-box" }}
                        onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = THEME.red; }}
                        onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E1DE"; }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#4A4B50", marginBottom: "6px" }}>Last Name *</label>
                      <input value={form.lastName ?? ""} onChange={e => setForm({ ...form, lastName: e.target.value })}
                        style={{ width: "100%", fontFamily: "'Overpass',sans-serif", fontSize: "15px", padding: "12px 14px", border: "1.5px solid #E2E1DE", borderRadius: "8px", background: "#fff", color: THEME.ink, outline: "none", boxSizing: "border-box" }}
                        onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = THEME.red; }}
                        onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E1DE"; }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#4A4B50", marginBottom: "6px" }}>Email *</label>
                    <input type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })}
                      style={{ width: "100%", fontFamily: "'Overpass',sans-serif", fontSize: "15px", padding: "12px 14px", border: "1.5px solid #E2E1DE", borderRadius: "8px", background: "#fff", color: THEME.ink, outline: "none", boxSizing: "border-box" }}
                      onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = THEME.red; }}
                      onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E1DE"; }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "'Overpass Mono',monospace", fontSize: "11px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#4A4B50", marginBottom: "6px" }}>Resume / CV *</label>
                    <label
                      style={{ display: "block", border: "2px dashed #E2E1DE", borderRadius: "10px", padding: "28px", textAlign: "center", cursor: "pointer", transition: "border-color .15s, background .15s", background: "#fff" }}
                      onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.black; el.style.background = "#F8F8F6"; }}
                      onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#E2E1DE"; el.style.background = "#fff"; }}
                    >
                      {resumeData ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                          <FileText style={{ color: THEME.red, width: 20, height: 20 }} />
                          <span style={{ fontWeight: 700, color: THEME.ink, fontSize: "14px" }}>{resumeData.filename}</span>
                          <button type="button" onClick={e => { e.preventDefault(); setResumeData(null); }}
                            style={{ background: "none", border: "1.5px solid #E2E1DE", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", color: "#84868B", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                        </div>
                      ) : (
                        <>
                          <Upload style={{ color: "#84868B", width: 28, height: 28, margin: "0 auto 10px" }} />
                          <p style={{ fontFamily: "'Overpass Mono',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: ".06em", color: "#84868B" }}>CLICK TO UPLOAD PDF · MAX 5 MB</p>
                          <input type="file" accept=".pdf" style={{ display: "none" }} onChange={handleResumeChange} />
                        </>
                      )}
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "20px 32px 28px", borderTop: "1px solid #E2E1DE", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "#fff", borderRadius: "0 0 16px 16px" }}>
              <button
                onClick={() => setApplyDialog({ open: false, job: null })}
                style={{ background: "transparent", border: "2px solid #E2E1DE", borderRadius: "8px", padding: "11px 22px", fontWeight: 700, fontSize: "14px", color: "#3E4044", cursor: "pointer", fontFamily: "inherit", transition: "border-color .15s, color .15s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = THEME.black; el.style.color = THEME.black; }}
                onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#E2E1DE"; el.style.color = "#3E4044"; }}
              >Cancel</button>
              <button
                onClick={handleApply}
                disabled={loading}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: loading ? "#84868B" : THEME.black, color: THEME.paper, border: "none", borderRadius: "8px", padding: "12px 28px", fontWeight: 700, fontSize: "15px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: ".01em", transition: "background .15s, transform .15s" }}
                onMouseOver={e => { if (!loading) { const el = e.currentTarget as HTMLElement; el.style.background = THEME.red; el.style.transform = "translateY(-2px)"; } }}
                onMouseOut={e => { if (!loading) { const el = e.currentTarget as HTMLElement; el.style.background = THEME.black; el.style.transform = "none"; } }}
              >{loading ? "Submitting…" : "Submit Application →"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

