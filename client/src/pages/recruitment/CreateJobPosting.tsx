import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmployeeMultiSelect } from "@/components/EmployeeSelect";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useParams, useSearch } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapPlaceholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold, Italic, List, ListOrdered, ArrowLeft, X, FileText, ClipboardList,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from "lucide-react";
import { ApplicationFormBuilderCore, DEFAULT_FORM_CONFIG, type FormConfig } from "@/components/ApplicationFormBuilderCore";

// ── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: "USD", label: "USD – US Dollar" },
  { code: "EUR", label: "EUR – Euro" },
  { code: "GBP", label: "GBP – British Pound" },
  { code: "AED", label: "AED – UAE Dirham" },
  { code: "PKR", label: "PKR – Pakistani Rupee" },
  { code: "INR", label: "INR – Indian Rupee" },
  { code: "SAR", label: "SAR – Saudi Riyal" },
  { code: "QAR", label: "QAR – Qatari Riyal" },
  { code: "OMR", label: "OMR – Omani Rial" },
  { code: "BHD", label: "BHD – Bahraini Dinar" },
  { code: "KWD", label: "KWD – Kuwaiti Dinar" },
  { code: "SGD", label: "SGD – Singapore Dollar" },
  { code: "CAD", label: "CAD – Canadian Dollar" },
  { code: "AUD", label: "AUD – Australian Dollar" },
];

const EXPERIENCE_LEVELS = [
  "Internship",
  "Entry Level",
  "Associate",
  "Mid-Senior Level",
  "Director",
  "President / C-Level",
];

const EMPLOYMENT_TYPES = [
  { value: "full_time",  label: "Full Time" },
  { value: "part_time",  label: "Part Time" },
  { value: "contract",   label: "Contract" },
  { value: "intern",     label: "Internship" },
  { value: "freelance",  label: "Freelance" },
];

// ── Skills tag-input ──────────────────────────────────────────────────────────

function SkillsTagInput({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [input, setInput] = useState("");
  const commit = (raw: string) => {
    const t = raw.trim();
    if (!t || skills.map((s) => s.toLowerCase()).includes(t.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...skills, t]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background min-h-[42px] px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text">
      {skills.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
          {s}
          <button type="button" onClick={() => onChange(skills.filter((x) => x !== s))} className="ml-0.5 rounded-sm opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(input); }
          else if (e.key === "Backspace" && !input && skills.length) onChange(skills.slice(0, -1));
        }}
        onBlur={() => input.trim() && commit(input)}
        placeholder={skills.length === 0 ? "Search/Add skill — press Enter or comma" : "Add more…"}
        className="flex-1 min-w-[200px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
      />
    </div>
  );
}

// ── Rich-text editor ──────────────────────────────────────────────────────────

function JobDescriptionEditor({
  value,
  onChange,
  remountKey,
}: {
  value: string;
  onChange: (html: string) => void;
  remountKey: string | number;
}) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, horizontalRule: false }),
        TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
        TiptapPlaceholder.configure({ placeholder: "Describe the role, responsibilities, and what success looks like…" }),
      ],
      content: value?.trim() ? value : "<p></p>",
      editorProps: {
        attributes: {
          class:
            "tiptap-email-prose focus:outline-none min-h-[400px] max-w-none w-full min-w-0 px-5 py-4 text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]",
        },
      },
      onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    },
    [remountKey],
  );
  if (!editor) return <div className="min-h-[400px] rounded-md border border-input bg-muted/40 animate-pulse" />;

  const btn = (label: string, active: boolean, action: () => void, icon: React.ReactNode) => (
    <Button key={label} type="button" variant={active ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={action} aria-label={label}>
      {icon}
    </Button>
  );

  return (
    <div className="w-full min-w-0 rounded-lg border border-input bg-background overflow-hidden shadow-sm">
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-muted/40 px-3 py-2">
        {btn("Bold",         editor.isActive("bold"),        () => editor.chain().focus().toggleBold().run(),        <Bold className="h-4 w-4" />)}
        {btn("Italic",       editor.isActive("italic"),      () => editor.chain().focus().toggleItalic().run(),      <Italic className="h-4 w-4" />)}
        {btn("Bullet list",  editor.isActive("bulletList"),  () => editor.chain().focus().toggleBulletList().run(),  <List className="h-4 w-4" />)}
        {btn("Ordered list", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />)}
        {btn("H2",           editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <span className="text-xs font-bold">H2</span>)}
        {btn("H3",           editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span className="text-xs font-bold">H3</span>)}
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        {btn("Align left",    editor.isActive({ textAlign: "left" }),    () => editor.chain().focus().setTextAlign("left").run(),    <AlignLeft className="h-4 w-4" />)}
        {btn("Align center",  editor.isActive({ textAlign: "center" }),  () => editor.chain().focus().setTextAlign("center").run(),  <AlignCenter className="h-4 w-4" />)}
        {btn("Align right",   editor.isActive({ textAlign: "right" }),   () => editor.chain().focus().setTextAlign("right").run(),   <AlignRight className="h-4 w-4" />)}
        {btn("Justify",       editor.isActive({ textAlign: "justify" }), () => editor.chain().focus().setTextAlign("justify").run(), <AlignJustify className="h-4 w-4" />)}
      </div>
      <EditorContent
        editor={editor}
        className="min-h-[400px] max-h-[min(72vh,720px)] min-w-0 w-full overflow-x-hidden overflow-y-auto [&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:max-w-none [&_.ProseMirror]:w-full [&_.ProseMirror]:min-w-0 [&_.ProseMirror]:break-words [&_.ProseMirror]:[overflow-wrap:anywhere] [&_.ProseMirror]:[word-break:break-word]"
      />
    </div>
  );
}

// ── Empty form defaults ───────────────────────────────────────────────────────

function emptyForm() {
  return {
    title: "",
    department: "",
    location: "",
    employmentType: "full_time",
    description: "",
    salaryRangeMin: "",
    salaryRangeMax: "",
    salaryCurrency: "USD",
    headcount: "1",
    recruiterUserIds: [] as string[],
    limitedRecruiterUserIds: [] as string[],
    hiringManagerIds: [] as string[],
    status: "draft",
    publishedChannels: ["career_page"] as string[],
    experienceLevel: "",
    remote: false,
    allowEmployeesApply: false,
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPosting() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const search = useSearch();
  const queryClient = useQueryClient();

  // Route context
  const editId = params.id ?? null;
  const searchParams = new URLSearchParams(search);
  const duplicateFromId = searchParams.get("duplicateFrom");
  const isEdit = !!editId;
  const isDuplicate = !isEdit && !!duplicateFromId;

  // Tab
  const [activeTab, setActiveTab] = useState<"details" | "form">("details");

  // Form state
  const [form, setForm] = useState(emptyForm());
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // Application form config (per-job)
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [formConfigDirty, setFormConfigDirty] = useState(false);
  const [savingFormConfig, setSavingFormConfig] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const sourceId = editId ?? duplicateFromId ?? null;

  const { data: sourceJob, isPending: sourceJobPending, isError: sourceJobError } = useQuery<any>({
    queryKey: ["/api/recruitment/jobs", sourceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/jobs/${sourceId!}`);
      if (!res.ok) throw new Error("Failed to load job");
      return res.json();
    },
    enabled: !!sourceId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: branchesEnvelope, isPending: branchesPending } = useQuery<{
    success?: boolean;
    data?: { branches: Array<{ id: string; name: string }> };
  }>({
    queryKey: ["/api/departments/branches"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments/branches");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const branches = branchesEnvelope?.data?.branches ?? [];

  const { data: departmentsData, isPending: departmentsPending } = useQuery<{ departments: string[] }>({
    queryKey: ["/api/employees/departments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/employees/departments");
      if (!res.ok) throw new Error("Failed to load departments");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const departments = departmentsData?.departments ?? [];

  const { data: assignableData } = useQuery<any[]>({
    queryKey: ["/api/recruitment/assignable-users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/recruitment/assignable-users");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const assignableUsersLoaded = !!assignableData;
  const assignableUsers: any[] = assignableData ?? [];

  // Map legacy employee ids → user ids; drop deleted users so save does not hit FK errors.
  useEffect(() => {
    if (!assignableUsersLoaded || assignableUsers.length === 0) return;
    const toUserId = (id: string): string | null => {
      if (!id) return null;
      const u = assignableUsers.find((x: any) => x.id === id || x.employee_id === id);
      return u?.id ?? null;
    };
    const normalize = (ids: string[]) => [...new Set(ids.map(toUserId).filter((x): x is string => !!x))];
    setForm((f) => {
      const recruiterUserIds = normalize(f.recruiterUserIds);
      const limitedRecruiterUserIds = normalize(f.limitedRecruiterUserIds);
      const hiringManagerIds = normalize(f.hiringManagerIds);
      if (
        recruiterUserIds.join() === f.recruiterUserIds.join() &&
        limitedRecruiterUserIds.join() === f.limitedRecruiterUserIds.join() &&
        hiringManagerIds.join() === f.hiringManagerIds.join()
      ) {
        return f;
      }
      return { ...f, recruiterUserIds, limitedRecruiterUserIds, hiringManagerIds };
    });
  }, [assignableUsersLoaded, assignableUsers]);

  // ── Populate form from source job ─────────────────────────────────────────

  useEffect(() => {
    if (!sourceJob) return;
    const channels = Array.isArray(sourceJob.published_channels) && sourceJob.published_channels.length > 0
      ? sourceJob.published_channels as string[]
      : ["career_page"];

    const populated = {
      title: isEdit ? (sourceJob.title || "") : `${(sourceJob.title || "Job").trim()} (Copy)`,
      department: sourceJob.department || "",
      location: sourceJob.location || "",
      employmentType: sourceJob.employment_type || "full_time",
      description: sourceJob.description || "",
      salaryRangeMin: sourceJob.salary_range_min || "",
      salaryRangeMax: sourceJob.salary_range_max || "",
      salaryCurrency: sourceJob.salary_currency || "USD",
      headcount: (sourceJob.headcount ?? 1).toString(),
      recruiterUserIds: (sourceJob.recruiter_user_ids || []) as string[],
      limitedRecruiterUserIds: (sourceJob.limited_recruiter_user_ids || []) as string[],
      // job_assignments only — never hm_ids (legacy employee ids break job_assignments FK)
      hiringManagerIds: (sourceJob.hiring_manager_user_ids || []) as string[],
      status: isEdit ? (sourceJob.status || "draft") : "draft",
      publishedChannels: channels,
      experienceLevel: sourceJob.experience_level || "",
      remote: sourceJob.remote ?? false,
      allowEmployeesApply: channels.includes("internal"),
    };
    setForm(populated);

    const raw = sourceJob.requirements || "";
    setSkills(raw ? String(raw).split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setEditorKey((k) => k + 1);
  }, [sourceJob, isEdit]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const deptTrim = form.department?.trim() ?? "";
  const departmentNotInList = !!deptTrim && departments.length > 0 && !departments.includes(deptTrim);
  const departmentSelectValue = deptTrim || "__none__";

  const legacyLocation = form.location?.trim() && !branches.some((b) => b.name === form.location.trim())
    ? form.location.trim()
    : null;
  const locationSelectValue = form.location?.trim() ? form.location.trim() : "__none__";

  const toEmpOption = (u: any) => ({
    id: u.id,
    first_name: u.first_name || (u.display_name ? String(u.display_name).split(" ")[0] : u.email),
    last_name: u.last_name || "",
    work_email: u.email,
    department: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles.join(", ") : u.role,
  });

  /** Include users already selected on the job even if they no longer match the role filter (so labels + list stay in sync). */
  function mergeRoleOptions(
    filtered: ReturnType<typeof toEmpOption>[],
    selectedIds: string[],
  ) {
    const seen = new Set(filtered.map((o) => o.id));
    const extra = selectedIds
      .filter((id) => id && !seen.has(id))
      .map((id) => {
        const byUserId = assignableUsers.find((x: any) => x.id === id);
        if (byUserId) return toEmpOption(byUserId);
        const byEmployeeId = assignableUsers.find((x: any) => x.employee_id === id);
        if (byEmployeeId) return toEmpOption(byEmployeeId);
        return null;
      })
      .filter((o): o is ReturnType<typeof toEmpOption> => o != null);
    return [...filtered, ...extra];
  }

  // Pass `undefined` while assignableUsers hasn't loaded yet so EmployeeMultiSelect
  // doesn't fall back to /api/employees (which returns employee IDs, not user IDs).
  const recruiterOptions = useMemo(() => {
    if (!assignableUsersLoaded) return undefined;
    const filtered = assignableUsers
      .filter((u) => new Set<string>([u.role, ...(Array.isArray(u.roles) ? u.roles : [])]).has("recruiter"))
      .map(toEmpOption);
    return mergeRoleOptions(filtered, form.recruiterUserIds);
  }, [assignableUsersLoaded, assignableUsers, form.recruiterUserIds]);

  const limitedRecruiterOptions = useMemo(() => {
    if (!assignableUsersLoaded) return undefined;
    const filtered = assignableUsers
      .filter((u) => new Set<string>([u.role, ...(Array.isArray(u.roles) ? u.roles : [])]).has("limited_recruiter"))
      .map(toEmpOption);
    return mergeRoleOptions(filtered, form.limitedRecruiterUserIds);
  }, [assignableUsersLoaded, assignableUsers, form.limitedRecruiterUserIds]);

  const hiringManagerOptions = useMemo(() => {
    if (!assignableUsersLoaded) return undefined;
    const filtered = assignableUsers
      .filter((u) => {
        const rs = new Set<string>([u.role, ...(Array.isArray(u.roles) ? u.roles : [])]);
        return rs.has("hiring_manager") || rs.has("manager");
      })
      .map(toEmpOption);
    return mergeRoleOptions(filtered, form.hiringManagerIds);
  }, [assignableUsersLoaded, assignableUsers, form.hiringManagerIds]);

  // Fetch job-specific form config (edit mode) or global default (create mode)
  const formConfigUrl = editId
    ? `/api/recruitment/jobs/${editId}/application-form`
    : "/api/recruitment/application-form";

  const { data: fetchedFormConfig } = useQuery<FormConfig>({
    queryKey: [formConfigUrl],
    queryFn: async () => {
      const res = await fetch(formConfigUrl);
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (fetchedFormConfig && !formConfigDirty) {
      setFormConfig(fetchedFormConfig.sections?.length ? fetchedFormConfig : DEFAULT_FORM_CONFIG);
    }
  }, [fetchedFormConfig, formConfigDirty]);

  const isReady = !sourceId || !!sourceJob;
  const isBusy = loading || (!!sourceId && sourceJobPending && !sourceJob);

  /** After cancel / back: return to job detail when editing; otherwise recruitment list */
  const exitEditor = () => {
    if (isEdit && editId) setLocation(`/recruitment/jobs/${editId}`);
    else setLocation("/recruitment/jobs");
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async (overrideStatus?: string) => {
    if (!form.title.trim()) { toast.error("Job title is required"); return; }
    if (!form.department.trim()) { toast.error("Department is required"); return; }
    if (isEdit && form.recruiterUserIds.length + form.limitedRecruiterUserIds.length === 0) {
      toast.error("At least one recruiter is required");
      return;
    }
    setLoading(true);
    try {
      const channels = form.publishedChannels.filter((c) => c !== "internal");
      if (form.allowEmployeesApply && !channels.includes("internal")) channels.push("internal");

      const payload = {
        ...form,
        status: overrideStatus ?? form.status,
        requirements: skills.join(", "),
        headcount: parseInt(form.headcount) || 1,
        salaryRangeMin: form.salaryRangeMin ? parseFloat(form.salaryRangeMin) : null,
        salaryRangeMax: form.salaryRangeMax ? parseFloat(form.salaryRangeMax) : null,
        recruiterUserIds: form.recruiterUserIds,
        limitedRecruiterUserIds: form.limitedRecruiterUserIds,
        hiringManagerUserIds: form.hiringManagerIds,
        // hiringManagerIds JSONB stores user IDs for multi-HM support (no FK constraint)
        hiringManagerIds: form.hiringManagerIds.length > 0 ? form.hiringManagerIds : null,
        // DO NOT send hiringManagerId — that legacy column has a FK to employees.id,
        // and our selection contains user IDs. The repo defaults it to null for UI-created jobs.
        hiringManagerId: null,
        publishedChannels: channels,
        experienceLevel: form.experienceLevel || null,
        remote: form.remote,
      };

      let nextJobId: string | undefined;

      if (isEdit && editId) {
        await apiRequest("PATCH", `/api/recruitment/jobs/${editId}`, payload);
        // Save per-job form config if modified
        if (formConfigDirty && formConfig) {
          await apiRequest("PUT", `/api/recruitment/jobs/${editId}/application-form`, { config: formConfig });
          setFormConfigDirty(false);
        }
        toast.success(overrideStatus === "published" ? "Job published!" : "Job updated");
        nextJobId = editId;
      } else {
        const created = await apiRequest("POST", "/api/recruitment/jobs", payload);
        const createdJob = await created.json();
        nextJobId = createdJob?.id;
        // Save per-job form config if the user customised it
        if (formConfigDirty && formConfig && createdJob?.id) {
          await apiRequest("PUT", `/api/recruitment/jobs/${createdJob.id}/application-form`, { config: formConfig });
          setFormConfigDirty(false);
        }
        toast.success(
          overrideStatus === "published"
            ? "Job posted and published!"
            : isDuplicate
              ? "Job copy saved as draft"
              : "Job saved as draft"
        );
      }

      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs/filter-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      if (nextJobId) {
        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs", nextJobId] });
        setLocation(`/recruitment/jobs/${nextJobId}`);
      } else {
        setLocation("/recruitment/jobs");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save job");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const pageTitle = isEdit ? "Edit Job Posting" : isDuplicate ? "Duplicate Job Posting" : "Create Job Posting";

  return (
    <Layout>
      <div className="flex h-full flex-col">

        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            {/* Back + breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => exitEditor()}
                aria-label={isEdit ? "Back to job" : "Back to Recruitment"}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  Recruitment / {pageTitle}
                </p>
                <h1 className="text-lg font-semibold leading-tight truncate">
                  {pageTitle}
                </h1>
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" onClick={() => exitEditor()} disabled={isBusy}>
                Cancel
              </Button>
              {isEdit ? (
                <Button onClick={() => handleSave()} disabled={isBusy}>
                  {loading ? "Saving…" : "Save changes"}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => handleSave("draft")} disabled={isBusy}>
                    {loading ? "Saving…" : "Save as Draft"}
                  </Button>
                  <Button
                    className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
                    onClick={() => handleSave("published")}
                    disabled={isBusy}
                  >
                    {loading ? "Publishing…" : "Publish"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="border-b border-border bg-background px-6">
          <div className="mx-auto max-w-4xl flex gap-0">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "details"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" />
              Job Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("form")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "form"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              Application Form
              {formConfigDirty && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-orange-500" title="Unsaved changes" />
              )}
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <ScrollArea className="min-w-0 flex-1">
          <div className="mx-auto min-w-0 max-w-7xl px-6 py-8">

            {/* Error / loading states */}
            {sourceId && sourceJobError && (
              <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Could not load job details. Go back and try again.
              </div>
            )}

            {/* ── APPLICATION FORM TAB ── */}
            {activeTab === "form" && (
              <div>
                {!isEdit && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                    Save the job first to persist the custom form. You can also save the form config independently once the job is created.
                  </div>
                )}
                <ApplicationFormBuilderCore
                  config={formConfig ?? DEFAULT_FORM_CONFIG}
                  onChange={(c) => { setFormConfig(c); setFormConfigDirty(true); }}
                  saving={savingFormConfig}
                  onSave={isEdit && editId ? async () => {
                    if (!formConfig) return;
                    setSavingFormConfig(true);
                    try {
                      await apiRequest("PUT", `/api/recruitment/jobs/${editId}/application-form`, { config: formConfig });
                      setFormConfigDirty(false);
                      queryClient.invalidateQueries({ queryKey: [`/api/recruitment/jobs/${editId}/application-form`] });
                      toast.success("Application form saved");
                    } catch (e: any) {
                      toast.error(e?.message || "Failed to save form");
                    } finally {
                      setSavingFormConfig(false);
                    }
                  } : undefined}
                  onReset={() => {
                    if (!confirm("Reset this job's application form to the default?")) return;
                    setFormConfig(DEFAULT_FORM_CONFIG);
                    setFormConfigDirty(true);
                    toast.info("Reset to default — save to apply");
                  }}
                  compact
                />
              </div>
            )}

            {/* Two-column layout: main form left, team sidebar right */}
            {activeTab === "details" && <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">

              {/* ── LEFT: primary fields ── */}
              <div className="min-w-0 space-y-8">

                {/* Title */}
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground font-medium">What's the job you're hiring for?</p>
                  <input
                    className="w-full bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground/50 border-b-2 border-transparent focus:border-primary transition-colors pb-1"
                    placeholder="Job title…"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    autoFocus
                  />
                </div>

                {/* Department + Job Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Department <span className="text-destructive">*</span>
                    </Label>
                    {departments.length > 0 ? (
                      <Select
                        value={departmentSelectValue}
                        onValueChange={(v) => setForm({ ...form, department: v === "__none__" ? "" : v })}
                        disabled={departmentsPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={departmentsPending ? "Loading…" : "Select department"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select department</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                          {departmentNotInList && (
                            <SelectItem value={deptTrim}>{deptTrim} (legacy)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                        placeholder={departmentsPending ? "Loading…" : "e.g. Engineering"}
                        disabled={departmentsPending}
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {departments.length > 0
                        ? "From your org structure departments."
                        : "Add departments under Org Structure, or type a name."}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Job Type</Label>
                    <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Location + Remote */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Location</Label>
                  <div className="flex items-center gap-3">
                    <Select
                      value={locationSelectValue}
                      onValueChange={(v) => setForm({ ...form, location: v === "__none__" ? "" : v })}
                      disabled={branchesPending}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue
                          placeholder={
                            branchesPending
                              ? "Loading branches…"
                              : branches.length
                                ? "Select branch / location"
                                : "No branches — add under Org Structure"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not specified</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                        ))}
                        {legacyLocation && (
                          <SelectItem value={legacyLocation}>{legacyLocation} (legacy)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium hover:bg-muted/70 select-none whitespace-nowrap">
                      <Checkbox
                        checked={form.remote ?? false}
                        onCheckedChange={(c) => setForm({ ...form, remote: !!c })}
                      />
                      Mark as Remote Job
                    </label>
                  </div>
                </div>

                {/* Job Description — full content width of the form column */}
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-medium">
                    Job Description <span className="text-destructive">*</span>
                  </Label>
                  {isReady ? (
                    <JobDescriptionEditor
                      value={form.description}
                      onChange={(html) => setForm((f) => ({ ...f, description: html }))}
                      remountKey={editorKey}
                    />
                  ) : (
                    <div className="min-h-[400px] animate-pulse rounded-lg border border-input bg-muted/40" />
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] font-bold">i</span>
                    Videos and images embedded will not be displayed on any job board.
                  </p>
                </div>

                {/* Skills + Experience */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Skills</Label>
                    <SkillsTagInput skills={skills} onChange={setSkills} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Experience</Label>
                    <Select
                      value={form.experienceLevel || "__none__"}
                      onValueChange={(v) => setForm({ ...form, experienceLevel: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not specified</SelectItem>
                        {EXPERIENCE_LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Salary */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Salary Range</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Min</p>
                      <Input
                        type="number" min="0" placeholder="0"
                        value={form.salaryRangeMin}
                        onChange={(e) => setForm({ ...form, salaryRangeMin: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Max</p>
                      <Input
                        type="number" min="0" placeholder="0"
                        value={form.salaryRangeMax}
                        onChange={(e) => setForm({ ...form, salaryRangeMax: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Currency</p>
                      <Select value={form.salaryCurrency} onValueChange={(v) => setForm({ ...form, salaryCurrency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                          ))}
                          {form.salaryCurrency && !CURRENCIES.find((c) => c.code === form.salaryCurrency) && (
                            <SelectItem value={form.salaryCurrency}>{form.salaryCurrency}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Allow employees to apply */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Allow employees to apply</p>
                    <p className="text-xs text-muted-foreground">Makes this job visible on the internal portal for current employees</p>
                  </div>
                  <Switch
                    checked={form.allowEmployeesApply}
                    onCheckedChange={(c) => setForm({ ...form, allowEmployeesApply: c })}
                  />
                </div>

              </div>

              {/* ── RIGHT: Team & Settings sidebar ── */}
              <div className="space-y-6">

                {/* Team card */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Team &amp; Headcount</h3>
                    {!assignableUsersLoaded && (
                      <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Recruiters{isEdit ? <span className="text-destructive"> *</span> : null}
                    </Label>
                    <EmployeeMultiSelect
                      value={form.recruiterUserIds}
                      onChange={(ids) => setForm({ ...form, recruiterUserIds: ids })}
                      employees={recruiterOptions}
                      placeholder={assignableUsersLoaded ? "Select recruiter(s)…" : "Loading…"}
                      disabled={!assignableUsersLoaded}
                    />
                    {!isEdit && (
                      <p className="text-xs text-muted-foreground">You are added as default on create.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Limited Recruiters</Label>
                    <EmployeeMultiSelect
                      value={form.limitedRecruiterUserIds}
                      onChange={(ids) => setForm({ ...form, limitedRecruiterUserIds: ids })}
                      employees={limitedRecruiterOptions}
                      placeholder={assignableUsersLoaded ? "Select limited recruiter(s)…" : "Loading…"}
                      disabled={!assignableUsersLoaded}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Hiring Managers</Label>
                    <EmployeeMultiSelect
                      value={form.hiringManagerIds}
                      onChange={(ids) => setForm({ ...form, hiringManagerIds: ids })}
                      employees={hiringManagerOptions}
                      placeholder={assignableUsersLoaded ? "Select hiring manager(s)…" : "Loading…"}
                      disabled={!assignableUsersLoaded}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Open Headcount</Label>
                    <Input
                      type="number" min="1"
                      value={form.headcount}
                      onChange={(e) => setForm({ ...form, headcount: e.target.value })}
                    />
                  </div>
                </div>

                {/* Status card (edit only) */}
                {isEdit && (
                  <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground">Status</h3>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="paused">On Hold</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Info card */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tips</p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                    <li>Use H2/H3 headings in the description to structure sections.</li>
                    <li>Skills are comma-separated tags — press Enter to add each one.</li>
                    <li>"Save as Draft" keeps the job private; "Publish" makes it live on the career page.</li>
                    <li>You can always edit status, description, and team after saving.</li>
                  </ul>
                </div>

              </div>
            </div>}

          </div>
        </ScrollArea>

        {/* ── STICKY MOBILE FOOTER ── */}
        <div className="lg:hidden shrink-0 border-t border-border bg-background px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => exitEditor()} disabled={isBusy}>
              Cancel
            </Button>
            {isEdit ? (
              <Button onClick={() => handleSave()} disabled={isBusy}>
                {loading ? "Saving…" : "Save changes"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => handleSave("draft")} disabled={isBusy}>
                  {loading ? "Saving…" : "Save as Draft"}
                </Button>
                <Button
                  className="bg-teal-600 text-white hover:bg-teal-700"
                  onClick={() => handleSave("published")}
                  disabled={isBusy}
                >
                  {loading ? "Publishing…" : "Publish"}
                </Button>
              </>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
