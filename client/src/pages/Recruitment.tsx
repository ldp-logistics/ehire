import Layout from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Search, Briefcase, MapPin, Clock, Users, FileText, Eye, Download, Trash2, Pencil,
  ArrowRight, Send, CheckCircle, XCircle, UserPlus, BarChart3, Building2,
  Linkedin, ExternalLink, Copy, CopyPlus, Upload, AlertTriangle, Ban,
  Link2, MailCheck, RefreshCw, Sparkles, FileEdit, LayoutGrid, List, GripVertical, X, CloudDownload,
  Mail, Phone, Paperclip, Star, CalendarClock, RotateCcw, ChevronDown, Inbox, Reply,
  Globe, Lock, PauseCircle, MoreVertical, ChevronRight, Archive, MessageSquare, Activity, UserCheck,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback, type ComponentType, type MouseEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { apiRequest, withRegionView } from "@/lib/queryClient";
import { cn, sanitizeJobHtml, isHtmlContent } from "@/lib/utils";
import { Link, useLocation, useSearch } from "wouter";
import { EmployeeSelect, EmployeeMultiSelect } from "@/components/EmployeeSelect";
import { LinkedInPostModal } from "@/components/recruitment/LinkedInPostModal";
import { InterviewsTab } from "@/components/recruitment/InterviewsTab";
import { JobRecordAudit } from "@/components/recruitment/JobRecordAudit";
import { MakeOfferDialog } from "@/components/recruitment/MakeOfferDialog";
import { ApplicationRatingStars } from "@/components/recruitment/ApplicationRatingStars";
import { ApplicantSummarySidebar } from "@/components/recruitment/applicant/ApplicantSummarySidebar";
import { ApplicantPipelineTabBar, type ApplicantPipelineTabId } from "@/components/recruitment/applicant/ApplicantPipelineTabBar";
import { ApplicantSummaryTabPanels } from "@/components/recruitment/applicant/ApplicantSummaryTabPanels";
import { ApplicationComments } from "@/components/recruitment/ApplicationComments";
import { ApplicationAnswers } from "@/components/recruitment/ApplicationAnswers";
import { SimpleEmailBodyEditor } from "@/components/recruitment/SimpleEmailBodyEditor";
import { bodyTemplateToEditorHtml } from "@/lib/emailTemplateEditor";
import { extractRejectionTeamComment } from "@/lib/rejectionPipelineDisplay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { formatCalendarYmdInTz, formatDateTimeDisplay, formatLeaveDisplayDate, formatTimeOnlyDisplay } from "@/lib/dateUtils";
import { formatDepartmentWithJob } from "@/lib/recruitmentDisplay";
import {
  ApplicationFormFill,
  APPLICATION_FORM_EMPTY,
  buildCandidatePayloadFromForm,
  buildCustomAnswersPayload,
  getCoverLetterFromForm,
  validateApplicationFormFill,
} from "@/components/ApplicationFormFill";
import type { FormConfig } from "@/components/ApplicationFormBuilderCore";

function formatRecruitmentDate(dateStr: string | null, tz?: string | null, df?: string | null) {
  if (!dateStr) return "-";
  return formatLeaveDisplayDate(dateStr, tz ?? null, df ?? null);
}

type OfferEmailPresetPayload = { subject: string; body: string; offerId: string; offerStatus: string };

/** Loads offer + signing link; template/merged offers get a link-first draft for the Emails composer. */
async function buildDraftOfferEmailPreset(
  offerId: string,
  app: AppRow,
  dateOpts: { timeZone?: string | null; dateFormat?: string | null }
): Promise<OfferEmailPresetPayload> {
  const offerRes = await apiRequest("GET", `/api/recruitment/offers/${offerId}`);
  if (!offerRes.ok) {
    const err = await offerRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to load offer");
  }
  const offer = (await offerRes.json()) as {
    job_title?: string;
    salary?: number;
    salary_currency?: string | null;
    employment_type?: string | null;
    start_date?: string | null;
    department?: string | null;
    terms?: string | null;
    template_id?: string | null;
    merged_document_url?: string | null;
  };
  const subject = `Your Offer Letter – ${offer.job_title || app.job_title || "Position"}`;
  let signUrl: string | null = null;
  try {
    const linkRes = await apiRequest("GET", `/api/recruitment/offers/${offerId}/link`);
    if (linkRes.ok) {
      const linkJson = (await linkRes.json()) as { url?: string };
      signUrl = linkJson?.url ?? null;
    }
  } catch {
    /* ignore */
  }
  const hasTemplate = !!(offer.template_id || offer.merged_document_url);
  const lines: string[] = [];
  lines.push(`Dear ${app.first_name || "Candidate"},`);
  lines.push("");
  if (hasTemplate && signUrl) {
    lines.push("Please review and sign your offer letter using this secure link:");
    lines.push("");
    // Blank line isolates the URL so the server turns it into a CTA button (plainTextRecruitmentEmailToHtml).
    lines.push(signUrl);
    lines.push("");
    lines.push(
      "The link opens your personalized offer letter where you can review the terms and complete your electronic signature."
    );
    lines.push("");
    lines.push("If you have questions, reply to this email.");
  } else if (hasTemplate && !signUrl) {
    lines.push(`We are pleased to extend you a formal offer for the position of ${offer.job_title || app.job_title || "—"}.`);
    lines.push("");
    lines.push("Your signing link could not be generated. Try again from the pipeline or contact HR.");
  } else {
    lines.push(`We are pleased to extend you a formal offer for the position of ${offer.job_title || app.job_title || "—"}.`);
    lines.push("");
    if (offer.salary != null) lines.push(`Salary: ${offer.salary_currency ? offer.salary_currency + " " : ""}${Number(offer.salary).toLocaleString()}`);
    if (offer.employment_type) lines.push(`Employment type: ${offer.employment_type.replace(/_/g, " ")}`);
    if (offer.start_date) lines.push(`Joining date: ${formatLeaveDisplayDate(offer.start_date, dateOpts.timeZone ?? null, dateOpts.dateFormat ?? null)}`);
    if (offer.department) lines.push(`Department: ${offer.department}`);
    if (offer.terms) {
      lines.push("");
      lines.push("Terms & conditions:");
      lines.push(offer.terms);
    }
    lines.push("");
    if (signUrl) {
      lines.push("You can view the full offer details and respond using this link:");
      lines.push("");
      lines.push(signUrl);
      lines.push("");
    }
    if (app.offer_letter_url) lines.push("Please find your offer letter attached to this email.");
    lines.push("");
    lines.push("We look forward to having you on the team.");
  }
  return { subject, body: lines.join("\n"), offerId, offerStatus: "draft" };
}

/** Turn HTML or mixed plain+HTML into a single line of visible text (no tags in thread list). */
function emailBodyToVisibleText(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (!/<[a-z][\s\S]*>/i.test(s)) return s.replace(/\s+/g, " ").trim();
  try {
    const wrapped = /<html[\s>]/i.test(s) ? s : `<div>${s}</div>`;
    const doc = new DOMParser().parseFromString(wrapped, "text/html");
    const txt = doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (txt) return txt;
  } catch {
    /* ignore */
  }
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Prefer readable text: inbound mail often puts HTML tags inside the text/plain part — never show raw tags in previews. */
function emailThreadBodyPreview(bodyPlain: string | null | undefined, bodyHtml: string | null | undefined): string {
  const html = (bodyHtml ?? "").trim();
  const plain = (bodyPlain ?? "").trim();
  const fromHtml = html ? emailBodyToVisibleText(html) : "";
  const fromPlain = plain ? emailBodyToVisibleText(plain) : "";
  if (fromHtml && fromPlain) return fromHtml.length >= fromPlain.length ? fromHtml : fromPlain;
  return fromHtml || fromPlain || "—";
}

// ==================== TYPES ====================

interface JobPosting {
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
  headcount: number;
  hiring_manager_id: string | null;
  hiring_manager_ids: string[] | null;
  hm_names: string[];
  hm_ids: string[];
  recruiter_user_ids?: string[];
  limited_recruiter_user_ids?: string[];
  hiring_manager_user_ids?: string[];
  status: string;
  published_channels: string[] | null;
  application_count: number;
  hired_count: number;
  rejected_count?: number;
  recent_applications_7d?: number;
  published_at: string | null;
  created_at: string;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  experience_level?: string | null;
  remote?: boolean | null;
}

interface AppRow {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: string;
  first_name: string;
  last_name: string;
  candidate_email: string;
  current_company: string | null;
  current_title?: string | null;
  experience_years: number | null;
  expected_salary: string | null;
  resume_url: string | null;
  resume_filename?: string | null;
  has_resume?: boolean;
  job_title: string;
  job_department: string;
  applied_at: string;
  stage_updated_at: string | null;
  offer_id?: string | null;
  offer_status?: string | null;
  offer_approval_status?: string | null;
  offer_letter_url?: string | null;
  offer_letter_filename?: string | null;
  esign_status?: string | null;
  offer_template_id?: string | null;
  tentative_status?: string | null;
  /** From candidate: source (e.g. freshteam, career_page). */
  source?: string | null;
  /** From candidate: tags + skills merged (JSON array). Shown as skills in pipeline. */
  tags?: string[] | null;
  /** From candidate: city, country etc. for pipeline card. */
  location?: string | null;
  /** HR rating 1–5 for fit; null = not rated. */
  rating?: number | null;
  /** Candidate LinkedIn URL when present. */
  candidate_linkedin_url?: string | null;
  /** Primary job owner: first recruiter / limited recruiter / hiring manager on the job. */
  job_owner_display?: string | null;
  /** Minimum pipeline stage implied by offer records (API-enriched). */
  workflow_floor_stage?: string | null;
  workflow_floor_reasons?: string[];
  /** True when `stage` is behind `workflow_floor_stage`. */
  workflow_stage_mismatch?: boolean;
  /** Latest rejection category (applications.reject_reason). */
  reject_reason?: string | null;
  /** Notes from latest transition into rejected (includes Reason: prefix when saved via HR UI). */
  rejection_stage_notes?: string | null;
}

interface CandidateRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  current_title: string | null;
  experience_years: number | null;
  expected_salary: string | null;
  source: string | null;
  application_count: number;
  /** Comma-separated distinct job_postings.department from applications (scoped to visible jobs when applicable). */
  applied_departments?: string | null;
  /** Average of HR fitment ratings (1–5) on applications with a rating; scoped to visible jobs when applicable. */
  fitment_rating_avg?: number | string | null;
  created_at: string;
  updated_at?: string | null;
  resume_url?: string | null;
  has_resume?: boolean;
  resume_filename?: string | null;
  tags?: string[] | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

const STAGES = [
  { id: "applied", label: "Applied", color: "bg-blue-500" },
  { id: "longlisted", label: "Longlisted", color: "bg-indigo-500" },
  { id: "screening", label: "Screening", color: "bg-purple-500" },
  { id: "shortlisted", label: "Shortlisted", color: "bg-cyan-500" },
  { id: "assessment", label: "Assessment", color: "bg-amber-500" },
  { id: "interview", label: "Interview", color: "bg-orange-500" },
  { id: "verbally_accepted", label: "Verbally Accepted", color: "bg-teal-500" },
  { id: "offer", label: "Offer", color: "bg-emerald-500" },
  { id: "hired", label: "Hired", color: "bg-green-600" },
  { id: "rejected", label: "Rejected", color: "bg-red-500" },
];

/**
 * When to show Create Offer: no offer row yet, and either
 * - stage is Offer (e.g. after “restore workflow” or manual move) but the offer draft was never created or failed, or
 * - candidate was verbally accepted (or legacy tentative stage until migrated).
 */
function canOpenCreateOffer(app: AppRow): boolean {
  if (app.offer_id) return false;
  if (app.stage === "offer") return true;
  return app.stage === "verbally_accepted" || app.stage === "tentative";
}

/** Reopen the Make Offer wizard for a saved draft (status draft only). */
function canEditOfferDraft(app: AppRow): boolean {
  return !!app.offer_id && app.offer_status === "draft";
}

/** Offer draft / approval / send — depends on an offer row, not `stage === "offer"` (saved stage can lag behind restore). */
function hasOfferRow(app: AppRow): boolean {
  return !!app.offer_id;
}

/** Stages used for pipeline progress (excludes terminal rejected for progress dots). */
const PIPELINE_STAGES_FOR_PROGRESS = STAGES.filter((s) => s.id !== "rejected");

/** Map current stage to 1–5 filled dots for compact progress UI. */
function applicantStageProgressFilled(stageId: string): number {
  if (stageId === "rejected") return 0;
  const idx = PIPELINE_STAGES_FOR_PROGRESS.findIndex((s) => s.id === stageId);
  if (idx < 0) return 1;
  return Math.min(5, Math.max(1, Math.ceil(((idx + 1) / PIPELINE_STAGES_FOR_PROGRESS.length) * 5)));
}

function ownerAvatarInitials(display: string): string {
  const t = display.trim();
  if (!t) return "?";
  if (t.includes("@")) return t.slice(0, 2).toUpperCase();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function stageBadge(stage: string) {
  const s = STAGES.find((x) => x.id === stage);
  const label = s?.label || stage;
  const colorMap: Record<string, string> = {
    applied: "bg-blue-100 text-blue-700 border-blue-200",
    longlisted: "bg-indigo-100 text-indigo-700 border-indigo-200",
    screening: "bg-purple-100 text-purple-700 border-purple-200",
    shortlisted: "bg-cyan-100 text-cyan-700 border-cyan-200",
    assessment: "bg-amber-100 text-amber-700 border-amber-200",
    interview: "bg-orange-100 text-orange-700 border-orange-200",
    verbally_accepted: "bg-teal-100 text-teal-700 border-teal-200",
    offer: "bg-emerald-100 text-emerald-700 border-emerald-200",
    tentative: "bg-yellow-100 text-yellow-700 border-yellow-200",
    hired: "bg-green-100 text-green-700 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  return <Badge variant="outline" className={`text-xs ${colorMap[stage] || ""}`}>{label}</Badge>;
}

// ==================== AI JOB DESCRIPTION GENERATOR DIALOG ====================

const AI_PREVIEW_PLACEHOLDER = `We are looking for a talented professional to join our team...

**Responsibilities**
• Lead and deliver on key initiatives
• Collaborate with cross-functional teams
• Mentor and support team members

**Requirements**
• Relevant experience and skills
• Strong communication and problem-solving
• Portfolio or examples of work`;

function AIGeneratorDialog({
  open,
  onClose,
  onUseDescription,
}: {
  open: boolean;
  onClose: () => void;
  onUseDescription: (content: { title: string; department: string; description: string; requirements: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [experience, setExperience] = useState("mid");
  const [skills, setSkills] = useState("");
  const [generated, setGenerated] = useState(false);
  const [preview, setPreview] = useState("");

  const handleGenerate = () => {
    setGenerated(true);
    setPreview(AI_PREVIEW_PLACEHOLDER.replace("talented professional", title || "talented professional").replace("our team", `${department || "our"} team`));
  };

  const handleUseAndCreate = () => {
    const desc = preview || "Job description to be finalized.";
    const reqMatch = desc.includes("**Requirements**") ? desc.split("**Requirements**")[1]?.trim() : "";
    const descMatch = desc.includes("**Responsibilities**") ? desc.split("**Responsibilities**")[0]?.trim() : desc;
    onUseDescription({
      title: title || "New role",
      department: department || "General",
      description: descMatch || desc,
      requirements: reqMatch || "See description.",
    });
    onClose();
    setGenerated(false);
    setPreview("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate job description with AI
          </DialogTitle>
          <DialogDescription>Enter a few details and we&apos;ll generate a draft. You can then use it to create the job posting.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Job title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Product Designer" />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
            </div>
            <div className="space-y-2">
              <Label>Experience level</Label>
              <Select value={experience} onValueChange={setExperience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jr">Junior</SelectItem>
                  <SelectItem value="mid">Mid-Level</SelectItem>
                  <SelectItem value="sr">Senior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Key skills (comma separated)</Label>
              <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, TypeScript, Figma" />
            </div>
            <Button className="w-full gap-2" onClick={handleGenerate}>
              <Sparkles className="h-4 w-4" /> Generate with AI
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Preview</Label>
            <ScrollArea className="h-[240px] rounded-md border border-border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
              {generated ? preview : "Fill the form and click Generate to see a draft."}
            </ScrollArea>
            {generated && (
              <Button variant="outline" className="w-full gap-2" onClick={handleUseAndCreate}>
                <FileEdit className="h-4 w-4" /> Use description & create job
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== STAGE CHANGE DIALOG ====================

const REJECT_REASONS = [
  "Not Responding / Number Inactive",
  "Candidate not interested",
  "Failed in Challenge Round",
  "Linguistic Issues",
  "Overqualified",
  "Not a cultural fit",
  "Hired elsewhere",
  "Background / Reference check failed",
  "Over Age",
  "Medical check failed",
  "Anonymization Request",
  "Screening Failed",
  "Not Available for Night Shift",
  "Remote Profile",
  "Not Relevant",
  "Incompetent",
  "Exceeding Budget",
  "Poor communication skills",
];

const REJECT_NOTIFY_TIMEZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Kolkata",
  "America/New_York",
];

function detectLocalIanaTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.trim() ? tz.trim() : "UTC";
  } catch {
    return "UTC";
  }
}

/** Same semantics as server `parseLocalToUtc`: wall clock in IANA tz → UTC instant. */
function rejectNotifyWallTimeToUtc(ymdThm: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(ymdThm.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const min = Number(m[5]);
  const sec = m[6] != null ? Number(m[6]) : 0;
  const localAsIf = new Date(y, mo - 1, d, h, min, sec);
  return fromZonedTime(localAsIf, timeZone);
}

function formatDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Default scheduled rejection email: one hour from now, minute-rounded. */
function defaultRejectNotifyDatetimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return formatDatetimeLocalValue(d);
}

function StageChangeDialog({
  open,
  onClose,
  application,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  application: AppRow | null;
  employees?: unknown[];
  onSuccess?: (updatedApp: AppRow) => void;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState(application?.stage || "applied");
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSearch, setRejectSearch] = useState("");
  const [rejectDropdownOpen, setRejectDropdownOpen] = useState(false);
  const [notifyCandidate, setNotifyCandidate] = useState(false);
  const [rejectEmailWhen, setRejectEmailWhen] = useState<"immediate" | "scheduled">("immediate");
  const [rejectNotifyAtLocal, setRejectNotifyAtLocal] = useState("");
  const [rejectNotifyTimezone, setRejectNotifyTimezone] = useState("UTC");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!application) return;
    setStage(application.stage || "applied");
    setNotes("");
    setRejectReason("");
    setRejectSearch("");
    setRejectDropdownOpen(false);
    setNotifyCandidate(false);
    setRejectEmailWhen("immediate");
    setRejectNotifyAtLocal("");
    setRejectNotifyTimezone(detectLocalIanaTimezone());
  }, [application?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateApplicationsCache = (updatedApp: AppRow) => {
    queryClient.setQueriesData(
      { queryKey: ["/api/recruitment/applications"] },
      (old: unknown) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.map((a: AppRow) => (a.id === updatedApp.id ? { ...a, ...updatedApp } : a));
        if (typeof old === "object" && old !== null && "applications" in old && Array.isArray((old as { applications: AppRow[] }).applications)) {
          const data = old as { applications: AppRow[]; total: number };
          return { ...data, applications: data.applications.map((a) => (a.id === updatedApp.id ? { ...a, ...updatedApp } : a)) };
        }
        return old;
      }
    );
  };

  const handleRestoreWorkflow = async () => {
    if (!application) return;
    setRestoring(true);
    try {
      const res = await apiRequest("POST", `/api/recruitment/applications/${application.id}/restore-workflow-stage`);
      const updatedApp = (await res.json()) as AppRow;
      updateApplicationsCache(updatedApp);
      onSuccess?.(updatedApp);
      setStage(updatedApp.stage || "applied");
      const label = STAGES.find((s) => s.id === updatedApp.stage)?.label || updatedApp.stage;
      toast.success(`Restored to ${label}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to restore workflow stage");
    } finally {
      setRestoring(false);
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      if (application?.id) queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", application.id, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }
  };

  const handleSave = async () => {
    if (!application) return;
    if (stage === "rejected" && !rejectReason.trim()) {
      toast.error("Please select a reject reason before saving.");
      return;
    }
    let rejectNotifyAtForApi: string | undefined;
    if (stage === "rejected" && notifyCandidate && rejectEmailWhen === "scheduled") {
      const trimmedAt = rejectNotifyAtLocal.trim();
      if (!trimmedAt) {
        toast.error("Pick a date and time for the candidate email.");
        return;
      }
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: rejectNotifyTimezone }).format(new Date());
      } catch {
        toast.error("Invalid timezone selected for scheduled email.");
        return;
      }
      const sendAtUtc = rejectNotifyWallTimeToUtc(trimmedAt, rejectNotifyTimezone);
      if (Number.isNaN(sendAtUtc.getTime()) || sendAtUtc.getTime() <= Date.now() + 45 * 1000) {
        toast.error("Scheduled send time must be at least about a minute in the future.");
        return;
      }
      rejectNotifyAtForApi = trimmedAt;
    }
    setLoading(true);
    try {
      const res = await apiRequest("PATCH", `/api/recruitment/applications/${application.id}/stage`, {
        stage,
        notes: notes || null,
        rejectReason: stage === "rejected" ? rejectReason : null,
        notifyCandidate: stage === "rejected" ? notifyCandidate : false,
        rejectNotifyAt:
          stage === "rejected" && notifyCandidate && rejectEmailWhen === "scheduled" ? rejectNotifyAtForApi : undefined,
        rejectNotifyTimezone:
          stage === "rejected" && notifyCandidate && rejectEmailWhen === "scheduled"
            ? rejectNotifyTimezone
            : undefined,
      });
      const updatedApp = (await res.json()) as AppRow;
      updateApplicationsCache(updatedApp);
      onSuccess?.(updatedApp);
      const label = STAGES.find((s) => s.id === stage)?.label || stage;
      if (stage === "rejected" && notifyCandidate && rejectEmailWhen === "scheduled" && rejectNotifyAtForApi) {
        const sendAtUtc = rejectNotifyWallTimeToUtc(rejectNotifyAtForApi, rejectNotifyTimezone);
        const when = formatInTimeZone(sendAtUtc, rejectNotifyTimezone, "PPp");
        toast.success(`Moved to ${label}. Candidate email scheduled for ${when} (${rejectNotifyTimezone}).`);
      } else {
        toast.success(`Moved to ${label}`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update stage");
    } finally {
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      if (application?.id) queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", application.id, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }
  };

  const filteredRejectReasons = REJECT_REASONS.filter((r) =>
    r.toLowerCase().includes(rejectSearch.toLowerCase())
  );
  const customRejectOption =
    rejectSearch.trim() &&
    !REJECT_REASONS.some((r) => r.toLowerCase() === rejectSearch.toLowerCase())
      ? rejectSearch.trim()
      : null;

  const isRejectMode = stage === "rejected";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          isRejectMode ? "w-[min(92vw,720px)] sm:max-w-[720px]" : "sm:max-w-[440px]",
        )}
      >
        <DialogHeader>
          <DialogTitle>{isRejectMode ? "Reject" : "Move Candidate"}</DialogTitle>
          <DialogDescription>
            {application ? `${application.first_name} ${application.last_name} — ${application.job_title}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {application?.workflow_stage_mismatch && application.workflow_floor_stage && (
            <Alert className="border-amber-300/80 bg-amber-50/90 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-50">
              <AlertTriangle className="h-4 w-4" />
              <div>
                <AlertTitle>Pipeline out of sync</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <p>
                    Active offer work means this candidate should be at{" "}
                    <strong>{STAGES.find((s) => s.id === application.workflow_floor_stage)?.label || application.workflow_floor_stage}</strong>{" "}
                    or later. You can restore without losing offer data.
                  </p>
                  {application.workflow_floor_reasons && application.workflow_floor_reasons.length > 0 && (
                    <ul className="list-disc pl-4 text-xs text-amber-900/90 dark:text-amber-100/90">
                      {application.workflow_floor_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" size="sm" variant="secondary" disabled={loading || restoring} onClick={handleRestoreWorkflow}>
                    {restoring ? "Restoring…" : "Restore workflow stage"}
                  </Button>
                </AlertDescription>
              </div>
            </Alert>
          )}
          {!isRejectMode && (
            <div className="space-y-2">
              <Label>Stage <span className="text-destructive">*</span></Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.filter(
                    (s) =>
                      s.id !== "hired" &&
                      s.id !== "interview" &&
                      (s.id !== "offer" || application?.stage === "offer")
                  ).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stage === "interview" && (
                <p className="text-xs text-muted-foreground">To schedule an interview, use the "Schedule Interview" button instead.</p>
              )}
            </div>
          )}
          {isRejectMode && (
            <>
              <div className="space-y-2">
                <Label>Reject Reason <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div
                    className="flex items-center justify-between border rounded-md px-3 py-2 cursor-pointer bg-background hover:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                    onClick={() => setRejectDropdownOpen((v) => !v)}
                  >
                    <span className={rejectReason ? "text-sm" : "text-sm text-muted-foreground"}>
                      {rejectReason || "Select reject reason…"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  {rejectDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 border rounded-md bg-background shadow-md">
                      <div className="p-2 border-b">
                        <Input
                          autoFocus
                          placeholder="Search/Add New"
                          value={rejectSearch}
                          onChange={(e) => setRejectSearch(e.target.value)}
                          className="h-8 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-[min(45vh,280px)] overflow-y-auto overscroll-contain py-1 [scrollbar-gutter:stable]">
                        {customRejectOption && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-primary font-medium"
                            onClick={() => {
                              setRejectReason(customRejectOption);
                              setRejectSearch("");
                              setRejectDropdownOpen(false);
                            }}
                          >
                            + Add &ldquo;{customRejectOption}&rdquo;
                          </button>
                        )}
                        {filteredRejectReasons.map((r) => (
                          <button
                            key={r}
                            type="button"
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${rejectReason === r ? "bg-accent/60 font-medium" : ""}`}
                            onClick={() => {
                              setRejectReason(r);
                              setRejectSearch("");
                              setRejectDropdownOpen(false);
                            }}
                          >
                            {r}
                          </button>
                        ))}
                        {filteredRejectReasons.length === 0 && !customRejectOption && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">No options found.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground font-normal">Leave a comment for the hiring team</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} className="min-h-[180px]" placeholder="Optional comment…" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="notify-candidate"
                  checked={notifyCandidate}
                  onCheckedChange={(v) => setNotifyCandidate(!!v)}
                />
                <label htmlFor="notify-candidate" className="text-sm cursor-pointer select-none">
                  Notify Candidate
                </label>
              </div>
              {notifyCandidate && (
                <div className="space-y-2 pt-1">
                  <Label className="text-muted-foreground font-normal">When to send email</Label>
                  <Select
                    value={rejectEmailWhen}
                    onValueChange={(v) => {
                      const next = v as "immediate" | "scheduled";
                      setRejectEmailWhen(next);
                      if (next === "scheduled" && !rejectNotifyAtLocal.trim()) {
                        setRejectNotifyAtLocal(defaultRejectNotifyDatetimeLocal());
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose timing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Send immediately</SelectItem>
                      <SelectItem value="scheduled">Schedule for a specific date and time</SelectItem>
                    </SelectContent>
                  </Select>
                  {rejectEmailWhen === "scheduled" && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Timezone</Label>
                          <Select value={rejectNotifyTimezone} onValueChange={setRejectNotifyTimezone}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                            <SelectContent>
                              {[rejectNotifyTimezone, ...REJECT_NOTIFY_TIMEZONES]
                                .filter((v, i, a) => a.indexOf(v) === i)
                                .map((tz) => (
                                  <SelectItem key={tz} value={tz}>
                                    {tz}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Date and time</Label>
                          <Input
                            type="datetime-local"
                            className="font-mono text-sm"
                            min={formatDatetimeLocalValue(new Date(Date.now() + 60 * 1000))}
                            value={rejectNotifyAtLocal}
                            onChange={(e) => setRejectNotifyAtLocal(e.target.value)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The selected timezone is used for scheduling. Max about one year ahead.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    If you move this applicant out of Rejected before the send time, the scheduled email is cancelled automatically.
                  </p>
                </div>
              )}
            </>
          )}
          {!isRejectMode && (
            <div className="space-y-2">
              <Label className="text-muted-foreground font-normal">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={loading || restoring}
            variant={isRejectMode ? "destructive" : "default"}
          >
            {loading ? "Saving…" : isRejectMode ? "Save" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== OFFER DIALOG ====================

function OfferDialog({
  open,
  onClose,
  application,
  onOfferCreated,
}: {
  open: boolean;
  onClose: () => void;
  application: AppRow | null;
  onOfferCreated?: (
    application: AppRow,
    createdOffer: { id: string; status: string; approval_status?: string | null },
    meta?: { openEmailComposer?: boolean }
  ) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState({
    salary: "",
    salaryCurrency: "AED",
    jobTitle: application?.job_title || "",
    department: application?.job_department || "",
    startDate: "",
    employmentType: "full_time",
    terms: "",
    status: "draft" as string,
    templateId: "" as string,
  });
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const { data: templatesEnvelope } = useQuery<{ success?: boolean; data?: { templates: Array<{ id: string; name: string; description: string | null; placeholders: string[]; is_active: boolean }> } }>({
    queryKey: ["/api/offer-templates"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/offer-templates"); return r.json(); },
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const templates = templatesEnvelope?.data?.templates?.filter((t) => t.is_active) ?? [];

  useEffect(() => {
    if (open) {
      setForm({
        salary: "",
        salaryCurrency: "AED",
        jobTitle: application?.job_title || "",
        department: application?.job_department || "",
        startDate: "",
        employmentType: "full_time",
        terms: "",
        status: "draft",
        templateId: "",
      });
      setPreviewHtml(null);
    }
  }, [open, application?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!application || !form.salary || !form.jobTitle) {
      toast.error("Salary and Job Title are required");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/recruitment/offers", {
        applicationId: application.id,
        salary: parseFloat(form.salary),
        salaryCurrency: form.salaryCurrency,
        jobTitle: form.jobTitle,
        department: form.department,
        startDate: form.startDate || null,
        employmentType: form.employmentType,
        terms: form.terms || null,
        status: form.status,
        ...(form.templateId ? { willMergeTemplate: true } : {}),
      });
      const created = await res.json() as { id: string; status: string; approval_status?: string | null };

      if (form.templateId) {
        try {
          await apiRequest("POST", `/api/recruitment/offers/${created.id}/merge-template`, { templateId: form.templateId });
        } catch (e: any) {
          toast.error(e?.message || "Template merge failed — offer was saved but the signing link email may not have been sent.");
          queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
          onOfferCreated?.(application, { id: created.id, status: created.status, approval_status: created.approval_status ?? "approved" });
          onClose();
          return;
        }
      }

      const emailMeta = { openEmailComposer: form.status === "draft" && !!form.templateId };
      toast.success("Offer created" + (form.templateId ? " with template" : ""));
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onOfferCreated?.(application, { id: created.id, status: created.status, approval_status: created.approval_status ?? "approved" }, emailMeta);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create offer");
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewTemplate = async () => {
    if (!form.templateId) return;
    setMerging(true);
    try {
      const candidateName = `${application?.first_name ?? ""} ${application?.last_name ?? ""}`.trim();
      const startDateFmt = form.startDate ? formatRecruitmentDate(form.startDate, user?.timeZone ?? null, user?.dateFormat ?? null) : "";
      const vars: Record<string, string> = {
        "applicant.name": candidateName,
        "applicant.first_name": application?.first_name ?? "",
        "applicant.last_name": application?.last_name ?? "",
        "applicant.email": application?.candidate_email ?? "",
        "offer.job_title": form.jobTitle,
        "offer.department": form.department,
        "offer.salary": form.salary ? Number(form.salary).toLocaleString() : "",
        "offer.pay_rate_value": form.salary ? Number(form.salary).toLocaleString() : "",
        "offer.currency": form.salaryCurrency,
        "offer.start_date": startDateFmt,
        "offer.effective_date": startDateFmt,
        "offer.date_of_joining": startDateFmt,
        "offer.employment_type": form.employmentType?.replace(/_/g, " ") ?? "",
        "offer.created_at": formatRecruitmentDate(new Date().toISOString(), user?.timeZone ?? null, user?.dateFormat ?? null),
        "employee_portal.company_name": "LDP Logistics",
        "company.name": "LDP Logistics",
        "company_name": "LDP Logistics",
        "job.title": form.jobTitle,
        "job.department": form.department,
        "candidate.name": candidateName,
        "candidate.first_name": application?.first_name ?? "",
        "candidate.last_name": application?.last_name ?? "",
        "candidate.email": application?.candidate_email ?? "",
        // Signature placeholders rendered as placeholder box in preview
        "candidate.signature": "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B",
        "signature": "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B",
        "applicant.signature": "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B",
        "esign.signature": "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B",
        "signature.date": "\u200B\u2063ESIGN_DATE\u2063\u200B",
        "signature_date": "\u200B\u2063ESIGN_DATE\u2063\u200B",
        "esign.date": "\u200B\u2063ESIGN_DATE\u2063\u200B",
        "signing_date": "\u200B\u2063ESIGN_DATE\u2063\u200B",
      };
      const res = await apiRequest("POST", `/api/offer-templates/${form.templateId}/preview`, { variables: vars });
      const data = await res.json();
      setPreviewHtml(data?.data?.html || "<p>No content</p>");
    } catch {
      toast.error("Template preview failed");
    } finally { setMerging(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
          <DialogDescription className="space-y-1">
            {application ? (
              <>
                <span className="block">For {application.first_name} {application.last_name}</span>
                <span className="block text-xs text-muted-foreground">
                  Available after verbal acceptance. The candidate moves to Offer when you save.
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Salary *</Label>
              <Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 25000" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={form.salaryCurrency} onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Job Title *</Label>
              <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Joining Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Template selection */}
          <div className="space-y-2">
            <Label>Offer letter template (for e-sign)</Label>
            <Select value={form.templateId || "__none__"} onValueChange={(v) => { setForm({ ...form, templateId: v === "__none__" ? "" : v }); setPreviewHtml(null); }}>
              <SelectTrigger><SelectValue placeholder="No template (manual offer)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No template (manual offer)</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.templateId && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={handlePreviewTemplate} disabled={merging}>
                  {merging ? "Loading…" : "Preview merged letter"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Variables will be filled from the fields above.
                </span>
              </div>
            )}
            {!templates.length && (
              <p className="text-xs text-muted-foreground">
                No templates yet — <a href="/settings/offer-templates" className="text-blue-600 hover:underline">add one in Settings</a>.
              </p>
            )}
          </div>

          {previewHtml && (
            <div className="border rounded-lg p-4 max-h-48 overflow-y-auto bg-white">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} className="prose prose-sm max-w-none" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Terms / Notes</Label>
            <Textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={3} placeholder="Offer terms, benefits, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Create Offer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== HIRE DIALOG ====================

/** Same `/api/employees/suggested-id` response parsing as Add Employee. */
async function fetchSuggestedEmployeeIdForHire(): Promise<string | null> {
  try {
    const res = await apiRequest("GET", "/api/employees/suggested-id");
    const data = await res.json();
    const raw =
      typeof data?.suggestedId === "string"
        ? data.suggestedId.trim()
        : typeof data?.data?.suggestedId === "string"
          ? data.data.suggestedId.trim()
          : "";
    return raw || null;
  } catch {
    return null;
  }
}

function HireDialog({
  open,
  onClose,
  application,
}: {
  open: boolean;
  onClose: () => void;
  application: AppRow | null;
}) {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill suggested employee ID (same logic as Employees → Add New Employee → Auto)
  useEffect(() => {
    if (!open || !application) return;
    setEmployeeId("");
    setNickname("");
    let cancelled = false;
    (async () => {
      const next = await fetchSuggestedEmployeeIdForHire();
      if (!cancelled && next) setEmployeeId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, application?.id]);

  const handleSuggestEmployeeId = async () => {
    const next = await fetchSuggestedEmployeeIdForHire();
    if (next) setEmployeeId(next);
    else toast.error("Could not get next employee ID");
  };

  const handleHire = async () => {
    if (!application) {
      toast.error("No application selected");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", `/api/recruitment/applications/${application.id}/hire`, {
        employeeId: employeeId.trim(),
        ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
      });
      const data = await res.json();
      toast.success(`${application.first_name} ${application.last_name} has been hired!`, {
        description: "Employee created. Start onboarding from their profile.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to hire candidate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Hire Candidate</DialogTitle>
          <DialogDescription>
            {application ? `Convert ${application.first_name} ${application.last_name} to an employee. Employee details will be filled from the candidate profile and offer.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {application && (
            <div className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Will create employee:</strong> {application.first_name} {application.last_name}, {application.candidate_email}, {application.job_title}, {application.job_department}. Work email will use the candidate&apos;s email until Microsoft account is provisioned.
            </div>
          )}
          <div className="space-y-2">
            <Label>Employee ID</Label>
            <div className="flex gap-2">
              <Input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP-009"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleSuggestEmployeeId} disabled={loading}>
                Auto
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Next ID in sequence is pre-filled (same as Add Employee). Edit if needed, use Auto to refresh, or leave blank — the server assigns the next ID on hire.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Also known as (pseudonym)</Label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Optional — saved to employee profile"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Same as profile &quot;Also known as (pseudonym)&quot; and onboarding email merge tags (e.g. pseudonym placeholder).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleHire} disabled={loading} className="bg-green-600 hover:bg-green-700">
            <UserPlus className="h-4 w-4 mr-2" /> {loading ? "Processing..." : "Hire Candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== JOB DETAIL DIALOG ====================

function JobDetailDialog({
  open,
  onClose,
  job,
  jobInfoOnly,
  onViewApplicants,
}: {
  open: boolean;
  onClose: () => void;
  job: JobPosting | null;
  /** When true, show posting details only (no applicant list). Used from job card "Details". */
  jobInfoOnly?: boolean;
  onViewApplicants?: () => void;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: jobDetail, isLoading } = useQuery<JobPosting & { applications?: AppRow[] }>({
    queryKey: ["/api/recruitment/jobs", job?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/jobs/${job!.id}`);
      return res.json();
    },
    enabled: !!job?.id && open,
  });

  const applications = jobDetail?.applications || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{job?.title}</DialogTitle>
          <DialogDescription>
            {job?.department}{job?.location ? ` · ${job.location}` : ""}
            {job?.employment_type ? ` · ${(job.employment_type || "").replace("_", " ")}` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="min-h-0 flex-1 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-4 -mr-4">
            <div className="space-y-6 py-2 pr-4">
              {jobDetail?.description && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Description</h4>
                  {isHtmlContent(jobDetail.description) ? (
                    <div
                      className="text-sm text-muted-foreground prose prose-sm max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0"
                      dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(jobDetail.description) }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{jobDetail.description}</p>
                  )}
                </div>
              )}
              {jobDetail?.requirements && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Requirements</h4>
                  {isHtmlContent(jobDetail.requirements) ? (
                    <div
                      className="text-sm text-muted-foreground prose prose-sm max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0"
                      dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(jobDetail.requirements) }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{jobDetail.requirements}</p>
                  )}
                </div>
              )}
              {jobDetail?.hm_names && jobDetail.hm_names.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Hiring Manager{jobDetail.hm_names.length > 1 ? "s" : ""}: {jobDetail.hm_names.join(", ")}
                </p>
              )}
              {(jobDetail?.created_at || jobDetail?.updated_at) && (
                <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                  <h4 className="font-semibold text-sm mb-2">Record</h4>
                  <JobRecordAudit
                    created_at={jobDetail?.created_at}
                    updated_at={jobDetail?.updated_at}
                    created_by_name={jobDetail?.created_by_name}
                    updated_by_name={jobDetail?.updated_by_name}
                    displayTz={user?.timeZone?.trim() || "UTC"}
                    dateFormat={user?.dateFormat ?? null}
                  />
                </div>
              )}
              {!jobInfoOnly && (
              <div>
                <h4 className="font-semibold text-sm mb-3">Applicants ({applications.length})</h4>
                {applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No applicants yet.</p>
                ) : (
                  <div className="space-y-2">
                    {applications.map((app: any) => (
                      <div
                        key={app.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs">{app.first_name?.[0]}{app.last_name?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <button
                              onClick={() => {
                                onClose();
                                setLocation(`/recruitment/candidates/${app.candidate_id}`);
                              }}
                              className="font-medium text-sm hover:text-primary hover:underline text-left"
                            >
                              {app.first_name} {app.last_name}
                            </button>
                            <p className="text-xs text-muted-foreground">{app.candidate_email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {stageBadge(app.stage)}
              {(app.resume_url || app.has_resume) && (
                            <span className="flex items-center gap-1.5">
                              <a href={app.resume_url || `/api/recruitment/candidates/${app.candidate_id}/resume`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={(e) => { e.preventDefault(); window.open(app.resume_url || `/api/recruitment/candidates/${app.candidate_id}/resume`, "_blank", "noopener,noreferrer"); }}><FileText className="h-3.5 w-3.5" /> View</a>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="shrink-0 flex-wrap gap-2">
          {jobInfoOnly && job?.id && onViewApplicants && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onViewApplicants()}
            >
              <Users className="h-3.5 w-3.5 mr-1.5" /> View applicants
            </Button>
          )}
          {job?.id && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/careers?job=${encodeURIComponent(job.id)}`;
                navigator.clipboard.writeText(url);
                toast.success("Link copied — opens directly to this job's application");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy apply link
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== JOB APPLICANT PIPELINE VIEW (full-screen: sidebar + tabs) ====================

function JobApplicantPipelineView({
  app,
  jobTitle,
  onBack,
  setStageDialog,
  setHireDialog,
  setOfferDialog,
  setUploadLetterOfferId,
  queryClient,
  onDeleteApplication,
  onApplicationUpdated,
  pendingOpenOfferEmailAfterCreate,
  onConsumedPendingOpenOfferEmail,
}: {
  app: AppRow;
  jobTitle: string;
  onBack: () => void;
  setStageDialog: (v: { open: boolean; app: AppRow | null }) => void;
  setHireDialog: (v: { open: boolean; app: AppRow | null }) => void;
  setOfferDialog: (v: { open: boolean; app: AppRow | null }) => void;
  setUploadLetterOfferId: (id: string | null) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  onDeleteApplication: () => void;
  onApplicationUpdated?: (updated: AppRow) => void;
  pendingOpenOfferEmailAfterCreate?: { offerId: string; applicationId: string } | null;
  onConsumedPendingOpenOfferEmail?: () => void;
}) {
  const { user, isLimitedRecruiter, isAdmin, isHR, isRecruiter } = useAuth();
  const canApproveOffer = isAdmin || isHR || isRecruiter;
  const [detailTab, setDetailTab] = useState<ApplicantPipelineTabId>(() => {
    if (typeof window === "undefined") return "summary";
    const panel = new URLSearchParams(window.location.search).get("panel");
    const valid: ApplicantPipelineTabId[] = [
      "summary", "profile", "timeline", "emails", "comments", "interviews", "offer", "tasks",
    ];
    return valid.includes(panel as ApplicantPipelineTabId) ? (panel as ApplicantPipelineTabId) : "summary";
  });
  const [removeApplicantOpen, setRemoveApplicantOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailEditorKey, setEmailEditorKey] = useState(0);
  const [emailAttachments, setEmailAttachments] = useState<File[]>([]);
  /** Sub-tabs inside Emails: compose vs thread list */
  const [emailPanelTab, setEmailPanelTab] = useState<"compose" | "thread">("thread");
  // When set, navigates to Emails tab and pre-fills the compose area with an offer email draft
  const [offerEmailPreset, setOfferEmailPreset] = useState<{ subject: string; body: string; offerId: string; offerStatus: string } | null>(null);
  // Tracks whether the next sent email should flip offer status to "sent"
  const pendingOfferFlipRef = useRef<{ offerId: string } | null>(null);
  const emailFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedThreadEmail, setSelectedThreadEmail] = useState<{
    id: string;
    direction: string;
    from_email: string;
    to_email: string;
    subject: string;
    body_plain: string | null;
    body_html: string | null;
    sent_at: string | null;
    received_at: string | null;
    created_at: string;
  } | null>(null);
  const MAX_ATTACHMENTS = 5;
  const MAX_ATTACHMENTS_BYTES = 8 * 1024 * 1024;
  const { data: candidateProfile, isLoading: profileLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/recruitment/candidates", app.candidate_id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/candidates/${app.candidate_id}`);
      return res.json();
    },
    enabled: !!app.candidate_id,
    staleTime: 60_000,
  });
  type StageHistoryEntry = {
    id?: string;
    from_stage: string | null;
    to_stage: string;
    notes: string | null;
    created_at: string;
    moved_by_email?: string;
    scheduled_at?: string | null;
    meeting_link?: string | null;
    interviewer_names?: string | null;
    interviewer_ids?: string[] | null;
    interview_type?: string | null;
  };
  type AuditEntry = {
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    performed_by_name: string | null;
    performed_by_email: string | null;
  };
  /** Stage history + audit — fetch while applicant view is open so Activity tab is warm. */
  const { data: history = [], isLoading: historyLoading } = useQuery<StageHistoryEntry[]>({
    queryKey: ["/api/recruitment/applications", app.id, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/applications/${app.id}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: !!app.id,
    staleTime: 30_000,
    refetchInterval: 15_000,
  });
  const { data: auditLog = [], isLoading: auditLoading } = useQuery<AuditEntry[]>({
    queryKey: ["/api/recruitment/applications", app.id, "audit-log"],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/applications/${app.id}/audit-log`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activity log");
      return res.json();
    },
    enabled: !!app.id,
    staleTime: 30_000,
    refetchInterval: 15_000,
  });

  const { data: offerDetail, isLoading: offerDetailLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/recruitment/offers", app.offer_id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/offers/${app.offer_id}`);
      return res.json();
    },
    enabled: !!app.offer_id,
    staleTime: 30_000,
  });

  const { data: interviewEmployees = [] } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/employees");
      const json = await res.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: !!app.id,
    staleTime: 300_000,
  });

  const { data: emails = [], isLoading: emailsLoading } = useQuery<{ id: string; direction: string; from_email: string; to_email: string; subject: string; body_plain: string | null; body_html: string | null; sent_at: string | null; received_at: string | null; created_at: string }[]>({
    queryKey: ["/api/recruitment/applications", app.id, "emails"],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/applications/${app.id}/emails`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load emails");
      return res.json();
    },
    enabled: !!app.id,
    staleTime: 15_000,
    refetchInterval: detailTab === "emails" ? 15_000 : 30_000,
    refetchOnWindowFocus: detailTab === "emails",
  });

  // Warm Comments + Interviews caches so switching tabs does not wait on first mount.
  useEffect(() => {
    if (!app.id) return;
    void queryClient.prefetchQuery({
      queryKey: [`/api/recruitment/applications/${app.id}/comments`],
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/recruitment/applications/${app.id}/comments`);
        return r.json();
      },
    });
    void queryClient.prefetchQuery({
      queryKey: [`/api/recruitment/applications/${app.id}/mentionable`],
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/recruitment/applications/${app.id}/mentionable`);
        return r.json();
      },
      staleTime: 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: ["/api/recruitment/applications", app.id, "interviews"],
      queryFn: async () => {
        const res = await fetch(`/api/recruitment/applications/${app.id}/interviews`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      },
    });
  }, [app.id, queryClient]);
  const sendEmailMutation = useMutation({
    mutationFn: async (payload: { to?: string; subject: string; body: string; attachments?: Array<{ filename: string; content: string }> }) => {
      const res = await apiRequest("POST", `/api/recruitment/applications/${app.id}/emails`, payload);
      return res.json();
    },
    onSuccess: async (data: { delivered?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", app.id, "emails"] });
      // If this email send was triggered by "Send via Email" for an offer, flip offer status to "sent"
      const flip = pendingOfferFlipRef.current;
      if (flip) {
        pendingOfferFlipRef.current = null;
        try {
          await apiRequest("PATCH", `/api/recruitment/offers/${flip.offerId}`, { status: "sent" });
          const merged = { ...app, offer_status: "sent" };
          onApplicationUpdated?.(merged);
          queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
        } catch { /* non-critical — email already sent */ }
      }
    },
  });
  const deleteEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const res = await apiRequest("DELETE", `/api/recruitment/applications/${app.id}/emails/${emailId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? err?.detail ?? "Failed to delete email");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", app.id, "emails"] });
      setSelectedThreadEmail(null);
      toast.success("Email removed from thread");
    },
    onError: (e: Error) => toast.error(e?.message ?? "Failed to delete email"),
  });

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = r.result as string;
        const base64 = dataUrl.indexOf(",") >= 0 ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
        resolve(base64);
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  // After creating a draft offer with a template: open Emails tab with signing link (same preset as Send Offer Email)
  useEffect(() => {
    if (!pendingOpenOfferEmailAfterCreate) return;
    if (app.id !== pendingOpenOfferEmailAfterCreate.applicationId) return;
    if (app.offer_id !== pendingOpenOfferEmailAfterCreate.offerId) return;
    let cancelled = false;
    (async () => {
      try {
        const preset = await buildDraftOfferEmailPreset(pendingOpenOfferEmailAfterCreate.offerId, app, {
          timeZone: user?.timeZone ?? null,
          dateFormat: user?.dateFormat ?? null,
        });
        if (!cancelled) {
          setOfferEmailPreset(preset);
          onConsumedPendingOpenOfferEmail?.();
        }
      } catch {
        if (!cancelled) {
          toast.error("Failed to prepare offer email");
          onConsumedPendingOpenOfferEmail?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingOpenOfferEmailAfterCreate, app.id, app.offer_id, onConsumedPendingOpenOfferEmail, user?.timeZone, user?.dateFormat]);

  // When an offer email preset arrives: switch to Emails tab, fill compose, fetch offer letter as File attachment
  useEffect(() => {
    if (!offerEmailPreset) return;
    setDetailTab("emails");
    setEmailPanelTab("compose");
    setEmailSubject(offerEmailPreset.subject);
    setEmailBody(bodyTemplateToEditorHtml(offerEmailPreset.body));
    setEmailEditorKey((k) => k + 1);
    setEmailAttachments([]);
    // Track that sending this email should flip offer status to "sent" (only if not already sent)
    if (offerEmailPreset.offerStatus !== "sent") {
      pendingOfferFlipRef.current = { offerId: offerEmailPreset.offerId };
    }
    // Try to fetch the offer letter PDF and add it as an attachment
    const { offerId } = offerEmailPreset;
    if (offerId && app.offer_letter_url) {
      fetch(`/api/recruitment/offers/${offerId}/letter`, { credentials: "include" })
        .then(async (res) => {
          if (!res.ok) return;
          const blob = await res.blob();
          const fileName = app.offer_letter_filename || "offer-letter.pdf";
          const file = new File([blob], fileName, { type: blob.type || "application/pdf" });
          setEmailAttachments([file]);
        })
        .catch(() => {/* letter not available, that's fine */});
    }
    setOfferEmailPreset(null);
  }, [offerEmailPreset]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumeHref = app.resume_url || `/api/recruitment/candidates/${app.candidate_id}/resume`;
  const resumeFileName = app.resume_filename?.trim() || "Resume.pdf";
  const hasResumeFile = !!(app.resume_url || app.has_resume);
  const resumeUpdatedAt =
    (candidateProfile && (candidateProfile.updated_at as string | undefined)) || app.stage_updated_at || app.applied_at || null;

  type CandidateApplication = {
    id: string;
    custom_answers?: Record<string, unknown> | null;
    cover_letter?: string | null;
    referral_source?: string | null;
    form_config?: import("@/components/ApplicationFormBuilderCore").FormConfig | null;
  };
  const thisApplication =
    ((candidateProfile?.applications as CandidateApplication[] | undefined) ?? []).find((a) => a.id === app.id) ??
    null;

  const pipelineMismatchAlert =
    app.workflow_stage_mismatch && app.workflow_floor_stage ? (
      <Alert className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-950">
        <AlertTriangle className="h-4 w-4" />
        <div>
          <AlertTitle>Pipeline out of sync</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p className="text-sm">
              The saved stage is behind your active offer workflow. Restore to{" "}
              <strong>{STAGES.find((s) => s.id === app.workflow_floor_stage)?.label || app.workflow_floor_stage}</strong> to
              continue.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-lg"
              onClick={async () => {
                try {
                  const res = await apiRequest("POST", `/api/recruitment/applications/${app.id}/restore-workflow-stage`);
                  const updated = (await res.json()) as AppRow;
                  onApplicationUpdated?.(updated);
                  queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                  if (app.job_id) queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs", app.job_id] });
                  toast.success("Workflow stage restored");
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to restore");
                }
              }}
            >
              Restore workflow stage
            </Button>
          </AlertDescription>
        </div>
      </Alert>
    ) : null;

  const workflowNextSteps = (
    <>
      {app.stage === "interview" && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg text-xs text-teal-600"
          onClick={async () => {
            try {
              const res = await apiRequest("PATCH", `/api/recruitment/applications/${app.id}/stage`, { stage: "verbally_accepted" });
              const updatedApp = await res.json() as AppRow;
              toast.success("Marked as verbally accepted");
              onApplicationUpdated?.(updatedApp);
              queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
            } catch {
              toast.error("Failed");
            }
          }}
        >
          <CheckCircle className="mr-1 h-3.5 w-3.5" /> Verbal acceptance
        </Button>
      )}
      {hasOfferRow(app) && (
        <>
          {app.offer_approval_status === "not_requested" &&
            (isLimitedRecruiter ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs text-amber-700"
                onClick={async () => {
                  try {
                    await apiRequest("POST", `/api/recruitment/offers/${app.offer_id}/request-approval`);
                    toast.success("HR and recruiters have been notified to review this offer");
                    onApplicationUpdated?.({ ...app, offer_approval_status: "pending" });
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                  } catch (e: any) {
                    toast.error(e?.message || "Failed to request approval");
                  }
                }}
              >
                <Send className="mr-1 h-3.5 w-3.5" /> Ask for approval
              </Button>
            ) : (
              <span className="inline-flex h-8 items-center gap-1 rounded-lg border bg-muted/50 px-2 text-xs text-muted-foreground">Draft — approval not requested</span>
            ))}
          {app.offer_approval_status === "pending" &&
            (canApproveOffer ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs text-green-600"
                  onClick={async () => {
                    try {
                      await apiRequest("PATCH", "/api/recruitment/offers/" + app.offer_id + "/approve");
                      toast.success("Offer approved");
                      onApplicationUpdated?.({ ...app, offer_approval_status: "approved" });
                      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                    } catch {
                      toast.error("Failed to approve offer");
                    }
                  }}
                >
                  <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs text-red-500"
                  onClick={async () => {
                    try {
                      await apiRequest("PATCH", "/api/recruitment/offers/" + app.offer_id + "/reject");
                      toast.success("Offer rejected");
                      onApplicationUpdated?.({ ...app, offer_approval_status: "rejected" });
                      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                    } catch {
                      toast.error("Failed to reject offer");
                    }
                  }}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
              </>
            ) : (
              <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs text-amber-800">
                <Clock className="h-3.5 w-3.5" /> Awaiting approval
              </span>
            ))}
          {app.offer_approval_status === "approved" && app.offer_status === "draft" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs text-blue-600"
                onClick={async () => {
                  try {
                    const preset = await buildDraftOfferEmailPreset(app.offer_id!, app, {
                      timeZone: user?.timeZone ?? null,
                      dateFormat: user?.dateFormat ?? null,
                    });
                    setOfferEmailPreset(preset);
                  } catch {
                    toast.error("Failed to prepare offer email");
                  }
                }}
              >
                <Send className="mr-1 h-3.5 w-3.5" /> Send offer email
              </Button>
              {app.offer_letter_url ? (
                <a
                  href={`${typeof window !== "undefined" ? window.location.origin : ""}/api/recruitment/offers/${app.offer_id}/letter`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-lg border bg-muted/50 px-3 text-xs hover:bg-muted"
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> Letter
                </a>
              ) : (
                <Button variant="outline" size="sm" className="rounded-lg text-xs text-amber-700" onClick={() => setUploadLetterOfferId(app.offer_id!)}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Upload letter
                </Button>
              )}
            </>
          )}
          {app.offer_approval_status === "approved" && app.offer_status === "sent" && (
            <>
              {app.esign_status === "pending" && (
                <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs text-amber-800">
                  <Clock className="h-3.5 w-3.5" /> E-sign pending
                </span>
              )}
              {app.esign_status === "signed" && (
                <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 text-xs text-green-800">
                  <CheckCircle className="h-3.5 w-3.5" /> E-signed
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs text-teal-600"
                onClick={async () => {
                  try {
                    await apiRequest("PATCH", "/api/recruitment/offers/" + app.offer_id, { status: "accepted" });
                    toast.success("Offer marked as accepted");
                    onApplicationUpdated?.({ ...app, offer_status: "accepted" });
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
                  } catch (e: any) {
                    toast.error(e?.message || "Failed to mark accepted");
                  }
                }}
              >
                <CheckCircle className="mr-1 h-3.5 w-3.5" /> Mark accepted
              </Button>
              {app.offer_letter_url ? (
                <a
                  href={`${typeof window !== "undefined" ? window.location.origin : ""}/api/recruitment/offers/${app.offer_id}/letter`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-lg border bg-muted/50 px-3 text-xs hover:bg-muted"
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> Letter
                </a>
              ) : null}
            </>
          )}
          {app.offer_status === "accepted" && (
            <Button variant="outline" size="sm" className="rounded-lg text-xs text-green-600" onClick={() => setHireDialog({ open: true, app })}>
              <UserPlus className="mr-1 h-3.5 w-3.5" /> Hire
            </Button>
          )}
          {app.offer_approval_status === "rejected" && (
            <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-xs text-red-800">
              <XCircle className="h-3.5 w-3.5" /> Offer rejected
            </span>
          )}
        </>
      )}
      {canEditOfferDraft(app) && (
        <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => setOfferDialog({ open: true, app })}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit offer
        </Button>
      )}
      {canOpenCreateOffer(app) && (
        <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => setOfferDialog({ open: true, app })}>
          <Send className="mr-1 h-3.5 w-3.5" /> Create offer
        </Button>
      )}
    </>
  );

  return (
    <>
      <AlertDialog open={removeApplicantOpen} onOpenChange={setRemoveApplicantOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove applicant from this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-medium text-foreground">{app.first_name} {app.last_name}</span> from the pipeline for{" "}
              <span className="font-medium text-foreground">{jobTitle}</span>. You can still find them under Talent Pool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setRemoveApplicantOpen(false);
                onDeleteApplication();
              }}
            >
              Remove applicant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:h-[calc(100vh-180px)]">
        <div className="flex shrink-0 flex-col gap-1 border-b border-gray-200 bg-white px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-lg text-gray-700" onClick={onBack}>
              <ArrowRight className="mr-1 h-4 w-4 rotate-180" /> Back
            </Button>
          </div>
          <div className="min-w-0 sm:text-right">
            <h1 className="truncate text-sm font-semibold text-gray-900">
              {app.first_name} {app.last_name}
            </h1>
            <p className="truncate text-xs text-gray-500">{jobTitle}</p>
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-6">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            <ApplicantSummarySidebar
              firstName={app.first_name}
              lastName={app.last_name}
              email={app.candidate_email}
              stageId={app.stage}
              rejectReason={app.reject_reason}
              rejectComment={extractRejectionTeamComment(app.rejection_stage_notes, app.reject_reason)}
              rating={app.rating}
              ratingStars={
                <ApplicationRatingStars
                  applicationId={app.id}
                  rating={app.rating}
                  size="md"
                  onRate={async (newRating) => {
                    try {
                      await apiRequest("PATCH", `/api/recruitment/applications/${app.id}/rating`, { rating: newRating });
                      onApplicationUpdated?.({ ...app, rating: newRating });
                      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                      if (app.job_id) queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs", app.job_id] });
                      toast.success(newRating != null ? `Rated ${newRating} star${newRating === 1 ? "" : "s"}` : "Rating cleared");
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to update rating");
                    }
                  }}
                />
              }
              onMoveStage={() => setStageDialog({ open: true, app })}
              onAddNote={() => setDetailTab("comments")}
              onRemoveClick={() => setRemoveApplicantOpen(true)}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {pipelineMismatchAlert}
              <ApplicantPipelineTabBar active={detailTab} onChange={setDetailTab} />
            {/* emails tab: sub-tabs Send email | Thread */}
            {detailTab === "emails" && (
              <div className="flex-1 min-h-0 flex flex-col min-w-0">
                <div className="shrink-0 flex border-b px-4 gap-1 bg-muted/20">
                  <button
                    type="button"
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${emailPanelTab === "compose" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setEmailPanelTab("compose")}
                  >
                    Send email
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${emailPanelTab === "thread" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setEmailPanelTab("thread")}
                  >
                    <Inbox className="h-3.5 w-3.5" />
                    Thread
                    {emails.length > 0 && (
                      <span className="text-[10px] font-normal bg-muted rounded-full px-1.5 py-0">{emails.length}</span>
                    )}
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {emailPanelTab === "compose" ? (
                    <Card className="overflow-visible">
                      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                        <Send className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">New message</span>
                      </div>
                      <div className="px-4 py-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm border-b pb-3">
                          <span className="text-xs font-medium text-muted-foreground w-12 shrink-0">To</span>
                          <span className="text-sm">{app.candidate_email}</span>
                        </div>
                        <div className="flex items-center gap-2 border-b pb-3">
                          <span className="text-xs font-medium text-muted-foreground w-12 shrink-0">Subject</span>
                          <Input
                            placeholder="Subject"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            className="text-sm border-0 shadow-none focus-visible:ring-0 p-0 h-auto"
                          />
                        </div>
                        <SimpleEmailBodyEditor
                          remountKey={emailEditorKey}
                          value={emailBody}
                          onChange={setEmailBody}
                          placeholder="Write your message…"
                          contentMaxHeightClass="max-h-[280px]"
                        />
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                          <input
                            ref={emailFileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            accept="*/*"
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              e.target.value = "";
                              const current = emailAttachments;
                              const total = current.reduce((s, f) => s + f.size, 0);
                              const toAdd: File[] = [];
                              for (const f of files) {
                                if (current.length + toAdd.length >= MAX_ATTACHMENTS) break;
                                if (total + toAdd.reduce((s, x) => s + x.size, 0) + f.size > MAX_ATTACHMENTS_BYTES) {
                                  toast.error("Attachments exceed 8MB total");
                                  break;
                                }
                                toAdd.push(f);
                              }
                              setEmailAttachments((prev) => [...prev, ...toAdd]);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => emailFileInputRef.current?.click()}
                            disabled={emailAttachments.length >= MAX_ATTACHMENTS}
                          >
                            <Paperclip className="h-3.5 w-3.5 mr-1" />
                            Attach
                          </Button>
                          {emailAttachments.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-xs border">
                              <span className="max-w-[100px] truncate" title={f.name}>{f.name}</span>
                              <button type="button" aria-label="Remove" onClick={() => setEmailAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <span className="text-xs text-muted-foreground">max {MAX_ATTACHMENTS} files, 8MB</span>
                          <Button
                            size="sm"
                            disabled={sendEmailMutation.isPending}
                            className="ml-auto"
                            onClick={async () => {
                              const sub = emailSubject.trim();
                              if (!sub) { toast.error("Subject is required"); return; }
                              let attachments: Array<{ filename: string; content: string }> | undefined;
                              if (emailAttachments.length > 0) {
                                try {
                                  attachments = await Promise.all(
                                    emailAttachments.map(async (f) => ({ filename: f.name, content: await readFileAsBase64(f) }))
                                  );
                                } catch (e) {
                                  toast.error("Failed to read attachments");
                                  return;
                                }
                              }
                              sendEmailMutation.mutate(
                                { to: app.candidate_email, subject: sub, body: emailBody.trim(), attachments },
                                {
                                  onSuccess: (data: { delivered?: boolean }) => {
                                    const wasOfferFlip = !!pendingOfferFlipRef.current;
                                    if (data?.delivered) {
                                      toast.success(wasOfferFlip ? "Offer email sent to candidate — offer marked as sent" : "Email sent");
                                    } else {
                                      toast.success("Email saved to thread (not sent — set RESEND_API_KEY in .env)");
                                    }
                                    setEmailSubject("");
                                    setEmailBody("");
                                    setEmailEditorKey((k) => k + 1);
                                    setEmailAttachments([]);
                                    setEmailPanelTab("thread");
                                  },
                                  onError: (e: any) => toast.error(e?.message ?? "Failed to send"),
                                }
                              );
                            }}
                          >
                            <Send className="h-3.5 w-3.5 mr-1.5" />
                            {sendEmailMutation.isPending ? "Sending…" : "Send"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ) : (
                <Card className="overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    {selectedThreadEmail ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        onClick={() => setSelectedThreadEmail(null)}
                      >
                        <ArrowRight className="h-4 w-4 rotate-180" /> Back to list
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Inbox className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Thread with {app.candidate_email}</span>
                        {emails.length > 0 && (
                          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{emails.length}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedThreadEmail ? (
                    /* ── Full email view ── */
                    <div className="flex flex-col">
                      {/* Email meta */}
                      <div className="px-5 py-4 border-b space-y-2">
                        <h3 className="text-base font-semibold">{selectedThreadEmail.subject || "(No subject)"}</h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                          <span><span className="font-medium text-foreground">From:</span> {selectedThreadEmail.from_email}</span>
                          <span><span className="font-medium text-foreground">To:</span> {selectedThreadEmail.to_email}</span>
                          <span>
                            {formatDateTimeDisplay(
                              selectedThreadEmail.sent_at
                                ?? selectedThreadEmail.received_at
                                ?? selectedThreadEmail.created_at,
                              user?.timeZone ?? null,
                              user?.dateFormat ?? null,
                            )}
                          </span>
                          <span className={`inline-flex items-center gap-1 font-medium ${selectedThreadEmail.direction === "sent" ? "text-blue-600" : "text-green-600"}`}>
                            {selectedThreadEmail.direction === "sent" ? <Reply className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                            {selectedThreadEmail.direction === "sent" ? "Sent" : "Received"}
                          </span>
                        </div>
                      </div>
                      {/* Email body */}
                      <ScrollArea className="max-h-[380px]">
                        <div className="px-5 py-4">
                          {selectedThreadEmail.body_html ? (
                            <div
                              className="prose prose-sm max-w-none text-foreground"
                              dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(selectedThreadEmail.body_html) }}
                            />
                          ) : isHtmlContent(selectedThreadEmail.body_plain) ? (
                            <div
                              className="prose prose-sm max-w-none text-foreground"
                              dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(selectedThreadEmail.body_plain ?? "") }}
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap text-foreground">
                              {selectedThreadEmail.body_plain || "(No content)"}
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                      {/* Actions */}
                      <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          disabled={deleteEmailMutation.isPending}
                          onClick={() => deleteEmailMutation.mutate(selectedThreadEmail.id)}
                        >
                          {deleteEmailMutation.isPending ? "Deleting…" : "Delete from thread"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setEmailSubject(`Re: ${selectedThreadEmail.subject || ""}`);
                            setEmailEditorKey((k) => k + 1);
                            setSelectedThreadEmail(null);
                            setEmailPanelTab("compose");
                          }}
                        >
                          <Reply className="h-3.5 w-3.5 mr-1" /> Reply
                        </Button>
                      </div>
                    </div>
                  ) : emailsLoading ? (
                    <div className="px-4 py-8 text-sm text-muted-foreground text-center">Loading…</div>
                  ) : emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                      <Mail className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No messages yet.</p>
                      <p className="text-xs">Sent emails and candidate replies will appear here.</p>
                    </div>
                  ) : (
                    /* ── Email list (inbox rows) ── */
                    <div className="divide-y">
                      {[...emails]
                        .sort((a, b) => {
                          const ta = a.sent_at ?? a.received_at ?? a.created_at ?? "";
                          const tb = b.sent_at ?? b.received_at ?? b.created_at ?? "";
                          return new Date(tb).getTime() - new Date(ta).getTime();
                        })
                        .map((e) => {
                          const isSent = e.direction === "sent";
                          const ts = e.sent_at ?? e.received_at ?? e.created_at;
                          const preview = emailThreadBodyPreview(e.body_plain, e.body_html);
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setSelectedThreadEmail(e)}
                              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            >
                              <div className="flex items-start gap-3">
                                {/* Direction icon */}
                                <div className={`mt-0.5 shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isSent ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
                                  {isSent
                                    ? <Reply className="h-4 w-4" />
                                    : <Mail className="h-4 w-4" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span className="text-sm font-medium truncate">
                                      {isSent ? `To: ${e.to_email}` : e.from_email}
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : "—"}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-foreground truncate mb-0.5">{e.subject || "(No subject)"}</p>
                                  <p className="text-xs text-muted-foreground truncate">{preview}</p>
                                </div>
                                <ChevronDown className="h-4 w-4 shrink-0 mt-2 text-muted-foreground opacity-0 group-hover:opacity-100 -rotate-90 transition-opacity" />
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </Card>
                  )}
                </div>
              </div>
            )}
            <ScrollArea className={`min-h-0 flex-1${detailTab === "emails" || detailTab === "comments" ? " hidden" : ""}`}>
              {detailTab === "summary" && (
                <ApplicantSummaryTabPanels
                  loading={profileLoading}
                  candidateProfile={candidateProfile ?? null}
                  candidateId={app.candidate_id}
                  fallbackTitle={app.current_title}
                  fallbackCompany={app.current_company}
                  fallbackYears={app.experience_years}
                  resumeHref={resumeHref}
                  resumeFileName={resumeFileName}
                  resumeUpdatedAt={resumeUpdatedAt}
                  hasResume={!!(candidateProfile?.resume_url || (candidateProfile as { has_resume?: boolean } | null)?.has_resume || app.resume_url || app.has_resume)}
                  workflowSection={workflowNextSteps}
                  applicationDetail={thisApplication}
                />
              )}
              {detailTab === "profile" && (
                <div className="space-y-4">
                  {profileLoading ? (
                    <p className="text-sm text-muted-foreground">Loading profile…</p>
                  ) : candidateProfile ? (
                    <>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span className="flex items-center gap-1.5"><Mail className="h-4 w-4 shrink-0" /><a href={`mailto:${(candidateProfile.email as string) || ""}`} className="text-primary hover:underline">{(candidateProfile.email as string) || "—"}</a></span>
                        {!!candidateProfile.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 shrink-0" /> {String(candidateProfile.phone)}</span>}
                        {!!candidateProfile.linkedin_url && <a href={String(candidateProfile.linkedin_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline"><Linkedin className="h-4 w-4 shrink-0" /> LinkedIn</a>}
                      </div>
                      {thisApplication ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Quick contact above. Full profile (resume, employment, education) on{" "}
                            <Link href={`/recruitment/candidates/${app.candidate_id}`} className="text-primary hover:underline">
                              candidate Overview
                            </Link>
                            .
                          </p>
                          <ApplicationAnswers
                            customAnswers={thisApplication.custom_answers}
                            coverLetter={thisApplication.cover_letter}
                            referralSource={thisApplication.referral_source}
                            formConfig={thisApplication.form_config as import("@/components/ApplicationFormBuilderCore").FormConfig | null}
                            scope="application"
                            expanded
                          />
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No application form data for this job.</p>
                      )}
                      {candidateProfile.notes && (
                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">Notes</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{String(candidateProfile.notes)}</p>
                          </CardContent>
                        </Card>
                      )}
                      <p className="text-xs text-muted-foreground pt-2">
                        <Link href={`/recruitment/candidates/${app.candidate_id}`} className="text-primary hover:underline">Open full profile page</Link> for applications history and more.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Could not load profile.</p>
                  )}
                </div>
              )}
              {detailTab === "timeline" && (
                <ActivityFeed
                  applicationId={app.id}
                  auditLog={auditLog}
                  history={history}
                  loading={auditLoading || historyLoading}
                />
              )}
              {detailTab === "interviews" && (
                <InterviewsTab
                  applications={[
                    {
                      id: app.id,
                      job_title: app.job_title,
                      job_department: app.job_department,
                      job_location: app.location ?? null,
                      stage: app.stage,
                    },
                  ]}
                  candidate={{
                    id: app.candidate_id,
                    first_name: app.first_name,
                    last_name: app.last_name,
                    resume_url: app.resume_url,
                    resume_filename: app.resume_filename ?? null,
                  }}
                  employees={interviewEmployees as never}
                />
              )}
              {detailTab === "offer" && (
                <AppDetailOfferTab
                  app={app}
                  offer={offerDetail ?? null}
                  loading={offerDetailLoading}
                  onReload={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers", app.offer_id] });
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                  }}
                  onCreateOffer={() => setOfferDialog({ open: true, app })}
                  onEditOffer={canEditOfferDraft(app) ? () => setOfferDialog({ open: true, app }) : undefined}
                />
              )}
              {detailTab === "tasks" && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm font-medium text-gray-700">Tasks coming soon</p>
                  <p className="mt-1 text-xs text-gray-500">Checklist reminders for this application will appear here.</p>
                </div>
              )}
            </ScrollArea>
            {detailTab === "comments" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ApplicationComments applicationId={app.id} />
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== ACTIVITY FEED ====================

type AuditEntryFeed = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  performed_by_name: string | null;
  performed_by_email: string | null;
};
type StageHistoryFeed = {
  id?: string;
  from_stage: string | null;
  to_stage: string;
  notes: string | null;
  created_at: string;
  moved_by_email?: string;
  scheduled_at?: string | null;
  meeting_link?: string | null;
  interviewer_names?: string | null;
  interviewer_ids?: string[] | null;
  interview_type?: string | null;
};

const AUDIT_ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  JOB_CREATED:              { label: "Created job posting",                 icon: Briefcase,    color: "text-blue-600",    bg: "bg-blue-100" },
  JOB_UPDATED:              { label: "Updated job posting",                 icon: Pencil,       color: "text-blue-500",    bg: "bg-blue-50" },
  JOB_DELETED:              { label: "Deleted job posting",                 icon: Trash2,       color: "text-red-500",     bg: "bg-red-50" },
  APPLICATION_CREATED:      { label: "Added applicant",                     icon: UserPlus,     color: "text-emerald-600", bg: "bg-emerald-100" },
  STAGE_CHANGED:            { label: "Changed stage",                       icon: ArrowRight,   color: "text-violet-600",  bg: "bg-violet-100" },
  INTERVIEW_SCHEDULED:      { label: "Scheduled interview",                 icon: CalendarClock,color: "text-blue-600",    bg: "bg-blue-100" },
  INTERVIEW_ROUND_ADDED:    { label: "Added interview round",               icon: CalendarClock,color: "text-blue-500",    bg: "bg-blue-50" },
  RATING_UPDATED:           { label: "Updated rating",                      icon: Star,         color: "text-amber-500",   bg: "bg-amber-50" },
  EMAIL_SENT:               { label: "Sent email to candidate",             icon: Send,         color: "text-orange-500",  bg: "bg-orange-50" },
  COMMENT_ADDED:            { label: "Added a comment",                     icon: MessageSquare,color: "text-slate-500",   bg: "bg-slate-100" },
  OFFER_CREATED:            { label: "Created offer",                       icon: FileText,     color: "text-indigo-600",  bg: "bg-indigo-100" },
  OFFER_UPDATED:            { label: "Updated offer",                       icon: FileEdit,     color: "text-indigo-500",  bg: "bg-indigo-50" },
  OFFER_SENT:               { label: "Sent offer to candidate",             icon: Send,         color: "text-blue-600",    bg: "bg-blue-100" },
  OFFER_ACCEPTED_CANDIDATE: { label: "Candidate accepted offer",            icon: CheckCircle,  color: "text-emerald-600", bg: "bg-emerald-100" },
  OFFER_DECLINED_CANDIDATE: { label: "Candidate declined offer",            icon: XCircle,      color: "text-red-500",     bg: "bg-red-50" },
  OFFER_WITHDRAWN:          { label: "Withdrew offer",                      icon: Ban,          color: "text-orange-500",  bg: "bg-orange-50" },
  OFFER_APPROVED:           { label: "Approved offer",                      icon: CheckCircle,  color: "text-emerald-600", bg: "bg-emerald-100" },
  OFFER_REJECTED:           { label: "Rejected offer",                      icon: XCircle,      color: "text-red-500",     bg: "bg-red-50" },
  OFFER_APPROVAL_REQUESTED: { label: "Requested offer approval",            icon: Clock,        color: "text-amber-600",   bg: "bg-amber-100" },
  OFFER_LETTER_UPLOADED:    { label: "Uploaded offer letter",               icon: Upload,       color: "text-violet-500",  bg: "bg-violet-50" },
  OFFER_DOC_UPLOADED:       { label: "Uploaded offer document",             icon: Upload,       color: "text-violet-500",  bg: "bg-violet-50" },
  OFFER_TEMPLATE_MERGED:    { label: "Generated offer from template",       icon: FileEdit,     color: "text-violet-600",  bg: "bg-violet-100" },
  FEEDBACK_SUBMITTED:       { label: "Submitted interview feedback",        icon: CheckCircle,  color: "text-emerald-600", bg: "bg-emerald-100" },
  FEEDBACK_REMINDER_SENT:   { label: "Sent feedback reminder",              icon: RefreshCw,    color: "text-orange-500",  bg: "bg-orange-50" },
  CANDIDATE_HIRED:          { label: "Candidate hired",                     icon: UserCheck,    color: "text-emerald-700", bg: "bg-emerald-100" },
};

const STAGE_LABEL_MAP: Record<string, string> = {
  applied: "Applied", longlisted: "Longlisted", screening: "Screening",
  shortlisted: "Shortlisted", assessment: "Assessment", interview: "Interview",
  verbally_accepted: "Verbal Accept", offer: "Offer", tentative: "Tentative",
  rejected: "Rejected", hired: "Hired",
};

function ActivityFeed({
  auditLog,
  history,
  loading,
}: {
  applicationId: string;
  auditLog: AuditEntryFeed[];
  history: StageHistoryFeed[];
  loading: boolean;
}) {
  const { user } = useAuth();
  const feedTz = user?.timeZone ?? null;
  const feedDf = user?.dateFormat ?? null;
  // Build a unified feed: audit log entries + legacy stage history (entries before audit log era)
  type FeedItem = {
    id: string;
    kind: "audit" | "legacy";
    ts: number;
    created_at: string;
    action: string;
    label: string;
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    actor: string | null;
    actorEmail: string | null;
    detail?: React.ReactNode;
  };

  const auditTs = new Set(auditLog.map((e) => new Date(e.created_at).getTime()));

  const feedItems: FeedItem[] = [];

  // Audit log entries
  for (const entry of auditLog) {
    const cfg = AUDIT_ACTION_CONFIG[entry.action] ?? {
      label: entry.action.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
      icon: Activity,
      color: "text-slate-500",
      bg: "bg-slate-100",
    };
    let detail: React.ReactNode = null;
    const meta = entry.metadata ?? {};
    if (entry.action === "STAGE_CHANGED") {
      const from = STAGE_LABEL_MAP[String(meta.fromStage ?? "")] ?? String(meta.fromStage ?? "—");
      const to = STAGE_LABEL_MAP[String(meta.toStage ?? "")] ?? String(meta.toStage ?? "—");
      const isRejection = String(meta.toStage ?? "") === "rejected";
      const rejReason =
        meta.rejectReason != null && String(meta.rejectReason).trim() ? String(meta.rejectReason).trim() : null;
      const noteStr = meta.notes != null && String(meta.notes).trim() ? String(meta.notes).trim() : "";
      detail = (
        <div className="flex flex-col gap-1 text-xs mt-0.5 max-w-full">
          <span className="inline-flex items-center gap-1 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{from}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{to}</span>
            {!isRejection && noteStr ? (
              <span className="text-muted-foreground ml-1">· {noteStr}</span>
            ) : null}
          </span>
          {isRejection && rejReason ? (
            <span className="text-red-800 dark:text-red-200 font-medium leading-snug">
              Reason: {rejReason}
            </span>
          ) : null}
          {isRejection && noteStr ? (
            <span className="text-muted-foreground whitespace-pre-wrap leading-snug">
              <span className="font-medium text-foreground/90">Comment:</span> {noteStr}
            </span>
          ) : null}
        </div>
      );
    } else if (entry.action === "EMAIL_SENT" && meta.subject) {
      detail = <span className="text-xs text-muted-foreground mt-0.5">Subject: {String(meta.subject)}</span>;
    } else if (entry.action === "RATING_UPDATED") {
      const r = Number(meta.rating ?? 0);
      detail = (
        <span className="inline-flex items-center gap-0.5 mt-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`h-3 w-3 ${i < r ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
          ))}
        </span>
      );
    } else if ((entry.action === "OFFER_LETTER_UPLOADED" || entry.action === "OFFER_DOC_UPLOADED") && meta.fileName) {
      detail = <span className="text-xs text-muted-foreground mt-0.5">{String(meta.fileName)}</span>;
    } else if (entry.action === "FEEDBACK_SUBMITTED" && meta.rating != null) {
      const r = Number(meta.rating ?? 0);
      detail = r > 0 ? (
        <span className="inline-flex items-center gap-0.5 mt-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`h-3 w-3 ${i < r ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
          ))}
        </span>
      ) : null;
    }

    feedItems.push({
      id: entry.id,
      kind: "audit",
      ts: new Date(entry.created_at).getTime(),
      created_at: entry.created_at,
      action: entry.action,
      label: cfg.label,
      icon: cfg.icon,
      iconColor: cfg.color,
      iconBg: cfg.bg,
      actor: entry.performed_by_name,
      actorEmail: entry.performed_by_email,
      detail,
    });
  }

  // Legacy stage history entries (ones without a matching audit log entry within 10s)
  for (const h of history) {
    const hTs = new Date(h.created_at).getTime();
    const hasDuplicate = Array.from(auditTs).some((t) => Math.abs(t - hTs) < 10_000);
    if (!hasDuplicate) {
      const isInterview = (h.to_stage === "interview" || h.to_stage === "screening") && (h.scheduled_at != null || h.meeting_link != null);
      const from = STAGE_LABEL_MAP[h.from_stage ?? ""] ?? h.from_stage ?? "—";
      const to = STAGE_LABEL_MAP[h.to_stage] ?? h.to_stage;
      const legacyIsRejected = h.to_stage === "rejected";
      const legacyNotesRaw = (h.notes ?? "").trim();
      let legacyReasonLine: string | null = null;
      let legacyCommentOnly = legacyNotesRaw;
      if (legacyIsRejected && legacyNotesRaw) {
        const first = legacyNotesRaw.split("\n")[0] ?? "";
        if (/^reason:/i.test(first)) {
          legacyReasonLine = first.replace(/^reason:\s*/i, "").trim() || null;
          legacyCommentOnly = legacyNotesRaw.split("\n").slice(1).join("\n").trim();
        }
      }
      const legacyDetail = (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 text-xs flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{from}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{to}</span>
            {!legacyIsRejected && legacyNotesRaw ? (
              <span className="text-muted-foreground ml-1">· {h.notes}</span>
            ) : null}
          </span>
          {legacyIsRejected && legacyReasonLine ? (
            <span className="text-xs font-medium text-red-800 dark:text-red-200 leading-snug">Reason: {legacyReasonLine}</span>
          ) : null}
          {legacyIsRejected && legacyCommentOnly?.trim() ? (
            <span className="text-xs text-muted-foreground whitespace-pre-wrap leading-snug">
              <span className="font-medium text-foreground/90">Comment:</span> {legacyCommentOnly.trim()}
            </span>
          ) : null}
          {isInterview && (
            <span className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {h.scheduled_at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTimeDisplay(h.scheduled_at, feedTz, feedDf)}</span>}
                                {h.interview_type && <span>Type: {h.interview_type}</span>}
              {h.interviewer_names && <span>With: {h.interviewer_names}</span>}
              {h.meeting_link && <a href={h.meeting_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Join meeting</a>}
            </span>
                                )}
                              </div>
      );
      feedItems.push({
        id: h.id ?? `legacy-${hTs}`,
        kind: "legacy",
        ts: hTs,
        created_at: h.created_at,
        action: "STAGE_CHANGED",
        label: "Changed stage",
        icon: ArrowRight,
        iconColor: "text-violet-600",
        iconBg: "bg-violet-100",
        actor: null,
        actorEmail: h.moved_by_email ?? null,
        detail: legacyDetail,
      });
    }
  }

  feedItems.sort((a, b) => b.ts - a.ts);

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 items-start">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
        <Activity className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        <p className="text-xs text-muted-foreground">Actions taken on this application will appear here.</p>
      </div>
    );
  }

  // Group by date
  const grouped: Record<string, FeedItem[]> = {};
  for (const item of feedItems) {
    const ymd = formatCalendarYmdInTz(item.created_at, feedTz);
    const dateKey = ymd
      ? formatLeaveDisplayDate(ymd, feedTz, feedDf)
      : formatLeaveDisplayDate(item.created_at, feedTz, feedDf);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Activity log
        </h4>
        <span className="text-xs text-muted-foreground">{feedItems.length} event{feedItems.length !== 1 ? "s" : ""}</span>
      </div>
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1.5 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{date}</span>
          </div>
          <div className="relative">
            {/* Vertical connector */}
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
            <ul className="space-y-0">
              {items.map((item, idx) => {
                const Icon = item.icon;
                const timeStr = formatTimeOnlyDisplay(item.created_at, feedTz);
                const actorDisplay = item.actor ?? item.actorEmail;
                return (
                  <li key={item.id} className={`flex gap-3 items-start ${idx < items.length - 1 ? "pb-4" : "pb-2"}`}>
                    <div className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background shadow-sm ${item.iconBg}`}>
                      <Icon className={`h-3.5 w-3.5 ${item.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{item.label}</p>
                          {actorDisplay && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Users className="h-3 w-3 shrink-0" />
                              <span className="truncate">{actorDisplay}</span>
                            </p>
                          )}
                          {item.detail && <div className="mt-1">{item.detail}</div>}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 tabular-nums pt-0.5">{timeStr}</span>
                      </div>
                    </div>
                          </li>
                        );
                      })}
                    </ul>
                </div>
        </div>
      ))}
    </div>
  );
}

// ==================== APP DETAIL OFFER TAB ====================

const OFFER_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-orange-100 text-orange-700",
};
const OFFER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Offer Sent",
  accepted: "Offer Accepted",
  rejected: "Offer Declined",
  withdrawn: "Withdrawn",
};

function AppDetailOfferTab({
  app,
  offer,
  loading,
  onReload,
  onCreateOffer,
  onEditOffer,
}: {
  app: AppRow;
  offer: Record<string, unknown> | null;
  loading: boolean;
  onReload: () => void;
  onCreateOffer?: () => void;
  onEditOffer?: () => void;
}) {
  /** Same gate as the “Create Offer” button in Actions (sidebar). */
  const canCreateOfferFromPipeline = canOpenCreateOffer(app);

  if (!app.offer_id) {
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-dashed p-6 text-center">
          <FileText className="h-9 w-9 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No offer yet</p>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            This tab shows offer status, compensation, and the signed letter once an offer exists. After verbal acceptance—or if
            the pipeline is already at <strong className="text-foreground">Offer</strong> but no draft was saved—use{" "}
            <strong className="text-foreground">Create Offer</strong> in Actions (left) or below.
          </p>
          {canCreateOfferFromPipeline && onCreateOffer && (
            <Button variant="default" size="sm" className="mt-4" onClick={onCreateOffer}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Create Offer
            </Button>
          )}
          {!canCreateOfferFromPipeline && (
            <p className="text-xs text-muted-foreground mt-4">
              Current stage: <span className="font-medium text-foreground capitalize">{app.stage.replace(/_/g, " ")}</span>
            </p>
                      )}
                    </div>
                  </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                    </div>
    );
  }

  if (!offer) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">Failed to load offer details.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onReload}>Retry</Button>
                        </div>
    );
  }

  const status = String(offer.status ?? "");
  const esignStatus = String(offer.esign_status ?? "");
  const salary = offer.salary != null ? Number(offer.salary) : null;
  const currency = String(offer.salary_currency ?? "");
  const jobTitle = String(offer.job_title ?? app.job_title ?? "");
  const department = String(offer.department ?? app.job_department ?? "");
  const employmentType = String(offer.employment_type ?? "").replace(/_/g, " ");
  const { user: offerUser } = useAuth();
  const offerTz = offerUser?.timeZone ?? null;
  const offerDf = offerUser?.dateFormat ?? null;
  const startDate = offer.start_date ? formatRecruitmentDate(String(offer.start_date), offerTz, offerDf) : null;
  const respondedAt = offer.responded_at ? formatRecruitmentDate(String(offer.responded_at), offerTz, offerDf) : null;
  const sentAt = offer.sent_at ? formatRecruitmentDate(String(offer.sent_at), offerTz, offerDf) : null;
  const signedAt = offer.esign_signed_at ? formatDateTimeDisplay(String(offer.esign_signed_at), offerTz, offerDf) : null;
  const hasMergedDoc = !!(offer.merged_document_url || offer.offer_letter_url);
  const isSigned = esignStatus === "signed";
  const signedStoredUrl = String((offer as Record<string, unknown>).signed_document_url ?? "").trim();
  const signedDownloadHref =
    isSigned && (signedStoredUrl.startsWith("https://") || signedStoredUrl.startsWith("http://"))
      ? signedStoredUrl
      : `/api/recruitment/offers/${app.offer_id}/signed-pdf`;

  return (
    <div className="space-y-4 text-sm">
      {canEditOfferDraft(app) && onEditOffer && (
        <Button variant="outline" size="sm" onClick={onEditOffer}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit offer draft
        </Button>
      )}
      {/* Status block */}
      <div className="rounded-lg border p-4 flex items-start justify-between gap-3">
                        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
          <Badge className={`text-sm px-3 py-0.5 ${OFFER_STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"}`}>
            {OFFER_STATUS_LABELS[status] ?? status}
          </Badge>
                        </div>
        <FileText className="h-7 w-7 text-muted-foreground/25 shrink-0 mt-1" />
      </div>

      {/* Key dates */}
      {(respondedAt || sentAt || startDate) && (
        <div className="rounded-lg border p-4 grid grid-cols-2 gap-3">
          {respondedAt && (
            <div>
              <p className="text-xs text-muted-foreground">Accepted On</p>
              <p className="font-semibold mt-0.5">{respondedAt}</p>
            </div>
          )}
          {sentAt && !respondedAt && (
            <div>
              <p className="text-xs text-muted-foreground">Sent On</p>
              <p className="font-semibold mt-0.5">{sentAt}</p>
            </div>
          )}
          {startDate && (
            <div>
              <p className="text-xs text-muted-foreground">Joining Date</p>
              <p className="font-semibold mt-0.5">{startDate}</p>
                                </div>
          )}
                              </div>
      )}

      {/* Signers (e-sign) */}
      {(hasMergedDoc || esignStatus) && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Signers</span>
            {esignStatus && (
              <Badge
                variant="outline"
                className={`text-xs ${isSigned ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700"}`}
              >
                {isSigned ? (
                  <><CheckCircle className="h-3 w-3 mr-1 inline" />Signed (E-Signed)</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1 inline" />{esignStatus === "pending" ? "Pending e-sign" : esignStatus}</>
                )}
              </Badge>
            )}
          </div>
          {isSigned && signedAt && (
            <div className="flex items-center gap-3 p-2.5 rounded-md bg-emerald-50 border border-emerald-100">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{app.first_name} {app.last_name}</p>
                <p className="text-xs text-muted-foreground">{app.candidate_email}</p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0">Signed on {signedAt}</p>
            </div>
          )}
          {isSigned && (
            <a
              href={signedDownloadHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                                >
              <Download className="h-3.5 w-3.5" />
              {signedStoredUrl ? "Open signed offer (SharePoint)" : "Download signed offer letter (PDF)"}
                                </a>
                              )}
                            </div>
      )}

      {/* Compensation */}
      {salary != null && (
                          <div className="space-y-2">
          <h4 className="font-semibold">Compensation Information</h4>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Salary</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Annual salary</p>
                <p className="font-semibold mt-0.5">{salary.toLocaleString()}</p>
              </div>
              {startDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Joining Date</p>
                  <p className="font-semibold mt-0.5">{startDate}</p>
                          </div>
                        )}
              {currency && (
                <div>
                  <p className="text-xs text-muted-foreground">Pay Rate</p>
                  <p className="font-semibold mt-0.5">{currency} {Math.round(salary / 12).toLocaleString()} Monthly</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Employment Details */}
                          <div className="space-y-2">
        <h4 className="font-semibold">Employment Details</h4>
        <div className="rounded-lg border p-4 grid grid-cols-2 gap-x-6 gap-y-3">
          {jobTitle && <DetailCell label="Job title" value={jobTitle} />}
          {department && <DetailCell label="Department" value={department} />}
          {app.location && <DetailCell label="Job location" value={String(app.location)} />}
          {employmentType && <DetailCell label="Employment Type" value={employmentType.charAt(0).toUpperCase() + employmentType.slice(1)} />}
          {startDate && <DetailCell label="Joining Date" value={startDate} />}
        </div>
      </div>

      {/* Offer Information */}
      <div className="space-y-2">
        <h4 className="font-semibold">Offer Information</h4>
        <div className="rounded-lg border p-4 space-y-3">
          {hasMergedDoc && (
            <div>
              {isSigned ? (
                <a
                  href={signedDownloadHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors group max-w-xs"
                >
                  <div className="h-8 w-8 rounded bg-red-100 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {String(offer.offer_letter_filename ?? "Signed_Offer_Letter.pdf")}
                    </p>
                    {signedAt && <p className="text-xs text-muted-foreground mt-0.5">{signedAt}</p>}
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-2.5 p-2.5 rounded-md border bg-muted/20 max-w-xs">
                  <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{String(offer.offer_letter_filename ?? "Offer Letter")}</p>
                    <p className="text-xs text-muted-foreground">
                      {esignStatus === "pending" ? "Awaiting candidate signature" : "Offer document"}
                    </p>
                  </div>
                          </div>
                        )}
                      </div>
          )}
          {!!offer.terms && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Terms</p>
              <p className="text-foreground/80 text-xs leading-relaxed">{String(offer.terms)}</p>
                </div>
              )}
          {!hasMergedDoc && !offer.terms && (
            <p className="text-muted-foreground text-xs">No offer letter document attached.</p>
              )}
          </div>
        </div>
      </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

function parseRecruitmentSearch(): { tab: string; job: string; applicant: string } {
  if (typeof window === "undefined") return { tab: "jobs", job: "", applicant: "" };
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get("tab") || "jobs",
    job: params.get("job") || "",
    applicant: params.get("applicant") || "",
  };
}

/** Donut: theme primary = active pipeline, destructive = rejected segment; outer ring reflects posting status. */
function JobPostingDonutChart({
  applicationCount,
  rejectedCount,
  statusRingClassName,
}: {
  applicationCount: number;
  rejectedCount: number;
  statusRingClassName: string;
}) {
  const total = applicationCount;
  const rejected = Math.min(Math.max(0, rejectedCount), total);
  const nonRejected = Math.max(0, total - rejected);
  const activeDeg = total === 0 ? 0 : (nonRejected / total) * 360;
  const bg =
    total === 0
      ? "hsl(var(--muted))"
      : `conic-gradient(from -90deg, hsl(var(--primary)) 0deg ${activeDeg}deg, hsl(var(--destructive)) ${activeDeg}deg 360deg)`;
  return (
    <div className={cn("relative mx-auto h-[128px] w-[128px] shrink-0 rounded-full ring-offset-2 ring-offset-card", statusRingClassName)}>
      <div className="absolute inset-0 rounded-full" style={{ background: bg }} />
      <div className="absolute inset-[11px] flex flex-col items-center justify-center rounded-full border border-border/50 bg-card text-center shadow-sm">
        <span className="text-[26px] font-bold tabular-nums leading-none tracking-tight text-foreground">{total}</span>
        <span className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">In pool</span>
      </div>
    </div>
  );
}

function jobCardStatusMeta(status: string): {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  className: string;
  /** Subtle outer ring on the candidate donut — unique per posting status */
  donutRingClassName: string;
} {
  switch (status) {
    case "published":
      return {
        icon: Globe,
        label: "Published",
        className: "text-emerald-600 dark:text-emerald-400",
        donutRingClassName: "ring-2 ring-emerald-500/45 dark:ring-emerald-400/40",
      };
    case "paused":
      return {
        icon: PauseCircle,
        label: "On Hold",
        className: "text-amber-600 dark:text-amber-400",
        donutRingClassName: "ring-2 ring-amber-500/45 dark:ring-amber-400/40",
      };
    case "draft":
      return {
        icon: Lock,
        label: "Draft",
        className: "text-slate-600 dark:text-slate-400",
        donutRingClassName: "ring-2 ring-slate-400/50 dark:ring-slate-500/45",
      };
    case "closed":
      return {
        icon: Ban,
        label: "Closed",
        className: "text-rose-600 dark:text-rose-400",
        donutRingClassName: "ring-2 ring-rose-500/40 dark:ring-rose-400/35",
      };
    case "archived":
      return {
        icon: Archive,
        label: "Archived",
        className: "text-violet-600 dark:text-violet-400",
        donutRingClassName: "ring-2 ring-violet-500/40 dark:ring-violet-400/35",
      };
    default:
      return {
        icon: Briefcase,
        label: status,
        className: "text-muted-foreground",
        donutRingClassName: "ring-2 ring-border",
      };
  }
}

/** Soft avatar backgrounds derived from id — no extra API fields. */
const CANDIDATE_AVATAR_PALETTE = [
  "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200/90 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-800/60",
  "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200/90 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800/60",
  "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200/90 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800/60",
  "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/90 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800/60",
  "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200/90 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800/60",
  "bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-200/90 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-800/60",
] as const;

function candidateAvatarToneClass(candidateId: string): string {
  let h = 0;
  for (let i = 0; i < candidateId.length; i++) h = (h * 31 + candidateId.charCodeAt(i)) | 0;
  return CANDIDATE_AVATAR_PALETTE[Math.abs(h) % CANDIDATE_AVATAR_PALETTE.length];
}

export default function Recruitment({ forcedTab }: { forcedTab?: "jobs" | "candidates" } = {}) {
  const queryClient = useQueryClient();
  const { effectiveRole, user, isBreakGlassAccount } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState(forcedTab ?? "jobs");

  const updateApplicationsCache = (updatedApp: AppRow) => {
    queryClient.setQueriesData(
      { queryKey: ["/api/recruitment/applications"] },
      (old: unknown) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.map((a: AppRow) => (a.id === updatedApp.id ? { ...a, ...updatedApp } : a));
        if (typeof old === "object" && old !== null && "applications" in old && Array.isArray((old as { applications: AppRow[] }).applications)) {
          const data = old as { applications: AppRow[]; total: number };
          return { ...data, applications: data.applications.map((a) => (a.id === updatedApp.id ? { ...a, ...updatedApp } : a)) };
        }
        return old;
      }
    );
  };
  const [viewingJob, setViewingJob] = useState<JobPosting | null>(null);
  const [selectedAppInJobView, setSelectedAppInJobView] = useState<AppRow | null>(null);
  const applicantIdFromUrlRef = useRef<string | null>(null);
  const skipNextSyncToUrlRef = useRef(true);
  const search = useSearch();
  /** When opening "Add candidate" from a job, remember job for create + auto-link to pipeline. */
  const pendingLinkJobIdRef = useRef<string | null>(null);
  const [addCandidateForJobId, setAddCandidateForJobId] = useState<string | null>(null);
  const [addCandidateJobFormConfig, setAddCandidateJobFormConfig] = useState<FormConfig | null>(null);
  const [addCandidateJobFormLoading, setAddCandidateJobFormLoading] = useState(false);
  const [applicationForm, setApplicationForm] = useState<Record<string, string>>(() => ({ ...APPLICATION_FORM_EMPTY }));
  const [applicationCustomAnswers, setApplicationCustomAnswers] = useState<Record<string, string>>({});
  const [applicationRepeatableEntries, setApplicationRepeatableEntries] = useState<
    Record<string, Record<string, string>[]>
  >({});
  const [applicationResumeData, setApplicationResumeData] = useState<{ url: string; filename: string } | null>(null);
  const [linkAppFormConfig, setLinkAppFormConfig] = useState<FormConfig | null>(null);
  const [linkAppCustomAnswers, setLinkAppCustomAnswers] = useState<Record<string, string>>({});
  const [linkAppRepeatableEntries, setLinkAppRepeatableEntries] = useState<
    Record<string, Record<string, string>[]>
  >({});

  // Dialogs
  const [aiGeneratorOpen, setAIGeneratorOpen] = useState(false);
  const [preFillForJob, setPreFillForJob] = useState<{ title?: string; department?: string; description?: string; requirements?: string } | null>(null);
  const [jobDetailDialog, setJobDetailDialog] = useState<{ open: boolean; job: JobPosting | null; jobInfoOnly?: boolean }>({ open: false, job: null });
  const [stageDialog, setStageDialog] = useState<{ open: boolean; app: AppRow | null }>({ open: false, app: null });
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; app: AppRow | null }>({ open: false, app: null });
  const [hireDialog, setHireDialog] = useState<{ open: boolean; app: AppRow | null }>({ open: false, app: null });
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [applicantsPage, setApplicantsPage] = useState(1);
  const [applicantSearchTerm, setApplicantSearchTerm] = useState("");
  const [applicantSearchDebounced, setApplicantSearchDebounced] = useState("");
  const APPLICANTS_PER_PAGE = 50;
  useEffect(() => {
    const t = setTimeout(() => setApplicantSearchDebounced(applicantSearchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [applicantSearchTerm]);
  // When on Jobs tab: selectedJobId + viewingJob = job we're viewing applicants for; selectedAppInJobView = applicant we're viewing pipeline for
  const [addAppDialog, setAddAppDialog] = useState(false);
  const [addAppForm, setAddAppForm] = useState<{ candidateId: string; jobId: string; coverLetter: string }>({ candidateId: "", jobId: "", coverLetter: "" });
  const [addAppCandidateSearch, setAddAppCandidateSearch] = useState("");
  const [addAppSelectedCandidateLabel, setAddAppSelectedCandidateLabel] = useState("");
  const [addAppCandidateSearchDebounced, setAddAppCandidateSearchDebounced] = useState("");
  useEffect(() => {
    if (!addAppDialog) return;
    const t = setTimeout(() => setAddAppCandidateSearchDebounced(addAppCandidateSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [addAppDialog, addAppCandidateSearch]);
  const [uploadLetterOfferId, setUploadLetterOfferId] = useState<string | null>(null);
  const [uploadLetterFile, setUploadLetterFile] = useState<File | null>(null);
  /** Draft offer + template just created: pipeline opens Emails with signing link preset */
  const [pendingOpenOfferEmailAfterCreate, setPendingOpenOfferEmailAfterCreate] = useState<{ offerId: string; applicationId: string } | null>(null);
  const clearPendingOpenOfferEmail = useCallback(() => {
    setPendingOpenOfferEmailAfterCreate(null);
  }, []);
  useEffect(() => {
    if (!selectedAppInJobView) setPendingOpenOfferEmailAfterCreate(null);
  }, [selectedAppInJobView]);
  // Keep track of which application triggered the letter upload so we can update the panel immediately
  const uploadLetterAppRef = useRef<AppRow | null>(null);
  const [addCandidateDialog, setAddCandidateDialog] = useState(false);
  const [selectedPipelineApp, setSelectedPipelineApp] = useState<AppRow | null>(null);
  const [fullDetailPanelOpen, setFullDetailPanelOpen] = useState(false);
  const [linkedInPostJob, setLinkedInPostJob] = useState<{ id: string; title: string } | null>(null);
  const [migrateJobsLoading, setMigrateJobsLoading] = useState(false);
  const [migrateCandidatesLoading, setMigrateCandidatesLoading] = useState(false);
  const [migratePhase2Loading, setMigratePhase2Loading] = useState(false);
  const [migrateNewJobApplicantsLoading, setMigrateNewJobApplicantsLoading] = useState(false);
  const [migrateJobAuditLoading, setMigrateJobAuditLoading] = useState(false);
  const [phase2ResumeAfter, setPhase2ResumeAfter] = useState("");
  const [addCandidateForm, setAddCandidateForm] = useState<{
    firstName: string; middleName: string; lastName: string; email: string; phone: string;
    personalEmail: string; dateOfBirth: string; gender: string; maritalStatus: string; bloodGroup: string;
    street: string; city: string; state: string; zipCode: string; country: string;
    linkedinUrl: string; expectedSalary: string; salaryCurrency: string;
    currentCompany: string; currentTitle: string; experienceYears: string;
    resumeUrl: string; resumeFilename: string; source: string; notes: string;
  }>({
    firstName: "", middleName: "", lastName: "", email: "", phone: "",
    personalEmail: "", dateOfBirth: "", gender: "", maritalStatus: "", bloodGroup: "",
    street: "", city: "", state: "", zipCode: "", country: "",
    linkedinUrl: "", expectedSalary: "", salaryCurrency: "AED",
    currentCompany: "", currentTitle: "", experienceYears: "", resumeUrl: "", resumeFilename: "", source: "manual", notes: "",
  });
  const addCandidateResumeInputRef = useRef<HTMLInputElement>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editCandidateForm, setEditCandidateForm] = useState<{
    firstName: string; middleName: string; lastName: string; email: string; phone: string;
    personalEmail: string; dateOfBirth: string; gender: string; maritalStatus: string; bloodGroup: string;
    street: string; city: string; state: string; zipCode: string; country: string;
    linkedinUrl: string; expectedSalary: string; salaryCurrency: string;
    currentCompany: string; currentTitle: string; experienceYears: string; source: string; notes: string;
  }>({
    firstName: "", middleName: "", lastName: "", email: "", phone: "",
    personalEmail: "", dateOfBirth: "", gender: "", maritalStatus: "", bloodGroup: "",
    street: "", city: "", state: "", zipCode: "", country: "",
    linkedinUrl: "", expectedSalary: "", salaryCurrency: "AED",
    currentCompany: "", currentTitle: "", experienceYears: "", source: "manual", notes: "",
  });

  const [jobFilters, setJobFilters] = useState<{
    status: string[];
    department: string[];
    location: string[];
    employmentType: string[];
  }>({
    status: [],
    department: [],
    location: [],
    employmentType: [],
  });
  const prevOfferStatusRef = useRef<Map<string, string>>(new Map());
  const offerLetterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (uploadLetterOfferId) offerLetterInputRef.current?.click();
  }, [uploadLetterOfferId]);

  // Wrapper passed to child panels — tracks the current app so onSuccess can update it immediately
  const handleUploadLetterOfferId = (offerId: string | null, app?: AppRow) => {
    uploadLetterAppRef.current = app ?? selectedAppInJobView;
    setUploadLetterOfferId(offerId);
  };

  // Restore job / applicant from URL whenever the query string changes (deep links, notification clicks).
  useEffect(() => {
    const { job, applicant } = parseRecruitmentSearch();
    if (job) setSelectedJobId(job);
    if (applicant) applicantIdFromUrlRef.current = applicant;
  }, [search]);

  // Sync state -> URL when user changes tab, job, or selected applicant (enables refresh checkpoint)
  useEffect(() => {
    if (skipNextSyncToUrlRef.current) {
      skipNextSyncToUrlRef.current = false;
      return;
    }
    const basePath = activeTab === "candidates" ? "/recruitment/talent-pool" : "/recruitment/jobs";
    const params = new URLSearchParams();
    if (activeTab === "jobs") {
      if (selectedJobId) params.set("job", selectedJobId);
      const applicantForUrl = selectedAppInJobView?.id ?? applicantIdFromUrlRef.current;
      if (applicantForUrl) params.set("applicant", applicantForUrl);
    }
    const nextSearch = params.toString();
    setLocation(`${basePath}${nextSearch ? `?${nextSearch}` : ""}`);
  }, [activeTab, selectedJobId, selectedAppInJobView?.id, setLocation]);

  const jobsQueryParams = new URLSearchParams();
  jobFilters.status.forEach((s) => jobsQueryParams.append("status", s));
  jobFilters.department.forEach((d) => jobsQueryParams.append("department", d));
  jobFilters.location.forEach((l) => jobsQueryParams.append("location", l));
  jobFilters.employmentType.forEach((e) => jobsQueryParams.append("employmentType", e));
  jobsQueryParams.set("limit", "500");
  jobsQueryParams.set("offset", "0");
  const jobsQueryString = jobsQueryParams.toString();

  const hasActiveFilters =
    jobFilters.status.length > 0 ||
    jobFilters.department.length > 0 ||
    jobFilters.location.length > 0 ||
    jobFilters.employmentType.length > 0;

  const { data: jobsData } = useQuery<{ jobs: JobPosting[]; total: number }>({
    queryKey: [
      "/api/recruitment/jobs",
      JSON.stringify(jobFilters.status),
      JSON.stringify(jobFilters.department),
      JSON.stringify(jobFilters.location),
      JSON.stringify(jobFilters.employmentType),
    ],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/jobs?${jobsQueryString}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Jobs: ${res.status}`);
      const data = await res.json();
      if (data && typeof data.total === "number" && Array.isArray(data.jobs)) return data;
      return { jobs: Array.isArray(data) ? data : [], total: Array.isArray(data) ? data.length : 0 };
    },
    enabled: activeTab === "jobs",
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const jobs = jobsData?.jobs ?? [];
  const sortedJobs = useMemo(() => {
    const statusOrder: Record<string, number> = {
      published: 0,
      paused: 1,
      draft: 2,
      closed: 3,
      archived: 4,
    };
    return [...jobs].sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [jobs]);

  const jobSearchTerm = activeTab === "jobs" ? searchTerm.trim().toLowerCase() : "";
  const filteredJobs = useMemo(() => {
    if (!jobSearchTerm) return sortedJobs;
    return sortedJobs.filter(
      (j) =>
        (j.title ?? "").toLowerCase().includes(jobSearchTerm) ||
        (j.department ?? "").toLowerCase().includes(jobSearchTerm) ||
        (j.location ?? "").toLowerCase().includes(jobSearchTerm),
    );
  }, [sortedJobs, jobSearchTerm]);

  const openAddCandidateToJobDialog = (job: JobPosting) => {
    if (job.status !== "published" && job.status !== "paused") {
      toast.info("Publish or pause this job before adding candidates.");
      return;
    }
    setAddAppForm({ jobId: job.id, candidateId: "", coverLetter: "" });
    setAddAppSelectedCandidateLabel("");
    setAddAppCandidateSearch("");
    setAddAppCandidateSearchDebounced("");
    setLinkAppCustomAnswers({});
    setLinkAppRepeatableEntries({});
    setAddAppDialog(true);
  };

  const resetAddCandidateFormFields = useCallback(() => {
    setAddCandidateForm({
      firstName: "", middleName: "", lastName: "", email: "", phone: "",
      personalEmail: "", dateOfBirth: "", gender: "", maritalStatus: "", bloodGroup: "",
      street: "", city: "", state: "", zipCode: "", country: "",
      linkedinUrl: "", expectedSalary: "", salaryCurrency: "AED",
      currentCompany: "", currentTitle: "", experienceYears: "", resumeUrl: "", resumeFilename: "", source: "manual", notes: "",
    });
  }, []);

  const resetApplicationFormFields = useCallback(() => {
    setApplicationForm({ ...APPLICATION_FORM_EMPTY });
    setApplicationCustomAnswers({});
    setApplicationRepeatableEntries({});
    setApplicationResumeData(null);
  }, []);

  const handleApplicationResumeUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setApplicationResumeData({ url: reader.result as string, filename: file.name });
    };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    if (!addCandidateDialog || !addCandidateForJobId) {
      if (!addCandidateForJobId) setAddCandidateJobFormConfig(null);
      return;
    }
    let cancelled = false;
    setAddCandidateJobFormLoading(true);
    setAddCandidateJobFormConfig(null);
    apiRequest("GET", `/api/recruitment/jobs/${addCandidateForJobId}/application-form`)
      .then((r) => r.json())
      .then((cfg) => {
        if (!cancelled) setAddCandidateJobFormConfig(cfg?.sections ? (cfg as FormConfig) : null);
      })
      .catch(() => {
        if (!cancelled) setAddCandidateJobFormConfig(null);
      })
      .finally(() => {
        if (!cancelled) setAddCandidateJobFormLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addCandidateDialog, addCandidateForJobId]);

  useEffect(() => {
    if (!addAppDialog || !addAppForm.jobId) {
      setLinkAppFormConfig(null);
      return;
    }
    let cancelled = false;
    apiRequest("GET", `/api/recruitment/jobs/${addAppForm.jobId}/application-form`)
      .then((r) => r.json())
      .then((cfg) => {
        if (!cancelled) setLinkAppFormConfig(cfg?.sections ? (cfg as FormConfig) : null);
      })
      .catch(() => {
        if (!cancelled) setLinkAppFormConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [addAppDialog, addAppForm.jobId]);

  const { data: jobFilterOptions } = useQuery<{ departments: string[]; locations: string[]; employmentTypes: string[] }>({
    queryKey: ["/api/recruitment/jobs/filter-options"],
    enabled: activeTab === "jobs" || activeTab === "candidates",
  });
  const { data: jobsListForFilter } = useQuery<{ jobs: JobPosting[]; total: number }>({
    queryKey: ["/api/recruitment/jobs", "talent-pool-filter"],
    enabled: activeTab === "candidates",
    queryFn: async () => {
      const res = await fetch("/api/recruitment/jobs?limit=500&offset=0", { credentials: "include" });
      if (!res.ok) throw new Error(`Jobs: ${res.status}`);
      const data = await res.json();
      if (data && typeof data.total === "number" && Array.isArray(data.jobs)) return data;
      return { jobs: Array.isArray(data) ? data : [], total: Array.isArray(data) ? data.length : 0 };
    },
    staleTime: 120_000,
  });
  const { data: applicationsData, isLoading: applicationsLoading } = useQuery<{ applications: AppRow[]; total: number } | AppRow[]>({
    queryKey: ["/api/recruitment/applications", selectedJobId || "", applicantsPage, applicantSearchDebounced],
    queryFn: async ({ queryKey }) => {
      const [, jobId, page, search] = queryKey as [string, string, number, string];
      const params = new URLSearchParams();
      params.set("limit", jobId ? String(APPLICANTS_PER_PAGE) : "200");
      params.set("offset", jobId ? String((Number(page) - 1) * APPLICANTS_PER_PAGE) : "0");
      if (jobId) params.set("jobId", jobId);
      if (search) params.set("search", search);
      const res = await fetch(`/api/recruitment/applications?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Applications: ${res.status}`);
      const raw = await res.json();
      const data = raw?.data ?? raw;
      // Server returns { applications, total } when jobId is in the request; otherwise array
      if (data && typeof data === "object" && !Array.isArray(data) && "applications" in data) {
        const list = Array.isArray((data as any).applications) ? (data as any).applications : [];
        const total = Number((data as any).total);
        return { applications: list, total: Number.isFinite(total) ? total : list.length };
      }
      const list = Array.isArray(data) ? data : [];
      return { applications: list, total: list.length };
    },
    enabled: activeTab === "jobs" && !!selectedJobId,
    refetchInterval: 15_000,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
  const applications = Array.isArray(applicationsData) ? applicationsData : (applicationsData?.applications ?? []);
  const applicantsTotal = Array.isArray(applicationsData) ? applicationsData.length : (Number(applicationsData?.total) || 0);
  const applicantsTotalPages = Math.max(1, Math.ceil(applicantsTotal / APPLICANTS_PER_PAGE));

  // Pipeline/detail panel holds a snapshot of the selected row; merge fresh list data when it refetches
  // (offer, stage, etc.) so buttons like Create Offer update without a manual refresh.
  useEffect(() => {
    const id = selectedAppInJobView?.id;
    if (!id || !applications.length) return;
    const fresh = applications.find((a) => a.id === id);
    if (!fresh) return;
    setSelectedAppInJobView((prev) => {
      if (!prev || prev.id !== id) return prev;
      return { ...prev, ...fresh };
    });
  }, [applications, selectedAppInJobView?.id]);

  // When restored from URL (selectedJobId set), resolve viewingJob once jobs have loaded
  useEffect(() => {
    if (!selectedJobId || !jobs.length) return;
    const job = jobs.find((j) => j.id === selectedJobId);
    if (job && (!viewingJob || viewingJob.id !== selectedJobId)) setViewingJob(job);
  }, [selectedJobId, jobs, viewingJob?.id]);

  // When restored from URL (applicant= in URL), resolve selectedAppInJobView once applications have loaded
  useEffect(() => {
    const applicantId = applicantIdFromUrlRef.current;
    if (!applicantId || !applications.length) return;
    const app = applications.find((a) => a.id === applicantId);
    if (app) {
      setSelectedAppInJobView(app);
      applicantIdFromUrlRef.current = null;
    }
  }, [applications]);

  useEffect(() => {
    setApplicantsPage(1);
  }, [selectedJobId, applicantSearchDebounced]);
  useEffect(() => {
    if (!selectedJobId) setApplicantSearchTerm("");
  }, [selectedJobId]);
  const [candidatesPage, setCandidatesPage] = useState(1);
  const [candidatesPerPage, setCandidatesPerPage] = useState(50);
  const [candidateFilters, setCandidateFilters] = useState<{ stage: string[]; source: string[]; department: string[]; jobId: string[] }>({ stage: [], source: [], department: [], jobId: [] });
  useEffect(() => {
    setCandidatesPage(1);
  }, [searchTerm, candidateFilters]);
  const candidatesSearch = searchTerm.trim();
  const { data: candidateFilterOptions, isLoading: candidateFilterOptionsLoading } = useQuery<{
    stages: string[];
    sources: string[];
    departments: string[];
    jobs: { id: string; title: string }[];
  }>({
    queryKey: ["/api/recruitment/candidates/filter-options"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/recruitment/candidates/filter-options");
      return res.json();
    },
    enabled: activeTab === "candidates",
    staleTime: 120_000,
  });
  const talentPoolStageOptions = useMemo(() => {
    const fromApi = candidateFilterOptions?.stages ?? [];
    if (fromApi.length > 0) return fromApi;
    return STAGES.map((s) => s.id);
  }, [candidateFilterOptions?.stages]);
  const talentPoolDepartmentOptions = useMemo(() => {
    const set = new Set<string>();
    (candidateFilterOptions?.departments ?? []).forEach((d) => set.add(d));
    (jobFilterOptions?.departments ?? []).forEach((d) => set.add(d));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [candidateFilterOptions?.departments, jobFilterOptions?.departments]);
  const talentPoolJobOptions = useMemo(() => {
    const byId = new Map<string, string>();
    (candidateFilterOptions?.jobs ?? []).forEach((j) => byId.set(j.id, j.title));
    (jobsListForFilter?.jobs ?? []).forEach((j) => byId.set(j.id, j.title ?? "Untitled"));
    return [...byId.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [candidateFilterOptions?.jobs, jobsListForFilter?.jobs]);
  const talentPoolSourceOptions = candidateFilterOptions?.sources ?? [];
  const { data: candidatesData } = useQuery<{ candidates: CandidateRow[]; total: number }>({
    queryKey: ["/api/recruitment/candidates", candidatesPage, candidatesPerPage, candidatesSearch, candidateFilters],
    queryFn: async ({ queryKey }) => {
      const [, page, perPage, search, filters] = queryKey as [string, number, number, string, typeof candidateFilters];
      const params = new URLSearchParams();
      params.set("limit", String(perPage));
      params.set("offset", String((Number(page) - 1) * Number(perPage)));
      if (search) params.set("search", search);
      filters.stage.forEach((s) => params.append("stage", s));
      filters.source.forEach((s) => params.append("source", s));
      filters.department.forEach((d) => params.append("department", d));
      filters.jobId.forEach((j) => params.append("jobId", j));
      const res = await fetch(`/api/recruitment/candidates?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Candidates: ${res.status}`);
      const data = await res.json();
      if (data && typeof data.total === "number" && Array.isArray(data.candidates)) return data;
      return { candidates: Array.isArray(data) ? data : [], total: Array.isArray(data) ? data.length : 0 };
    },
    enabled: activeTab === "candidates",
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const candidatesList = candidatesData?.candidates ?? [];
  const candidatesTotal = candidatesData?.total ?? 0;
  const candidatesTotalPages = Math.max(1, Math.ceil(candidatesTotal / candidatesPerPage));
  const { data: addAppCandidateSearchResult, isLoading: addAppCandidateSearchLoading } = useQuery<{ candidates: CandidateRow[]; total: number }>({
    queryKey: ["/api/recruitment/candidates", "addAppSearch", addAppCandidateSearchDebounced],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (addAppCandidateSearchDebounced) params.set("search", addAppCandidateSearchDebounced);
      const res = await fetch(`/api/recruitment/candidates?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Candidates: ${res.status}`);
      const data = await res.json();
      if (data && typeof data.total === "number" && Array.isArray(data.candidates)) return data;
      return { candidates: Array.isArray(data) ? data : [], total: 0 };
    },
    enabled: addAppDialog && addAppCandidateSearchDebounced.length >= 2,
    staleTime: 30000,
  });
  const addAppSearchCandidates = addAppCandidateSearchResult?.candidates ?? [];
  const addAppSearchTotal = addAppCandidateSearchResult?.total ?? 0;
  // Fetch employees when a dialog that needs them is open (Job, Stage)
  const needsEmployees = stageDialog.open;
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    enabled: needsEmployees,
  });

  const { data: editingCandidateData } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/recruitment/candidates/detail", editingCandidateId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/candidates/${editingCandidateId}`);
      return res.json();
    },
    enabled: !!editingCandidateId,
  });
  useEffect(() => {
    if (editingCandidateData && editingCandidateId) {
      const d = editingCandidateData as any;
      setEditCandidateForm({
        firstName: d.first_name ?? "",
        middleName: d.middle_name ?? "",
        lastName: d.last_name ?? "",
        email: d.email ?? "",
        phone: d.phone ?? "",
        personalEmail: d.personal_email ?? "",
        dateOfBirth: d.date_of_birth ? String(d.date_of_birth).slice(0, 10) : "",
        gender: d.gender ?? "",
        maritalStatus: d.marital_status ?? "",
        bloodGroup: d.blood_group ?? "",
        street: d.street ?? "",
        city: d.city ?? "",
        state: d.state ?? "",
        zipCode: d.zip_code ?? "",
        country: d.country ?? "",
        linkedinUrl: d.linkedin_url ?? "",
        expectedSalary: d.expected_salary != null ? String(d.expected_salary) : "",
        salaryCurrency: d.salary_currency ?? "AED",
        currentCompany: d.current_company ?? "",
        currentTitle: d.current_title ?? "",
        experienceYears: d.experience_years != null ? String(d.experience_years) : "",
        source: d.source ?? "manual",
        notes: d.notes ?? "",
      });
    }
  }, [editingCandidateData, editingCandidateId]);

  const createApplicationMutation = useMutation({
    mutationFn: async (body: {
      candidateId: string;
      jobId: string;
      coverLetter?: string;
      referralSource?: string;
      customAnswers?: Record<string, unknown>;
    }) => {
      const r = await apiRequest("POST", "/api/recruitment/applications", {
        candidateId: body.candidateId,
        jobId: body.jobId,
        coverLetter: body.coverLetter ?? null,
        referralSource: body.referralSource ?? "ats_add_to_job",
        customAnswers: body.customAnswers ?? null,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to add application");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      setAddAppDialog(false);
      setAddAppForm({ candidateId: "", jobId: "", coverLetter: "" });
      setLinkAppCustomAnswers({});
      setLinkAppRepeatableEntries({});
      toast.success("Application added to pipeline");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add application"),
  });

  const createCandidateAndApplicationMutation = useMutation({
    mutationFn: async (payload: {
      candidate: Record<string, unknown>;
      jobId: string;
      coverLetter?: string;
      customAnswers?: Record<string, unknown>;
    }) => {
      const candRes = await apiRequest("POST", withRegionView("/api/recruitment/candidates/manual"), payload.candidate);
      if (!candRes.ok) {
        const err = await candRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create candidate");
      }
      const candidate = await candRes.json();
      const appRes = await apiRequest("POST", "/api/recruitment/applications", {
        candidateId: candidate.id,
        jobId: payload.jobId,
        coverLetter: payload.coverLetter ?? null,
        referralSource: "ats_manual_add",
        customAnswers: payload.customAnswers ?? null,
      });
      if (!appRes.ok) {
        const err = await appRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to add to pipeline");
      }
      return appRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      setAddCandidateDialog(false);
      setAddCandidateForJobId(null);
      pendingLinkJobIdRef.current = null;
      resetApplicationFormFields();
      resetAddCandidateFormFields();
      toast.success("Candidate added to job pipeline");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add candidate"),
  });

  const createCandidateMutation = useMutation({
    mutationFn: async (body: {
      firstName: string; middleName?: string; lastName: string; email: string; phone?: string;
      personalEmail?: string; dateOfBirth?: string; gender?: string; maritalStatus?: string; bloodGroup?: string;
      street?: string; city?: string; state?: string; zipCode?: string; country?: string;
      linkedinUrl?: string; expectedSalary?: number; salaryCurrency?: string;
      currentCompany?: string; currentTitle?: string; experienceYears?: number;
      resumeUrl?: string; resumeFilename?: string; source?: string; notes?: string;
    }) => {
      const r = await apiRequest("POST", withRegionView("/api/recruitment/candidates/manual"), body);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to add candidate");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      resetAddCandidateFormFields();
      setAddCandidateDialog(false);
      toast.success("Candidate added to talent pool");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add candidate"),
  });

  const updateCandidateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const r = await apiRequest("PATCH", `/api/recruitment/candidates/${id}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      setEditingCandidateId(null);
      toast.success("Candidate updated");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update candidate"),
  });

  const uploadLetterMutation = useMutation({
    mutationFn: async ({ offerId, file }: { offerId: string; file: File }) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });
      await apiRequest("POST", `/api/recruitment/offers/${offerId}/upload-letter`, {
        fileUrl: dataUrl,
        fileName: file.name,
      });
      return { fileName: file.name };
    },
    onSuccess: ({ fileName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
      // Immediately update the selected app panel so "Upload letter" → "View letter" and "Send via Email" stays visible
      const trackedApp = uploadLetterAppRef.current;
      if (trackedApp) {
        const letterUpdate = { offer_letter_url: "uploaded" as const, offer_letter_filename: fileName };
        updateApplicationsCache({ ...trackedApp, ...letterUpdate });
        // Only merge letter fields into current panel state so we don't overwrite offer_approval_status / offer_id / etc.
        setSelectedAppInJobView((prev) => (prev?.id === trackedApp.id ? { ...prev, ...letterUpdate } : prev));
        uploadLetterAppRef.current = null;
      }
      setUploadLetterOfferId(null);
      setUploadLetterFile(null);
      if (offerLetterInputRef.current) offerLetterInputRef.current.value = "";
      toast.success("Offer letter uploaded");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to upload offer letter"),
  });

  // Toast when an offer is accepted (detected on refetch; skip on first load)
  useEffect(() => {
    if (!applications.length) return;
    const prev = prevOfferStatusRef.current;
    const isSubsequentLoad = prev.size > 0;
    if (isSubsequentLoad) {
      for (const app of applications) {
        const nowAccepted = app.offer_status === "accepted";
        const wasAccepted = prev.get(app.id) === "accepted";
        if (nowAccepted && !wasAccepted) {
          const name = [app.first_name, app.last_name].filter(Boolean).join(" ") || app.candidate_email || "Candidate";
          toast.success(`Offer accepted — ${name} (${app.job_title || "job"})`, { duration: 6000 });
        }
      }
    }
    prevOfferStatusRef.current = new Map(applications.map((a) => [a.id, a.offer_status ?? ""]));
  }, [applications]);

  // Filter applications
  const filteredApps = applications.filter((a) => {
    const matchSearch = !searchTerm ||
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.candidate_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.job_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchJob = !selectedJobId || a.job_id === selectedJobId;
    return matchSearch && matchJob;
  });

  // Delete handlers
  const handleDeleteJob = async (id: string) => {
    if (!confirm("Delete this job posting and all its applications?")) return;
    try {
      await apiRequest("DELETE", `/api/recruitment/jobs/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs/filter-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      toast.success("Job deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const handleDeleteApp = async (id: string) => {
    if (!confirm("Remove this application from the pipeline? This cannot be undone.")) return;
    try {
      await apiRequest("DELETE", `/api/recruitment/applications/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      toast.success("Application removed from pipeline");
    } catch { toast.error("Failed to remove"); }
  };

  const handleDeleteCandidate = async (id: string) => {
    if (!confirm("Delete this candidate and all their applications? This cannot be undone.")) return;
    try {
      await apiRequest("DELETE", `/api/recruitment/candidates/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      toast.success("Candidate deleted");
    } catch { toast.error("Failed to delete candidate"); }
  };

  return (
    <Layout>
      <input
        ref={offerLetterInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadLetterOfferId) {
            if (file.size > 10 * 1024 * 1024) {
              toast.error("File must be under 10 MB");
              e.target.value = "";
              setUploadLetterOfferId(null);
              return;
            }
            uploadLetterMutation.mutate({ offerId: uploadLetterOfferId, file });
          }
          e.target.value = "";
        }}
      />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "jobs" | "candidates")} className="w-full">
        <div className="mb-6 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
              <Link href="/recruitment" className="hover:text-foreground transition-colors">
                Recruitment
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-medium text-foreground">
                {activeTab === "candidates" ? "Talent Pool" : "Jobs"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">
                {activeTab === "candidates" ? "Talent Pool" : "Jobs"}
              </h1>
              <TabsList className="h-8">
                <TabsTrigger value="jobs" className="text-xs px-3 h-7">Jobs</TabsTrigger>
                <TabsTrigger value="candidates" className="text-xs px-3 h-7">Talent Pool</TabsTrigger>
              </TabsList>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-initial md:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder={activeTab === "jobs" ? "Search jobs…" : "Search candidates…"} className="pl-9 h-9 rounded-xl border-border/80 bg-muted/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {activeTab === "jobs" && (
              <>
                {isBreakGlassAccount && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={migrateJobsLoading}
                    onClick={async () => {
                      setMigrateJobsLoading(true);
                      try {
                        const res = await apiRequest("POST", "/api/recruitment/migrate-freshteam-jobs");
                        const data = await res.json();
                        if (data.error) {
                          toast.error(data.message || data.error);
                          return;
                        }
                        toast.success(
                          `Jobs: ${data.created ?? 0} created, ${data.skippedExisting ?? 0} already linked (skipped), ${data.skippedNotPublished ?? 0} not published (skipped).`
                        );
                        if (data.errors?.length) {
                          const errPreview = data.errors
                            .slice(0, 3)
                            .map((e: { jobId?: number; error?: string }) => `FT ${e.jobId}: ${e.error ?? "failed"}`)
                            .join("; ");
                          toast.warning(`${data.errors.length} job(s) had errors. ${errPreview}${data.errors.length > 3 ? "…" : ""}`);
                        }
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs/filter-options"] });
                      } catch (e: any) {
                        toast.error(e?.message || "Migration failed");
                      } finally {
                        setMigrateJobsLoading(false);
                      }
                    }}
                  >
                    {migrateJobsLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CloudDownload className="h-4 w-4 mr-2" />
                    )}
                    Migrate from FreshTeam
                  </Button>
                )}
                {isBreakGlassAccount && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={migrateJobAuditLoading}
                    onClick={async () => {
                      setMigrateJobAuditLoading(true);
                      toast.info("Syncing created/updated dates and owners from FreshTeam for all linked jobs…", { duration: 6000 });
                      try {
                        const res = await fetch("/api/recruitment/sync-freshteam-job-audit", {
                          method: "POST",
                          credentials: "include",
                        });
                        if (!res.ok) {
                          const text = await res.text();
                          throw new Error(`${res.status}: ${text || res.statusText}`);
                        }
                        const data = await res.json();
                        if (data.error) {
                          toast.error(data.message || data.error);
                          return;
                        }
                        toast.success(
                          `${data.updated ?? 0} job(s) updated. Owners matched: ${data.ownerMatched ?? 0}${data.ownerUnmatched ? `, unmatched: ${data.ownerUnmatched}` : ""}.`
                        );
                        if (data.errors?.length) toast.warning(`${data.errors.length} job(s) had errors.`);
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
                      } catch (e: any) {
                        toast.error(e?.message || "Audit sync failed");
                      } finally {
                        setMigrateJobAuditLoading(false);
                      }
                    }}
                  >
                    {migrateJobAuditLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4 mr-2" />
                    )}
                    Sync job dates & owners
                  </Button>
                )}
                {isBreakGlassAccount && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={migrateNewJobApplicantsLoading || migrateCandidatesLoading}
                    onClick={async () => {
                      setMigrateNewJobApplicantsLoading(true);
                      toast.info("Syncing applicants for FT-linked jobs with zero applications…", { duration: 8000 });
                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), 60 * 60 * 1000);
                      try {
                        const res = await fetch("/api/recruitment/migrate-freshteam-candidates", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ onlyZeroApplicantJobs: true }),
                          signal: controller.signal,
                        });
                        clearTimeout(timeoutId);
                        if (!res.ok) {
                          const text = await res.text();
                          let errMsg = `${res.status}: ${text || res.statusText}`;
                          if (res.status === 409) errMsg = "A migration is already running. Wait for it to finish.";
                          throw new Error(errMsg);
                        }
                        const data = await res.json();
                        if (data.error) {
                          toast.error(data.message || data.error);
                          return;
                        }
                        const jobCount = data.jobsTargeted ?? data.targetedJobs?.length ?? 0;
                        if (jobCount === 0) {
                          toast.info(data.message ?? "No new jobs with zero applicants found.");
                          return;
                        }
                        const titles = Array.isArray(data.targetedJobs)
                          ? data.targetedJobs.map((j: { title?: string }) => j.title).filter(Boolean).slice(0, 3).join(", ")
                          : "";
                        toast.success(
                          `${jobCount} job(s): ${data.candidatesCreated ?? 0} candidates created, ${data.applicationsCreated ?? 0} applications linked.${titles ? ` (${titles}${jobCount > 3 ? "…" : ""})` : ""}`
                        );
                        if (data.errors?.length) toast.warning(`${data.errors.length} error(s) — check server console.`);
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
                      } catch (e: any) {
                        clearTimeout(timeoutId);
                        if (e?.name === "AbortError") toast.error("Timed out after 60 minutes. Check server logs.");
                        else toast.error(e?.message || "Sync failed");
                      } finally {
                        setMigrateNewJobApplicantsLoading(false);
                      }
                    }}
                  >
                    {migrateNewJobApplicantsLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Users className="h-4 w-4 mr-2" />
                    )}
                    Sync applicants (new jobs)
                  </Button>
                )}
                {isBreakGlassAccount && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={migratePhase2Loading || migrateNewJobApplicantsLoading}
                    onClick={async () => {
                      setMigratePhase2Loading(true);
                      toast.info("Syncing applicants from FreshTeam to current jobs…", { duration: 5000 });
                      try {
                        const res = await fetch("/api/recruitment/migrate-freshteam-candidates", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ phase2Only: true }),
                        });
                        if (!res.ok) {
                          const text = await res.text();
                          let errMsg = `${res.status}: ${text || res.statusText}`;
                          if (res.status === 409) errMsg = "A migration is already running. Wait for it to finish.";
                          throw new Error(errMsg);
                        }
                        const data = await res.json();
                        if (data.error) {
                          toast.error(data.message || data.error);
                          return;
                        }
                        toast.success(`Applicants synced: ${data.applicationsCreated ?? 0} application(s) linked to jobs.`);
                        if (data.errors?.length) toast.warning(`${data.errors.length} error(s) — check server console.`);
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
                      } catch (e: any) {
                        toast.error(e?.message || "Sync failed");
                      } finally {
                        setMigratePhase2Loading(false);
                      }
                    }}
                  >
                    {migratePhase2Loading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Sync applicants to jobs
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="rounded-xl">
                      <Plus className="h-4 w-4 mr-2" /> New Job
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation("/recruitment/jobs/new")}>
                      <FileEdit className="h-4 w-4 mr-2" /> Create manually
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAIGeneratorOpen(true)}>
                      <Sparkles className="h-4 w-4 mr-2" /> Generate with AI
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <TabsContent value="jobs" className="mt-0">
          <>
          {activeTab === "jobs" && selectedAppInJobView ? (
            <JobApplicantPipelineView
              app={selectedAppInJobView}
              jobTitle={viewingJob?.title ?? selectedAppInJobView.job_title}
              onBack={() => setSelectedAppInJobView(null)}
              setStageDialog={setStageDialog}
              setHireDialog={setHireDialog}
              setOfferDialog={setOfferDialog}
              setUploadLetterOfferId={handleUploadLetterOfferId}
              queryClient={queryClient}
              pendingOpenOfferEmailAfterCreate={pendingOpenOfferEmailAfterCreate}
              onConsumedPendingOpenOfferEmail={clearPendingOpenOfferEmail}
              onDeleteApplication={() => {
                handleDeleteApp(selectedAppInJobView.id);
                setSelectedAppInJobView(null);
              }}
              onApplicationUpdated={(updatedApp) => {
                updateApplicationsCache(updatedApp);
                setSelectedAppInJobView((prev) => (prev?.id === updatedApp.id ? { ...prev, ...updatedApp } : prev));
              }}
            />
          ) : activeTab === "jobs" && viewingJob && selectedJobId ? (
            /* View 2: Applicants list for the selected job */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setSelectedJobId(""); setViewingJob(null); }}>
                  <ArrowRight className="h-4 w-4 mr-1 rotate-180" /> Back to jobs
                </Button>
                <h2 className="text-lg font-semibold truncate">Applicants for {viewingJob.title}</h2>
                <Button
                  variant="default"
                  size="sm"
                  className="shrink-0 ml-auto"
                  disabled={viewingJob.status !== "published" && viewingJob.status !== "paused"}
                  title={viewingJob.status !== "published" && viewingJob.status !== "paused" ? "Publish or pause this job to add applicants" : undefined}
                  onClick={() => openAddCandidateToJobDialog(viewingJob)}
                >
                  <UserPlus className="h-4 w-4 mr-1.5" /> Add candidate to this job
                </Button>
              </div>
              {(viewingJob.status !== "published" && viewingJob.status !== "paused") && (
                <p className="text-xs text-muted-foreground">Publish or pause this job to add applicants manually.</p>
              )}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search applicants by name, email, or company…"
                  className="h-9 rounded-xl border-border/80 bg-muted/30 pl-9"
                  value={applicantSearchTerm}
                  onChange={(e) => setApplicantSearchTerm(e.target.value)}
                />
              </div>
              {applicationsLoading ? (
                <div className="flex items-center justify-center py-12"><Skeleton className="h-8 w-48" /></div>
              ) : applications.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 flex flex-col items-center text-center gap-4 max-w-md mx-auto">
                    <div className="rounded-full bg-muted/80 p-4">
                      <UserPlus className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {applicantSearchDebounced ? "No applicants match your search" : "No applicants yet"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {applicantSearchDebounced
                          ? "Try a different name, email, or company."
                          : <>Add someone from your candidate pool, or create a new profile and attach them to this opening. They start in <span className="font-medium text-foreground/90">Applied</span>.</>}
                      </p>
                    </div>
                    <Button
                      onClick={() => openAddCandidateToJobDialog(viewingJob)}
                      disabled={viewingJob.status !== "published" && viewingJob.status !== "paused"}
                    >
                      <UserPlus className="h-4 w-4 mr-2" /> Add candidate to this job
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm ring-1 ring-border/40">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/25 px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold tracking-wide text-primary-foreground shadow-sm">
                      Applicants <span className="tabular-nums">{applicantsTotal}</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">Sort</span>
                      <Select value="updated" onValueChange={() => {}}>
                        <SelectTrigger className="h-8 w-[148px] border-border/60 bg-background text-sm shadow-none focus:ring-1 focus:ring-primary/20">
                          <SelectValue placeholder="Last updated" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="updated">Last updated</SelectItem>
                          <SelectItem value="rating">Rating</SelectItem>
                          <SelectItem value="stage">Stage</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="hidden text-xs tabular-nums text-muted-foreground/90 sm:inline">
                        {applicantsTotal === 0
                          ? "0"
                          : `${(applicantsPage - 1) * APPLICANTS_PER_PAGE + 1}–${Math.min(applicantsPage * APPLICANTS_PER_PAGE, applicantsTotal)}`}{" "}
                        of {applicantsTotal}
                      </span>
                      <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-background p-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-sm transition-colors duration-150 hover:bg-muted"
                          disabled={applicantsPage <= 1}
                          onClick={() => setApplicantsPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronRight className="h-4 w-4 rotate-180" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-sm transition-colors duration-150 hover:bg-muted"
                          disabled={applicantsPage >= applicantsTotalPages}
                          onClick={() => setApplicantsPage((p) => Math.min(applicantsTotalPages, p + 1))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-primary/15 bg-primary hover:bg-primary [&>th]:h-auto">
                        <TableHead className="w-11 pl-5 align-middle text-primary-foreground/95">
                          <Checkbox
                            className="h-3.5 w-3.5 border-primary-foreground/40 shadow-none transition-colors duration-150 focus-visible:ring-primary-foreground/40 data-[state=checked]:border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                            disabled
                            aria-label="Select applicants"
                          />
                        </TableHead>
                        <TableHead className="min-w-[200px] py-3.5 pl-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                          Name
                        </TableHead>
                        <TableHead className="min-w-[160px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                          Stages
                        </TableHead>
                        <TableHead className="w-[140px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                          Owner
                        </TableHead>
                        <TableHead className="w-[108px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                          Resume / Links
                        </TableHead>
                        <TableHead className="w-[200px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                          <div className="flex items-center gap-1.5">
                            <Star className="h-3.5 w-3.5 opacity-90" aria-hidden />
                            Job Fitment Rating
                          </div>
                        </TableHead>
                        <TableHead className="w-11 pr-4 text-right text-primary-foreground/80" />
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr]:transition-colors [&_tr]:duration-150 [&_tr]:ease-out">
                      {applications.map((app, rowIdx) => {
                        const stageInfo = STAGES.find((s) => s.id === app.stage);
                        const fullName = `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim();
                        const initials = `${app.first_name?.[0] ?? ""}${app.last_name?.[0] ?? ""}`.toUpperCase() || "?";
                        const resumeHref = app.resume_url || `/api/recruitment/candidates/${app.candidate_id}/resume`;
                        const hasResume = !!(app.resume_url || app.has_resume);
                        const liRaw = (app.candidate_linkedin_url ?? "").trim();
                        const linkedinHref =
                          !liRaw
                            ? null
                            : liRaw.startsWith("http://") || liRaw.startsWith("https://")
                              ? liRaw
                              : `https://${liRaw.replace(/^\/+/, "")}`;
                        const progressFilled = applicantStageProgressFilled(app.stage);
                        const rejectionTeamComment = extractRejectionTeamComment(
                          app.rejection_stage_notes,
                          app.reject_reason,
                        );
                        const ratingCaption =
                          app.stage === "rejected"
                            ? "Rejected"
                            : app.stage_updated_at &&
                                Date.now() - new Date(app.stage_updated_at).getTime() < 72 * 3600 * 1000
                              ? "New to this stage"
                              : app.stage_updated_at
                                ? `Updated ${formatDistanceToNow(new Date(app.stage_updated_at), { addSuffix: true })}`
                                : "New to this stage";

                        const rowOpen = (e: MouseEvent) => {
                          const el = e.target as HTMLElement;
                          if (el.closest("a,button,[role='checkbox'],input,label,[data-prevent-row-nav]")) return;
                          setSelectedAppInJobView(app);
                        };

                        return (
                          <TableRow
                            key={app.id}
                            role="button"
                            tabIndex={0}
                            onClick={rowOpen}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedAppInJobView(app);
                              }
                            }}
                            className={cn(
                              "group cursor-pointer border-b border-border/50 transition-colors duration-150 ease-out last:border-0",
                              rowIdx % 2 === 0 ? "bg-background" : "bg-muted/[0.28]",
                              "hover:bg-muted/55 active:bg-muted/70",
                            )}
                          >
                            <TableCell className="w-11 pl-5 align-middle" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                className="h-3.5 w-3.5 border-muted-foreground/35 shadow-none transition-all duration-150 hover:border-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-primary/25 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                aria-label={`Select ${fullName}`}
                              />
                            </TableCell>
                            <TableCell className="min-w-0 py-4 pl-2 align-middle">
                              <div className="flex items-center gap-3.5">
                                <Avatar className="h-10 w-10 shrink-0 shadow-sm">
                                  <AvatarFallback
                                    className={cn(
                                      "text-[0.8125rem] font-semibold leading-none tracking-tight",
                                      candidateAvatarToneClass(app.candidate_id),
                                    )}
                                  >
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <Link
                                    href={`/recruitment/candidates/${app.candidate_id}`}
                                    data-prevent-row-nav
                                    onClick={(e) => e.stopPropagation()}
                                    className="block truncate text-[15px] font-semibold leading-snug tracking-tight text-foreground hover:text-primary hover:underline"
                                  >
                                    {fullName}
                                  </Link>
                                  {(() => {
                                    const deptJob = formatDepartmentWithJob(app.job_department, app.job_title);
                                    return deptJob ? (
                                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground/90" title={deptJob}>
                                        {deptJob}
                                      </p>
                                    ) : (
                                      <p className="mt-0.5 text-[13px] text-muted-foreground/70">—</p>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="min-w-[150px] py-4 align-middle">
                              <div className="flex flex-col gap-1.5">
                                <div
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-2 py-1.5 text-left text-xs font-medium text-foreground"
                                  title={stageInfo?.label || app.stage}
                                >
                                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", stageInfo?.color || "bg-muted-foreground")} />
                                  <span className="truncate">{stageInfo?.label || app.stage}</span>
                                </div>
                                <div className="flex items-center gap-1 pl-0.5" aria-hidden>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <div
                                      key={n}
                                      className={cn(
                                        "h-2 w-2 rounded-full border transition-colors duration-150",
                                        app.stage === "rejected"
                                          ? n === 1
                                            ? "border-destructive/50 bg-destructive/35"
                                            : "border-border/50 bg-muted/40"
                                          : n <= progressFilled
                                            ? "border-primary/40 bg-primary shadow-sm"
                                            : "border-border/60 bg-muted/50",
                                      )}
                                    />
                                  ))}
                                </div>
                                {app.stage === "rejected" &&
                                  (app.reject_reason?.trim() || rejectionTeamComment?.trim()) && (
                                    <div
                                      className="mt-2 max-w-[280px] rounded-md border border-red-200/90 bg-red-50/90 px-2 py-1.5 text-[11px] leading-snug text-red-950 shadow-sm dark:border-red-900 dark:bg-red-950/35 dark:text-red-50"
                                      title={
                                        [
                                          app.reject_reason?.trim()
                                            ? `Reason: ${app.reject_reason.trim()}`
                                            : "",
                                          rejectionTeamComment?.trim()
                                            ? `Comment: ${rejectionTeamComment.trim()}`
                                            : "",
                                        ]
                                          .filter(Boolean)
                                          .join("\n\n") || undefined
                                      }
                                    >
                                      {app.reject_reason?.trim() ? (
                                        <p className="font-medium">
                                          <span className="text-red-800/90 dark:text-red-200">Reason:</span>{" "}
                                          <span className="font-normal">{app.reject_reason.trim()}</span>
                                        </p>
                                      ) : null}
                                      {rejectionTeamComment?.trim() ? (
                                        <p
                                          className={cn(
                                            "text-red-900/95 dark:text-red-100/95 whitespace-pre-wrap",
                                            app.reject_reason?.trim() && "mt-1 pt-1 border-t border-red-200/70 dark:border-red-800/60",
                                          )}
                                        >
                                          <span className="font-semibold text-red-800 dark:text-red-200">Comment:</span>{" "}
                                          {rejectionTeamComment.trim()}
                                        </p>
                                      ) : null}
                                    </div>
                                  )}
                              </div>
                            </TableCell>
                            <TableCell className="py-4 align-middle">
                              {app.job_owner_display?.trim() ? (
                                <div className="flex max-w-[140px] items-center gap-2">
                                  <Avatar className="h-8 w-8 shrink-0 border border-border/60 shadow-sm">
                                    <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
                                      {ownerAvatarInitials(app.job_owner_display)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate text-xs leading-snug text-muted-foreground" title={app.job_owner_display}>
                                    {app.job_owner_display}
                              </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/70" title="No creator recorded for this job posting">
                                  Unassigned
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {hasResume ? (
                                      <a
                                        href={resumeHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-prevent-row-nav
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          window.open(resumeHref, "_blank", "noopener,noreferrer");
                                        }}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground shadow-sm transition-all duration-150 hover:border-primary/30 hover:bg-muted hover:text-foreground active:scale-[0.97]"
                                      >
                                        <FileText className="h-4 w-4" strokeWidth={2} />
                                      </a>
                                    ) : (
                                      <span className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/20 text-muted-foreground/35">
                                        <FileText className="h-4 w-4" />
                                      </span>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{hasResume ? "View resume" : "No resume on file"}</TooltipContent>
                                </Tooltip>
                                {linkedinHref ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a
                                        href={linkedinHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-prevent-row-nav
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background text-[#0A66C2] shadow-sm transition-all duration-150 hover:border-primary/30 hover:bg-muted active:scale-[0.97]"
                                        aria-label="Open LinkedIn profile"
                                      >
                                        <Linkedin className="h-4 w-4" strokeWidth={2} />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Open LinkedIn</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/15 text-muted-foreground/30">
                                        <Linkedin className="h-4 w-4" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">No LinkedIn URL</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-col gap-1">
                                <ApplicationRatingStars
                                  applicationId={app.id}
                                  rating={app.rating}
                                  size="sm"
                                  onRate={async (newRating) => {
                                    try {
                                      await apiRequest("PATCH", `/api/recruitment/applications/${app.id}/rating`, { rating: newRating });
                                      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                                      if (app.job_id) queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs", app.job_id] });
                                      setSelectedAppInJobView((prev) => (prev?.id === app.id ? { ...prev, rating: newRating } : prev));
                                      toast.success(newRating != null ? `Rated ${newRating} star${newRating === 1 ? "" : "s"}` : "Rating cleared");
                                    } catch (e: unknown) {
                                      toast.error(e instanceof Error ? e.message : "Failed to update rating");
                                    }
                                  }}
                                />
                                <span className="text-[11px] leading-tight text-muted-foreground/80">{ratingCaption}</span>
                              </div>
                              </TableCell>
                            <TableCell className="w-11 py-4 pr-4 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    data-prevent-row-nav
                                    className="h-8 w-8 text-muted-foreground opacity-40 transition-all duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                                    aria-label={`Actions for ${fullName}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                              </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[180px]">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedAppInJobView(app);
                                    }}
                                  >
                                    <Eye className="mr-2 h-4 w-4" /> Open pipeline
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setStageDialog({ open: true, app })}>
                                    <ArrowRight className="mr-2 h-4 w-4" /> Change stage
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      handleDeleteApp(app.id);
                                      if (selectedAppInJobView?.id === app.id) setSelectedAppInJobView(null);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Remove from job
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                  {applicantsTotal > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border mt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {(applicantsPage - 1) * APPLICANTS_PER_PAGE + 1}–{Math.min(applicantsPage * APPLICANTS_PER_PAGE, applicantsTotal)} of {applicantsTotal} applicants
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={applicantsPage <= 1}
                          onClick={() => setApplicantsPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <span className="px-3 text-sm text-muted-foreground">
                          Page {applicantsPage} of {applicantsTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={applicantsPage >= applicantsTotalPages}
                          onClick={() => setApplicantsPage((p) => Math.min(applicantsTotalPages, p + 1))}
                        >
                          Next
                        </Button>
                      </div>
                </div>
                  )}
                </>
              )}
            </div>
          ) : (
          /* View 3: Job postings list */
          <div className="space-y-4">
            {/* Jobs filter bar – multi-select */}
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Filters:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 min-w-[130px] justify-between font-normal">
                    {jobFilters.status.length === 0 ? "Status" : `Status (${jobFilters.status.length})`}
                    <span className="opacity-50">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  {["draft", "published", "paused", "closed", "archived"].map((s) => (
                    <label key={s} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={jobFilters.status.includes(s)}
                        onCheckedChange={(checked) => {
                          setJobFilters((f) => ({
                            ...f,
                            status: checked ? [...f.status, s] : f.status.filter((x) => x !== s),
                          }));
                        }}
                      />
                      <span className="capitalize">{s}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 min-w-[160px] justify-between font-normal">
                    {jobFilters.department.length === 0 ? "Department" : `Department (${jobFilters.department.length})`}
                    <span className="opacity-50">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-64 overflow-auto p-2" align="start">
                  {(jobFilterOptions?.departments ?? []).map((d) => (
                    <label key={d} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={jobFilters.department.includes(d)}
                        onCheckedChange={(checked) => {
                          setJobFilters((f) => ({
                            ...f,
                            department: checked ? [...f.department, d] : f.department.filter((x) => x !== d),
                          }));
                        }}
                      />
                      <span>{d}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 min-w-[160px] justify-between font-normal">
                    {jobFilters.location.length === 0 ? "Location" : `Location (${jobFilters.location.length})`}
                    <span className="opacity-50">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-64 overflow-auto p-2" align="start">
                  {(jobFilterOptions?.locations ?? []).map((loc) => (
                    <label key={loc} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={jobFilters.location.includes(loc)}
                        onCheckedChange={(checked) => {
                          setJobFilters((f) => ({
                            ...f,
                            location: checked ? [...f.location, loc] : f.location.filter((x) => x !== loc),
                          }));
                        }}
                      />
                      <span>{loc}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 min-w-[140px] justify-between font-normal">
                    {jobFilters.employmentType.length === 0 ? "Employment" : `Employment (${jobFilters.employmentType.length})`}
                    <span className="opacity-50">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  {(jobFilterOptions?.employmentTypes ?? []).map((et) => (
                    <label key={et} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={jobFilters.employmentType.includes(et)}
                        onCheckedChange={(checked) => {
                          setJobFilters((f) => ({
                            ...f,
                            employmentType: checked ? [...f.employmentType, et] : f.employmentType.filter((x) => x !== et),
                          }));
                        }}
                      />
                      <span>{(et || "").replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setJobFilters({ status: [], department: [], location: [], employmentType: [] })}>
                  Clear filters
                </Button>
              )}
            </div>

            {filteredJobs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mb-3 opacity-40" />
                  <p className="font-medium">{jobSearchTerm ? "No jobs match your search" : "No job postings yet"}</p>
                  <p className="text-sm">{jobSearchTerm ? "Try a different keyword or clear the search." : "Create your first job posting to start recruiting."}</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="mt-4">
                        <Plus className="h-4 w-4 mr-2" /> Create Job
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuItem onClick={() => setLocation("/recruitment/jobs/new")}>
                        <FileEdit className="h-4 w-4 mr-2" /> Create manually
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAIGeneratorOpen(true)}>
                        <Sparkles className="h-4 w-4 mr-2" /> Generate with AI
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
                {filteredJobs.map((job) => {
                  const rejected = job.rejected_count ?? 0;
                  const recent = job.recent_applications_7d ?? 0;
                  const statusMeta = jobCardStatusMeta(job.status);
                  const StatusIcon = statusMeta.icon;
                  const locLine = [job.location?.trim() || null, (job.employment_type || "").replace(/_/g, " ").trim() || null]
                    .filter(Boolean)
                    .join(" | ");
                  const openJob = () => {
                    setSelectedJobId(job.id);
                    setViewingJob(job);
                  };
                  return (
                    <div
                    key={job.id}
                      className="flex min-w-0 flex-col rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm ring-offset-background transition-shadow hover:shadow-md"
                    >
                      <div className="flex flex-1 cursor-pointer flex-col px-4 pb-1 pt-4" onClick={openJob}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{job.department}</span>
                          {recent > 0 ? (
                            <span
                              className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold tabular-nums text-white shadow-sm"
                              title={`${recent} application(s) in the last 7 days`}
                            >
                              {recent > 999 ? "999+" : recent}
                        </span>
                          ) : null}
                      </div>
                        <h3 className="mt-2 line-clamp-2 min-h-[2.5rem] text-center text-[15px] font-bold leading-snug tracking-tight text-foreground">
                          {job.title}
                        </h3>
                        <div className="mt-5 flex justify-center">
                          <JobPostingDonutChart
                            applicationCount={job.application_count}
                            rejectedCount={rejected}
                            statusRingClassName={statusMeta.donutRingClassName}
                          />
                        </div>
                        <div className="mt-5 flex min-h-[1.25rem] items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="line-clamp-2 capitalize">{locLine || "—"}</span>
                        </div>
                      </div>
                      <div
                        className="mt-3 flex items-center justify-between gap-2 border-t border-border px-4 pb-3 pt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={`flex min-w-0 items-center gap-1.5 text-xs font-semibold ${statusMeta.className}`}>
                          <StatusIcon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          <span className="truncate">{statusMeta.label}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-0.5 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => setLocation(`/recruitment/jobs/${job.id}`)}
                          >
                            Details
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="More actions">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setLocation(`/recruitment/jobs/${job.id}`)}>
                                <Eye className="h-4 w-4 mr-2" /> Overview
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/recruitment/jobs/${job.id}/edit`)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit job
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/recruitment/jobs/new?duplicateFrom=${job.id}`)}>
                                <CopyPlus className="h-4 w-4 mr-2" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  const jobId = job?.id;
                              const url = jobId
                                ? `${window.location.origin}/careers?job=${encodeURIComponent(jobId)}`
                                : `${window.location.origin}/careers`;
                              navigator.clipboard.writeText(url);
                                  if (jobId) toast.success("Career page link copied");
                              else toast.warning("Job ID missing; general career page link copied.");
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" /> Copy career link
                            </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  const jobId = job?.id;
                              const url = jobId
                                ? `${window.location.origin}/careers?job=${encodeURIComponent(jobId)}`
                                : `${window.location.origin}/careers`;
                                  window.open(
                                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
                                    "_blank",
                                    "width=600,height=400"
                                  );
                                }}
                              >
                              <Linkedin className="h-4 w-4 mr-2" /> Share on LinkedIn
                            </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setLinkedInPostJob({ id: job.id, title: job.title })}
                                className="font-medium"
                                style={{ color: "#0A66C2" }}
                              >
                                <Linkedin className="h-4 w-4 mr-2" style={{ color: "#0A66C2" }} /> Generate LinkedIn Post
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open("https://employers.indeed.com/post-job", "_blank")}>
                              <ExternalLink className="h-4 w-4 mr-2" /> Post to Indeed
                            </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteJob(job.id)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete job
                              </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
          </>
        </TabsContent>

        {/* ==================== CANDIDATES TAB ==================== */}
        <TabsContent value="candidates">
          <div className="mb-4 flex justify-end gap-2">
            {isBreakGlassAccount && (
              <>
              <Button
                variant="outline"
                disabled={migrateCandidatesLoading || migratePhase2Loading || migrateNewJobApplicantsLoading}
                onClick={async () => {
                  setMigrateCandidatesLoading(true);
                  toast.info("Migration started. Large jobs (500+ applicants) can take 30–60+ minutes. Check the server console for per-job counts.", { duration: 10000 });
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 60 * 60 * 1000); // 60 min
                  try {
                    const res = await fetch("/api/recruitment/migrate-freshteam-candidates", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                      signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                      const text = await res.text();
                      let errMsg = `${res.status}: ${text || res.statusText}`;
                      if (res.status === 409) errMsg = "A migration is already running. Wait for it to finish or check the server console.";
                      throw new Error(errMsg);
                    }
                    const data = await res.json();
                    if (data.error) {
                      toast.error(data.message || data.error);
                      return;
                    }
                    const jobLines = Array.isArray(data.jobSummaries)
                      ? data.jobSummaries.map((j: { ftJobId?: string; uniqueApplicantsFromFt?: number }) => `FT job ${j.ftJobId}: ${j.uniqueApplicantsFromFt ?? 0} applicants`).join("; ")
                      : "";
                    const orphan = data.orphanBackfill as
                      | { applicationsCreated?: number; noApplicantIds?: number }
                      | undefined;
                    const orphanLine = orphan
                      ? ` Orphan backfill: ${orphan.applicationsCreated ?? 0} linked${orphan.noApplicantIds ? `, ${orphan.noApplicantIds} without FT applicant_ids` : ""}.`
                      : "";
                    toast.success(
                      `Candidates: ${data.candidatesCreated ?? 0} created, ${data.candidatesUpdated ?? 0} updated. Applications: ${data.applicationsCreated ?? 0} created.${orphanLine}${jobLines ? ` ${jobLines}` : ""}`
                    );
                    if (data.errors?.length) toast.warning(`${data.errors.length} error(s) during migration.`);
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/candidates"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                  } catch (e: any) {
                    clearTimeout(timeoutId);
                    if (e?.name === "AbortError") toast.error("Migration timed out after 60 minutes. Check server logs; migration may still be running.");
                    else toast.error(e?.message || "Migration failed");
                  } finally {
                    setMigrateCandidatesLoading(false);
                  }
                }}
              >
                {migrateCandidatesLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4 mr-2" />
                )}
                Migrate candidates from FreshTeam
              </Button>
              <Button
                variant="outline"
                disabled={migrateCandidatesLoading || migratePhase2Loading || migrateNewJobApplicantsLoading}
                onClick={async () => {
                  setMigratePhase2Loading(true);
                  const resumeN = phase2ResumeAfter.trim() && /^\d+$/.test(phase2ResumeAfter.trim()) ? parseInt(phase2ResumeAfter.trim(), 10) : 0;
                  toast.info(resumeN ? `Resuming Phase 2 from applicant ${resumeN + 1}. Check the server console.` : "Linking applicants to jobs (Phase 2 only). Check the server console for progress.", { duration: 6000 });
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 60 * 60 * 1000);
                  try {
                    const res = await fetch("/api/recruitment/migrate-freshteam-candidates", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        phase2Only: true,
                        ...(phase2ResumeAfter.trim() && /^\d+$/.test(phase2ResumeAfter.trim())
                          ? { phase2ResumeAfterProcessed: parseInt(phase2ResumeAfter.trim(), 10) }
                          : {}),
                      }),
                      signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                      const text = await res.text();
                      let errMsg = `${res.status}: ${text || res.statusText}`;
                      if (res.status === 409) errMsg = "A migration is already running. Wait for it to finish or check the server console.";
                      throw new Error(errMsg);
                    }
                    const data = await res.json();
                    if (data.error) {
                      toast.error(data.message || data.error);
                      return;
                    }
                    toast.success(`Applications: ${data.applicationsCreated ?? 0} created.`);
                    if (data.errors?.length) toast.warning(`${data.errors.length} error(s).`);
                    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
                  } catch (e: any) {
                    clearTimeout(timeoutId);
                    if (e?.name === "AbortError") toast.error("Phase 2 timed out. Check server logs.");
                    else toast.error(e?.message || "Phase 2 failed");
                  } finally {
                    setMigratePhase2Loading(false);
                  }
                }}
              >
                {migratePhase2Loading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Link applicants (Phase 2 only)
              </Button>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <label htmlFor="phase2-resume-after">Resume after:</label>
                <input
                  id="phase2-resume-after"
                  type="number"
                  min={0}
                  placeholder="e.g. 5575"
                  className="w-24 rounded border border-input bg-background px-2 py-1 text-sm"
                  value={phase2ResumeAfter}
                  onChange={(e) => setPhase2ResumeAfter(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
                <span>applicants (optional)</span>
              </span>
              </>
            )}
            <Button onClick={() => { setAddCandidateForJobId(null); setAddCandidateDialog(true); }}>
              <UserPlus className="h-4 w-4 mr-2" /> Add candidate
            </Button>
          </div>
          {/* ── Talent pool filter bar ── */}
          <div className="flex flex-wrap items-center gap-3 p-3 mb-4 rounded-lg border bg-muted/30">
            <span className="text-sm font-medium text-muted-foreground shrink-0">Filters:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-[130px] justify-between font-normal">
                  {candidateFilters.stage.length === 0 ? "Stage" : `Stage (${candidateFilters.stage.length})`}
                  <span className="opacity-50">▼</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 max-h-64 overflow-auto p-2" align="start">
                {candidateFilterOptionsLoading ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
                ) : talentPoolStageOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No stages</p>
                ) : (
                  talentPoolStageOptions.map((s) => (
                    <label key={s} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={candidateFilters.stage.includes(s)}
                        onCheckedChange={(checked) =>
                          setCandidateFilters((f) => ({ ...f, stage: checked ? [...f.stage, s] : f.stage.filter((x) => x !== s) }))
                        }
                      />
                      <span>{STAGES.find((x) => x.id === s)?.label ?? s}</span>
                    </label>
                  ))
                )}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-[130px] justify-between font-normal">
                  {candidateFilters.source.length === 0 ? "Source" : `Source (${candidateFilters.source.length})`}
                  <span className="opacity-50">▼</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 max-h-64 overflow-auto p-2" align="start">
                {candidateFilterOptionsLoading ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
                ) : talentPoolSourceOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No sources recorded yet</p>
                ) : (
                  talentPoolSourceOptions.map((src) => (
                    <label key={src} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={candidateFilters.source.includes(src)}
                        onCheckedChange={(checked) =>
                          setCandidateFilters((f) => ({ ...f, source: checked ? [...f.source, src] : f.source.filter((x) => x !== src) }))
                        }
                      />
                      <span>{src}</span>
                    </label>
                  ))
                )}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-[140px] justify-between font-normal">
                  {candidateFilters.department.length === 0 ? "Department" : `Department (${candidateFilters.department.length})`}
                  <span className="opacity-50">▼</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 max-h-64 overflow-auto p-2" align="start">
                {candidateFilterOptionsLoading && talentPoolDepartmentOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
                ) : talentPoolDepartmentOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No departments</p>
                ) : (
                  talentPoolDepartmentOptions.map((d) => (
                    <label key={d} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={candidateFilters.department.includes(d)}
                        onCheckedChange={(checked) =>
                          setCandidateFilters((f) => ({ ...f, department: checked ? [...f.department, d] : f.department.filter((x) => x !== d) }))
                        }
                      />
                      <span>{d}</span>
                    </label>
                  ))
                )}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-[130px] justify-between font-normal">
                  {candidateFilters.jobId.length === 0 ? "Job" : `Job (${candidateFilters.jobId.length})`}
                  <span className="opacity-50">▼</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 max-h-72 overflow-auto p-2" align="start">
                {candidateFilterOptionsLoading && talentPoolJobOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
                ) : talentPoolJobOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No jobs</p>
                ) : (
                  talentPoolJobOptions.map((j) => (
                    <label key={j.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={candidateFilters.jobId.includes(j.id)}
                        onCheckedChange={(checked) =>
                          setCandidateFilters((f) => ({ ...f, jobId: checked ? [...f.jobId, j.id] : f.jobId.filter((x) => x !== j.id) }))
                        }
                      />
                      <span className="truncate">{j.title}</span>
                    </label>
                  ))
                )}
              </PopoverContent>
            </Popover>
            {(candidateFilters.stage.length > 0 || candidateFilters.source.length > 0 || candidateFilters.department.length > 0 || candidateFilters.jobId.length > 0) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => setCandidateFilters({ stage: [], source: [], department: [], jobId: [] })}>
                Clear filters
              </Button>
            )}
          </div>

          {/* ── Candidates table (premium ATS-style) ── */}
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm ring-1 ring-border/40">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/25 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold tracking-wide text-primary-foreground shadow-sm">
                  All <span className="tabular-nums">{candidatesTotal}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">Sort</span>
                <Select value="updated" onValueChange={() => {}}>
                  <SelectTrigger className="h-8 w-[148px] border-border/60 bg-background text-sm shadow-none focus:ring-1 focus:ring-primary/20">
                    <SelectValue placeholder="Last Updated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated">Last Updated</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="applied">Applied Date</SelectItem>
                    <SelectItem value="apps">Applications</SelectItem>
                  </SelectContent>
                </Select>
                <span className="hidden sm:inline text-xs tabular-nums text-muted-foreground/90">
                  {candidatesTotal === 0 ? "0" : `${(candidatesPage - 1) * candidatesPerPage + 1}–${Math.min(candidatesPage * candidatesPerPage, candidatesTotal)}`} of {candidatesTotal}
                </span>
                <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-background p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-sm transition-colors duration-150 hover:bg-muted"
                    disabled={candidatesPage <= 1}
                    onClick={() => setCandidatesPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-sm transition-colors duration-150 hover:bg-muted"
                    disabled={candidatesPage >= candidatesTotalPages}
                    onClick={() => setCandidatesPage((p) => Math.min(candidatesTotalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-b border-primary/15 bg-primary hover:bg-primary [&>th]:h-auto">
                  <TableHead className="w-11 pl-5 align-middle text-primary-foreground/95">
                    <Checkbox
                      className="h-3.5 w-3.5 border-primary-foreground/40 shadow-none transition-colors duration-150 focus-visible:ring-primary-foreground/40 data-[state=checked]:border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                      disabled
                      aria-label="Select all (coming soon)"
                    />
                  </TableHead>
                  <TableHead className="min-w-[220px] py-3.5 pl-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                    Name
                  </TableHead>
                  <TableHead className="w-[112px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                    Resume / Links
                  </TableHead>
                  <TableHead className="max-w-[200px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                    Departments applied for
                  </TableHead>
                  <TableHead className="w-[124px] whitespace-nowrap py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                    Applied Date
                  </TableHead>
                  <TableHead className="w-[168px] py-3.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground/95">
                    <div className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 opacity-90" aria-hidden />
                      Job Fitment Rating
                    </div>
                  </TableHead>
                  <TableHead className="w-11 pr-4 text-right text-primary-foreground/80" />
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:transition-colors [&_tr]:duration-150 [&_tr]:ease-out">
                {candidatesList.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-9 w-9 text-muted-foreground/35" />
                        <p className="text-sm font-medium text-foreground/80">No candidates yet</p>
                        <p className="max-w-sm text-xs text-muted-foreground">
                          Use &quot;Add candidate&quot; above or they appear here when applicants apply via the career site.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  candidatesList.map((c, rowIdx) => {
                    const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
                    const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "?";
                    const resumeHref = c.resume_url || `/api/recruitment/candidates/${c.id}/resume`;
                    const hasResume = !!(c.resume_url || c.has_resume);
                    const location = [c.city, c.country].filter(Boolean).join(", ");
                    const profileHref = `/recruitment/candidates/${c.id}`;
                    const rawAvg = c.fitment_rating_avg;
                    const avg = rawAvg != null && rawAvg !== "" ? Number(rawAvg) : NaN;
                    const hasRating = Number.isFinite(avg) && avg >= 1 && avg <= 5;
                    const roundedStars = hasRating ? Math.min(5, Math.max(1, Math.round(avg))) : 0;

                    const rowNav = (e: MouseEvent) => {
                      const el = e.target as HTMLElement;
                      if (el.closest("a,button,[role='checkbox'],input,label,[data-prevent-row-nav]")) return;
                      setLocation(profileHref);
                    };

                    return (
                      <TableRow
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={rowNav}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setLocation(profileHref);
                          }
                        }}
                        className={[
                          "group cursor-pointer border-b border-border/50 transition-colors duration-150 ease-out last:border-0",
                          rowIdx % 2 === 0 ? "bg-background" : "bg-muted/[0.28]",
                          "hover:bg-muted/55 active:bg-muted/70",
                        ].join(" ")}
                      >
                        <TableCell className="w-11 pl-5 align-middle" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            className="h-3.5 w-3.5 border-muted-foreground/35 shadow-none transition-all duration-150 hover:border-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-primary/25 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                            aria-label={`Select ${fullName}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-0 py-4 pl-2 align-middle">
                          <div className="flex items-center gap-3.5">
                            <Avatar className="h-10 w-10 shrink-0 shadow-sm">
                              <AvatarFallback
                                className={[
                                  "text-[0.8125rem] font-semibold leading-none tracking-tight",
                                  candidateAvatarToneClass(c.id),
                                ].join(" ")}
                              >
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={profileHref}
                                data-prevent-row-nav
                                onClick={(e) => e.stopPropagation()}
                                className="block truncate text-[15px] font-semibold leading-snug tracking-tight text-foreground hover:text-primary hover:underline"
                              >
                                {fullName}
                              </Link>
                              {c.current_company ? (
                                <p className="mt-0.5 truncate text-[13px] leading-snug text-muted-foreground/90">{c.current_company}</p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {hasResume ? (
                                  <a
                                    href={resumeHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-prevent-row-nav
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      window.open(resumeHref, "_blank", "noopener,noreferrer");
                                    }}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground shadow-sm transition-all duration-150 hover:border-primary/30 hover:bg-muted hover:text-foreground active:scale-[0.97]"
                                  >
                                    <FileText className="h-4 w-4" strokeWidth={2} />
                                  </a>
                                ) : (
                                  <span className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/20 text-muted-foreground/35">
                                    <FileText className="h-4 w-4" />
                            </span>
                                )}
                              </TooltipTrigger>
                              <TooltipContent side="top">{hasResume ? "View resume" : "No resume on file"}</TooltipContent>
                            </Tooltip>
                            {location ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex h-8 w-8 cursor-default items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground shadow-sm transition-all duration-150 hover:border-primary/25 hover:bg-muted/80 hover:text-foreground"
                                    data-prevent-row-nav
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Globe className="h-4 w-4" strokeWidth={2} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <span className="max-w-[220px]">Location: {location}</span>
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] py-4 align-middle">
                          {c.applied_departments?.trim() ? (
                            <p
                              className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground"
                              title={c.applied_departments}
                            >
                              {c.applied_departments}
                            </p>
                          ) : (
                            <span className="text-sm text-muted-foreground/70">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-4 align-middle">
                          <span className="text-[13px] tabular-nums text-muted-foreground/90">
                            {formatRecruitmentDate(c.created_at, user?.timeZone ?? null, user?.dateFormat ?? null)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 align-middle">
                          {hasRating ? (
                            <div
                              className="flex flex-col gap-1"
                              title={`Average fitment across rated applications (${avg.toFixed(avg % 1 === 0 ? 0 : 1)} / 5)`}
                            >
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star
                                    key={n}
                                    className={[
                                      "h-4 w-4 shrink-0 transition-colors duration-150",
                                      n <= roundedStars
                                        ? "fill-amber-400 text-amber-500 dark:fill-amber-500/90 dark:text-amber-400"
                                        : "text-muted-foreground/25 dark:text-muted-foreground/20",
                                    ].join(" ")}
                                    aria-hidden
                                  />
                                ))}
                          </div>
                              <span className="text-[11px] tabular-nums text-muted-foreground/85">
                                {avg % 1 === 0 ? String(Math.round(avg)) : avg.toFixed(1)}
                                <span className="font-normal text-muted-foreground/60"> / 5</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground/45 tabular-nums">—</span>
                          )}
                        </TableCell>
                        <TableCell className="w-11 py-4 pr-4 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                data-prevent-row-nav
                                className="h-8 w-8 text-muted-foreground opacity-40 transition-all duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                                aria-label={`Actions for ${fullName}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[160px]">
                              <DropdownMenuItem asChild>
                                <Link href={profileHref} data-prevent-row-nav>
                                  <Eye className="mr-2 h-4 w-4" /> View profile
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditingCandidateId(c.id)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteCandidate(c.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {candidatesTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Showing {(candidatesPage - 1) * candidatesPerPage + 1}–{Math.min(candidatesPage * candidatesPerPage, candidatesTotal)} of {candidatesTotal} candidates
                </p>
                <Select
                  value={String(candidatesPerPage)}
                  onValueChange={(v) => { setCandidatesPerPage(Number(v)); setCandidatesPage(1); }}
                >
                  <SelectTrigger className="w-[110px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                    <SelectItem value="200">200 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8" disabled={candidatesPage <= 1} onClick={() => setCandidatesPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <span className="px-3 text-sm text-muted-foreground">Page {candidatesPage} of {candidatesTotalPages}</span>
                <Button variant="outline" size="sm" className="h-8" disabled={candidatesPage >= candidatesTotalPages} onClick={() => setCandidatesPage((p) => Math.min(candidatesTotalPages, p + 1))}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* Dialogs */}
      <AIGeneratorDialog
        open={aiGeneratorOpen}
        onClose={() => setAIGeneratorOpen(false)}
        onUseDescription={(content) => {
          setPreFillForJob(content);
          setAIGeneratorOpen(false);
          setLocation("/recruitment/jobs/new");
        }}
      />
      <JobDetailDialog
        open={jobDetailDialog.open}
        onClose={() => setJobDetailDialog({ open: false, job: null })}
        job={jobDetailDialog.job}
        jobInfoOnly={!!jobDetailDialog.jobInfoOnly}
        onViewApplicants={
          jobDetailDialog.job
            ? () => {
                const j = jobDetailDialog.job!;
                setJobDetailDialog({ open: false, job: null });
                setSelectedJobId(j.id);
                setViewingJob(j);
              }
            : undefined
        }
      />
      <StageChangeDialog
        open={stageDialog.open}
        onClose={() => setStageDialog({ open: false, app: null })}
        application={stageDialog.app}
        onSuccess={(updatedApp) => {
          updateApplicationsCache(updatedApp);
          setSelectedAppInJobView((prev) => (prev?.id === updatedApp.id ? { ...prev, ...updatedApp } : prev));
        }}
      />
      <MakeOfferDialog
        open={offerDialog.open}
        onClose={() => setOfferDialog({ open: false, app: null })}
        application={offerDialog.app}
        onOfferCreated={(_app, created, meta) => {
          const app = offerDialog.app!;
          const updated: AppRow = { ...app, offer_id: created.id, offer_status: created.status, offer_approval_status: created.approval_status ?? "approved" };
          updateApplicationsCache(updated);
          setSelectedAppInJobView((prev) => (prev?.id === app.id ? { ...prev, ...updated } : prev));
          if (meta?.openEmailComposer && created.status === "draft") {
            setPendingOpenOfferEmailAfterCreate({ offerId: created.id, applicationId: app.id });
          }
        }}
      />
      <HireDialog
        open={hireDialog.open}
        onClose={() => setHireDialog({ open: false, app: null })}
        application={hireDialog.app}
      />
      <Dialog open={addAppDialog} onOpenChange={(o) => {
        setAddAppDialog(o);
        if (!o) {
          const preserveJobId = pendingLinkJobIdRef.current;
          setAddAppForm({
            candidateId: "",
            jobId: preserveJobId ?? "",
            coverLetter: "",
          });
          setAddAppCandidateSearch("");
          setAddAppSelectedCandidateLabel("");
          setAddAppCandidateSearchDebounced("");
        }
      }}>
        <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden max-w-md w-full min-w-0 max-h-[90vh] sm:max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>
              {(() => {
                const j = jobs.find((x) => x.id === addAppForm.jobId && (x.status === "published" || x.status === "paused"));
                return j ? "Add candidate to this job" : "Add application";
              })()}
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const j = jobs.find((x) => x.id === addAppForm.jobId && (x.status === "published" || x.status === "paused"));
                return j
                  ? `Link a candidate to “${j.title}”. They appear in the Applied stage.`
                  : "Link a candidate to a job. They will appear in Applied.";
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4 min-w-0">
            {/* Candidate: search or selected */}
            <div className="space-y-2 min-w-0">
                <Label>Candidate</Label>
              {addAppForm.candidateId ? (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 min-w-0">
                  <span className="text-sm flex-1 min-w-0 truncate">{addAppSelectedCandidateLabel || "Selected"}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => { setAddAppForm((f) => ({ ...f, candidateId: "" })); setAddAppSelectedCandidateLabel(""); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search by name or email…"
                    value={addAppCandidateSearch}
                    onChange={(e) => setAddAppCandidateSearch(e.target.value)}
                    className="h-9 w-full min-w-0"
                    autoComplete="off"
                  />
                  {addAppCandidateSearchDebounced.length < 2 && (
                    <p className="text-xs text-muted-foreground">Enter at least 2 characters to search.</p>
                  )}
                  {addAppCandidateSearchDebounced.length >= 2 && addAppCandidateSearchLoading && (
                    <p className="text-xs text-muted-foreground">Searching…</p>
                  )}
                  {addAppCandidateSearchDebounced.length >= 2 && !addAppCandidateSearchLoading && (
                    <div className="rounded-lg border bg-muted/20 max-h-[200px] overflow-y-auto min-w-0">
                      {addAppSearchCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center px-3">No matches. Try a different search.</p>
                      ) : (
                        <div className="py-1">
                          {addAppSearchCandidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 focus:bg-muted/60 focus:outline-none rounded-none first:rounded-t-md last:rounded-b-md"
                              onClick={() => {
                                setAddAppForm((f) => ({ ...f, candidateId: c.id }));
                                setAddAppSelectedCandidateLabel(`${c.first_name} ${c.last_name} (${c.email})`);
                              }}
                            >
                              <span className="font-medium">{c.first_name} {c.last_name}</span>
                              <span className="text-muted-foreground"> · {c.email}</span>
                            </button>
                          ))}
              </div>
            )}
                      {addAppSearchCandidates.length > 0 && (
                        <p className="text-[11px] text-muted-foreground px-3 py-1.5 border-t bg-muted/30 rounded-b-lg">
                          {addAppSearchTotal > 50 ? `Showing 50 of ${addAppSearchTotal} — click to select` : `${addAppSearchTotal} match(es)`}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Job: compact when pre-selected, else dropdown */}
            {(() => {
              const applicableJobs = jobs.filter((j) => j.status === "published" || j.status === "paused");
              if (applicableJobs.length === 0) {
                return <p className="text-sm text-muted-foreground">No published or paused jobs. Publish a job in the Jobs tab first.</p>;
              }
              const preSelectedJob = applicableJobs.find((j) => j.id === addAppForm.jobId);
              if (preSelectedJob) {
              return (
                  <div className="space-y-2 min-w-0">
                    <Label>Job</Label>
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 min-w-0">
                      <span className="text-sm flex-1 min-w-0 truncate">{preSelectedJob.title} {preSelectedJob.department ? `(${preSelectedJob.department})` : ""}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setAddAppForm((f) => ({ ...f, jobId: "" }))}>
                        Change
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div className="space-y-2 min-w-0">
                  <Label>Job</Label>
                  <Select value={addAppForm.jobId} onValueChange={(v) => setAddAppForm((f) => ({ ...f, jobId: v }))}>
                    <SelectTrigger className="h-9 w-full min-w-0"><SelectValue placeholder="Select job" /></SelectTrigger>
                    <SelectContent>
                      {applicableJobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>{j.title} ({j.department})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            <div className="space-y-2 min-w-0">
              <Label className="text-muted-foreground font-normal">Cover letter (optional)</Label>
              <Textarea value={addAppForm.coverLetter} onChange={(e) => setAddAppForm((f) => ({ ...f, coverLetter: e.target.value }))} placeholder="Paste or type…" rows={2} className="resize-none min-h-[60px] w-full min-w-0" />
            </div>
            {addAppForm.candidateId && linkAppFormConfig && (
              <div className="space-y-3 min-w-0 border-t pt-4">
                <p className="text-sm font-medium">Job application details</p>
                <ApplicationFormFill
                  formConfig={linkAppFormConfig}
                  mode="customOnly"
                  form={{ coverLetter: addAppForm.coverLetter }}
                  customAnswers={linkAppCustomAnswers}
                  repeatableEntries={linkAppRepeatableEntries}
                  resumeData={null}
                  onFormChange={() => {}}
                  onCustomChange={(id, val) => setLinkAppCustomAnswers((a) => ({ ...a, [id]: val }))}
                  onRepeatableChange={(sectionId, entries) =>
                    setLinkAppRepeatableEntries((prev) => ({ ...prev, [sectionId]: entries }))
                  }
                  onResumeChange={() => {}}
                  onResumeClear={() => {}}
                  requireResume={false}
                />
              </div>
            )}
            {addAppForm.jobId && (
              <div className="pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">New to the database?</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setAddCandidateForJobId(addAppForm.jobId);
                    pendingLinkJobIdRef.current = addAppForm.jobId;
                    resetApplicationFormFields();
                    setAddAppDialog(false);
                    setAddCandidateDialog(true);
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" /> Create new candidate for this job
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t flex-shrink-0 gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setAddAppDialog(false)}>Cancel</Button>
            <Button
              disabled={!addAppForm.candidateId || !addAppForm.jobId || createApplicationMutation.isPending || jobs.filter((j) => j.status === "published" || j.status === "paused").length === 0}
              onClick={() => {
                if (!addAppForm.candidateId || !addAppForm.jobId) return;
                const validationError = validateApplicationFormFill(
                  linkAppFormConfig,
                  { coverLetter: addAppForm.coverLetter },
                  linkAppCustomAnswers,
                  linkAppRepeatableEntries,
                  null,
                  { mode: "customOnly", requireResume: false },
                );
                if (validationError) {
                  toast.error(validationError);
                  return;
                }
                const customAnswers = linkAppFormConfig
                  ? buildCustomAnswersPayload(linkAppCustomAnswers, linkAppRepeatableEntries)
                  : undefined;
                createApplicationMutation.mutate({
                  candidateId: addAppForm.candidateId,
                  jobId: addAppForm.jobId,
                  coverLetter: addAppForm.coverLetter || undefined,
                  customAnswers:
                    customAnswers && Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
                });
              }}
            >
              {createApplicationMutation.isPending ? "Adding…" : "Add to pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addCandidateDialog} onOpenChange={(o) => {
        setAddCandidateDialog(o);
        if (!o) {
          const jid = addCandidateForJobId ?? pendingLinkJobIdRef.current;
          resetApplicationFormFields();
          resetAddCandidateFormFields();
          setAddCandidateForJobId(null);
          pendingLinkJobIdRef.current = null;
          if (jid) {
            setAddAppForm((f) => ({ ...f, jobId: jid }));
            setAddAppDialog(true);
          }
        }
      }}>
        <DialogContent className={cn("flex flex-col p-0 gap-0 overflow-hidden", addCandidateForJobId ? "max-w-2xl" : "max-w-lg", "max-h-[90vh]")}>
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>
              {addCandidateForJobId
                ? `Add candidate to ${jobs.find((j) => j.id === addCandidateForJobId)?.title ?? "job"}`
                : "Add candidate"}
            </DialogTitle>
            <DialogDescription>
              {addCandidateForJobId
                ? "Same fields as the career application form. Saves the profile and adds them to this job in one step."
                : "Add someone to the talent pool. Personal details and address prefill the employee profile when hired."}
            </DialogDescription>
          </DialogHeader>

          {addCandidateForJobId ? (
            <>
              <div className="flex-1 min-h-0 px-6 overflow-y-auto max-h-[calc(90vh-180px)] pb-4">
                {addCandidateJobFormLoading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading application form…</p>
                ) : (
                  <ApplicationFormFill
                    formConfig={addCandidateJobFormConfig}
                    mode="full"
                    form={applicationForm}
                    customAnswers={applicationCustomAnswers}
                    repeatableEntries={applicationRepeatableEntries}
                    resumeData={applicationResumeData}
                    onFormChange={(key, val) => setApplicationForm((f) => ({ ...f, [key]: val }))}
                    onCustomChange={(id, val) => setApplicationCustomAnswers((a) => ({ ...a, [id]: val }))}
                    onRepeatableChange={(sectionId, entries) =>
                      setApplicationRepeatableEntries((prev) => ({ ...prev, [sectionId]: entries }))
                    }
                    onResumeChange={handleApplicationResumeUpload}
                    onResumeClear={() => setApplicationResumeData(null)}
                    requireResume={false}
                  />
                )}
              </div>
              <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
                <Button variant="outline" onClick={() => setAddCandidateDialog(false)}>Cancel</Button>
                <Button
                  disabled={addCandidateJobFormLoading || createCandidateAndApplicationMutation.isPending}
                  onClick={() => {
                    if (!addCandidateForJobId) return;
                    const validationError = validateApplicationFormFill(
                      addCandidateJobFormConfig,
                      applicationForm,
                      applicationCustomAnswers,
                      applicationRepeatableEntries,
                      applicationResumeData,
                      { mode: "full", requireResume: false },
                    );
                    if (validationError) {
                      toast.error(validationError);
                      return;
                    }
                    const candidate = buildCandidatePayloadFromForm(
                      applicationForm,
                      applicationResumeData,
                      "manual",
                    );
                    const customAnswers = addCandidateJobFormConfig
                      ? buildCustomAnswersPayload(applicationCustomAnswers, applicationRepeatableEntries)
                      : undefined;
                    createCandidateAndApplicationMutation.mutate({
                      candidate,
                      jobId: addCandidateForJobId,
                      coverLetter: getCoverLetterFromForm(applicationForm),
                      customAnswers:
                        customAnswers && Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
                    });
                  }}
                >
                  {createCandidateAndApplicationMutation.isPending ? "Adding…" : "Add to pipeline"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
          <Tabs defaultValue="basic" className="flex-1 min-h-0 flex flex-col px-6 overflow-hidden">
            <TabsList className="grid w-full grid-cols-3 mb-3 flex-shrink-0">
              <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
              <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
              <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
            </TabsList>
            <div className="flex-1 min-h-0 -mx-6 px-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <TabsContent value="basic" className="mt-0 space-y-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>First name *</Label>
                    <Input value={addCandidateForm.firstName} onChange={(e) => setAddCandidateForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" className="mt-1" />
                  </div>
                  <div>
                    <Label>Last name *</Label>
                    <Input value={addCandidateForm.lastName} onChange={(e) => setAddCandidateForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Middle name</Label>
                  <Input value={addCandidateForm.middleName} onChange={(e) => setAddCandidateForm((f) => ({ ...f, middleName: e.target.value }))} placeholder="Optional" className="mt-1" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={addCandidateForm.email} onChange={(e) => setAddCandidateForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="mt-1" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={addCandidateForm.phone} onChange={(e) => setAddCandidateForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Optional" className="mt-1" />
                </div>
                <div>
                  <Label>LinkedIn URL</Label>
                  <Input type="url" value={addCandidateForm.linkedinUrl} onChange={(e) => setAddCandidateForm((f) => ({ ...f, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/in/…" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Current company</Label>
                    <Input value={addCandidateForm.currentCompany} onChange={(e) => setAddCandidateForm((f) => ({ ...f, currentCompany: e.target.value }))} placeholder="Optional" className="mt-1" />
                  </div>
                  <div>
                    <Label>Current title</Label>
                    <Input value={addCandidateForm.currentTitle} onChange={(e) => setAddCandidateForm((f) => ({ ...f, currentTitle: e.target.value }))} placeholder="Optional" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Experience (years)</Label>
                  <Input type="number" min={0} value={addCandidateForm.experienceYears} onChange={(e) => setAddCandidateForm((f) => ({ ...f, experienceYears: e.target.value }))} placeholder="e.g. 5" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Expected salary</Label>
                    <Input type="number" min={0} value={addCandidateForm.expectedSalary} onChange={(e) => setAddCandidateForm((f) => ({ ...f, expectedSalary: e.target.value }))} placeholder="Optional" className="mt-1" />
                  </div>
                  <div>
                    <Label>Salary currency</Label>
                    <Input value={addCandidateForm.salaryCurrency} onChange={(e) => setAddCandidateForm((f) => ({ ...f, salaryCurrency: e.target.value }))} placeholder="AED" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Resume</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1">Upload the resume file (e.g. from email) or paste a link. Optional.</p>
                  <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-primary/40 transition-colors">
                    {addCandidateForm.resumeFilename || (addCandidateForm.resumeUrl && addCandidateForm.resumeUrl.startsWith("http")) ? (
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">
                          {addCandidateForm.resumeFilename || "Link added"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setAddCandidateForm((f) => ({ ...f, resumeUrl: "", resumeFilename: "" }))}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
                        <p className="text-sm text-muted-foreground">Click to upload PDF (max 5MB)</p>
                        <input
                          ref={addCandidateResumeInputRef}
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error("File must be under 5MB");
                              e.target.value = "";
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              setAddCandidateForm((f) => ({ ...f, resumeUrl: reader.result as string, resumeFilename: file.name }));
                            };
                            reader.readAsDataURL(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground">Or paste link</Label>
                    <Input
                      value={addCandidateForm.resumeUrl?.startsWith("http") ? addCandidateForm.resumeUrl : ""}
                      onChange={(e) => setAddCandidateForm((f) => ({ ...f, resumeUrl: e.target.value.trim(), resumeFilename: "" }))}
                      placeholder="https://..."
                      className="mt-0.5 h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label>Source</Label>
                  <Select value={addCandidateForm.source} onValueChange={(v) => setAddCandidateForm((f) => ({ ...f, source: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="career_page">Career site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={addCandidateForm.notes} onChange={(e) => setAddCandidateForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal notes" rows={2} className="mt-1" />
                </div>
              </TabsContent>
              <TabsContent value="personal" className="mt-0 space-y-4 pb-4">
                <p className="text-xs text-muted-foreground mb-2">Prefills employee profile when hired.</p>
                <div>
                  <Label>Personal email</Label>
                  <Input type="email" value={addCandidateForm.personalEmail} onChange={(e) => setAddCandidateForm((f) => ({ ...f, personalEmail: e.target.value }))} placeholder="Different from main email" className="mt-1" />
                </div>
                <div>
                  <Label>Date of birth</Label>
                  <Input type="date" value={addCandidateForm.dateOfBirth} onChange={(e) => setAddCandidateForm((f) => ({ ...f, dateOfBirth: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={addCandidateForm.gender || "_"} onValueChange={(v) => setAddCandidateForm((f) => ({ ...f, gender: v === "_" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">—</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                      <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marital status</Label>
                  <Select value={addCandidateForm.maritalStatus || "_"} onValueChange={(v) => setAddCandidateForm((f) => ({ ...f, maritalStatus: v === "_" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">—</SelectItem>
                      <SelectItem value="Single">Single</SelectItem>
                      <SelectItem value="Married">Married</SelectItem>
                      <SelectItem value="Divorced">Divorced</SelectItem>
                      <SelectItem value="Widowed">Widowed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Blood group</Label>
                  <Select value={addCandidateForm.bloodGroup || "_"} onValueChange={(v) => setAddCandidateForm((f) => ({ ...f, bloodGroup: v === "_" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">—</SelectItem>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A-">A-</SelectItem>
                      <SelectItem value="B+">B+</SelectItem>
                      <SelectItem value="B-">B-</SelectItem>
                      <SelectItem value="AB+">AB+</SelectItem>
                      <SelectItem value="AB-">AB-</SelectItem>
                      <SelectItem value="O+">O+</SelectItem>
                      <SelectItem value="O-">O-</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              <TabsContent value="address" className="mt-0 space-y-4 pb-4">
                <p className="text-xs text-muted-foreground mb-2">Home address; prefills employee profile when hired.</p>
                <div>
                  <Label>Street</Label>
                  <Input value={addCandidateForm.street} onChange={(e) => setAddCandidateForm((f) => ({ ...f, street: e.target.value }))} placeholder="Street address" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>City</Label>
                    <Input value={addCandidateForm.city} onChange={(e) => setAddCandidateForm((f) => ({ ...f, city: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={addCandidateForm.state} onChange={(e) => setAddCandidateForm((f) => ({ ...f, state: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Zip code</Label>
                    <Input value={addCandidateForm.zipCode} onChange={(e) => setAddCandidateForm((f) => ({ ...f, zipCode: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input value={addCandidateForm.country} onChange={(e) => setAddCandidateForm((f) => ({ ...f, country: e.target.value }))} className="mt-1" />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={() => setAddCandidateDialog(false)}>Cancel</Button>
            <Button
              disabled={!addCandidateForm.firstName.trim() || !addCandidateForm.lastName.trim() || !addCandidateForm.email.trim() || createCandidateMutation.isPending}
              onClick={() => {
                const exp = addCandidateForm.experienceYears.trim() ? parseInt(addCandidateForm.experienceYears, 10) : undefined;
                if (Number.isNaN(exp) && addCandidateForm.experienceYears.trim()) return;
                const expectedSalary = addCandidateForm.expectedSalary.trim()
                  ? parseFloat(addCandidateForm.expectedSalary)
                  : undefined;
                if (Number.isNaN(expectedSalary) && addCandidateForm.expectedSalary.trim()) return;
                createCandidateMutation.mutate({
                  firstName: addCandidateForm.firstName.trim(),
                  middleName: addCandidateForm.middleName.trim() || undefined,
                  lastName: addCandidateForm.lastName.trim(),
                  email: addCandidateForm.email.trim(),
                  phone: addCandidateForm.phone.trim() || undefined,
                  linkedinUrl: addCandidateForm.linkedinUrl.trim() || undefined,
                  personalEmail: addCandidateForm.personalEmail.trim() || undefined,
                  dateOfBirth: addCandidateForm.dateOfBirth || undefined,
                  gender: addCandidateForm.gender || undefined,
                  maritalStatus: addCandidateForm.maritalStatus || undefined,
                  bloodGroup: addCandidateForm.bloodGroup || undefined,
                  street: addCandidateForm.street.trim() || undefined,
                  city: addCandidateForm.city.trim() || undefined,
                  state: addCandidateForm.state.trim() || undefined,
                  zipCode: addCandidateForm.zipCode.trim() || undefined,
                  country: addCandidateForm.country.trim() || undefined,
                  currentCompany: addCandidateForm.currentCompany.trim() || undefined,
                  currentTitle: addCandidateForm.currentTitle.trim() || undefined,
                  experienceYears: exp,
                  expectedSalary,
                  salaryCurrency: addCandidateForm.salaryCurrency.trim() || undefined,
                  resumeUrl: (addCandidateForm.resumeUrl?.startsWith("data:") ? addCandidateForm.resumeUrl : addCandidateForm.resumeUrl?.trim()) || undefined,
                  resumeFilename: addCandidateForm.resumeFilename.trim() || undefined,
                  source: addCandidateForm.source || "manual",
                  notes: addCandidateForm.notes.trim() || undefined,
                });
              }}
            >
              {createCandidateMutation.isPending ? "Adding…" : "Add to talent pool"}
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit candidate dialog */}
      <Dialog open={!!editingCandidateId} onOpenChange={(open) => { if (!open) setEditingCandidateId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Edit candidate</DialogTitle>
            <DialogDescription>Update profile fields shown on the candidate overview and used when hiring.</DialogDescription>
          </DialogHeader>
          {editingCandidateId && (
            <form
              className="flex flex-col flex-1 min-h-0"
              onSubmit={(e) => {
                e.preventDefault();
                const exp = editCandidateForm.experienceYears.trim();
                const expectedSalary = editCandidateForm.expectedSalary.trim()
                  ? parseFloat(editCandidateForm.expectedSalary)
                  : undefined;
                updateCandidateMutation.mutate({
                  id: editingCandidateId,
                  body: {
                    firstName: editCandidateForm.firstName.trim(),
                    middleName: editCandidateForm.middleName.trim() || undefined,
                    lastName: editCandidateForm.lastName.trim(),
                    email: editCandidateForm.email.trim(),
                    phone: editCandidateForm.phone.trim() || undefined,
                    linkedinUrl: editCandidateForm.linkedinUrl.trim() || undefined,
                    personalEmail: editCandidateForm.personalEmail.trim() || undefined,
                    dateOfBirth: editCandidateForm.dateOfBirth || undefined,
                    gender: editCandidateForm.gender || undefined,
                    maritalStatus: editCandidateForm.maritalStatus || undefined,
                    bloodGroup: editCandidateForm.bloodGroup || undefined,
                    street: editCandidateForm.street.trim() || undefined,
                    city: editCandidateForm.city.trim() || undefined,
                    state: editCandidateForm.state.trim() || undefined,
                    zipCode: editCandidateForm.zipCode.trim() || undefined,
                    country: editCandidateForm.country.trim() || undefined,
                    currentCompany: editCandidateForm.currentCompany.trim() || undefined,
                    currentTitle: editCandidateForm.currentTitle.trim() || undefined,
                    experienceYears: exp === "" ? undefined : parseInt(exp, 10),
                    expectedSalary: expectedSalary,
                    salaryCurrency: editCandidateForm.salaryCurrency.trim() || undefined,
                    source: editCandidateForm.source || "manual",
                    notes: editCandidateForm.notes.trim() || undefined,
                  },
                });
              }}
            >
              <Tabs defaultValue="basic" className="flex-1 min-h-0 flex flex-col px-6">
                <TabsList className="grid w-full grid-cols-3 mb-3">
                  <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
                  <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
                  <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
                </TabsList>
                <div className="overflow-y-auto max-h-[calc(90vh-220px)] pb-4 space-y-4">
                  <TabsContent value="basic" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>First name</Label>
                        <Input value={editCandidateForm.firstName} onChange={(e) => setEditCandidateForm((f) => ({ ...f, firstName: e.target.value }))} className="mt-1" required />
                      </div>
                      <div>
                        <Label>Last name</Label>
                        <Input value={editCandidateForm.lastName} onChange={(e) => setEditCandidateForm((f) => ({ ...f, lastName: e.target.value }))} className="mt-1" required />
                      </div>
                    </div>
                    <div>
                      <Label>Middle name</Label>
                      <Input value={editCandidateForm.middleName} onChange={(e) => setEditCandidateForm((f) => ({ ...f, middleName: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={editCandidateForm.email} onChange={(e) => setEditCandidateForm((f) => ({ ...f, email: e.target.value }))} className="mt-1" required />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={editCandidateForm.phone} onChange={(e) => setEditCandidateForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label>LinkedIn URL</Label>
                      <Input type="url" value={editCandidateForm.linkedinUrl} onChange={(e) => setEditCandidateForm((f) => ({ ...f, linkedinUrl: e.target.value }))} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Current company</Label>
                        <Input value={editCandidateForm.currentCompany} onChange={(e) => setEditCandidateForm((f) => ({ ...f, currentCompany: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Current title</Label>
                        <Input value={editCandidateForm.currentTitle} onChange={(e) => setEditCandidateForm((f) => ({ ...f, currentTitle: e.target.value }))} className="mt-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Experience (years)</Label>
                        <Input type="number" min={0} value={editCandidateForm.experienceYears} onChange={(e) => setEditCandidateForm((f) => ({ ...f, experienceYears: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Source</Label>
                        <Select value={editCandidateForm.source} onValueChange={(v) => setEditCandidateForm((f) => ({ ...f, source: v }))}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="referral">Referral</SelectItem>
                            <SelectItem value="linkedin">LinkedIn</SelectItem>
                            <SelectItem value="career_page">Career site</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Expected salary</Label>
                        <Input type="number" min={0} value={editCandidateForm.expectedSalary} onChange={(e) => setEditCandidateForm((f) => ({ ...f, expectedSalary: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Salary currency</Label>
                        <Input value={editCandidateForm.salaryCurrency} onChange={(e) => setEditCandidateForm((f) => ({ ...f, salaryCurrency: e.target.value }))} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea value={editCandidateForm.notes} onChange={(e) => setEditCandidateForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" />
                    </div>
                  </TabsContent>
                  <TabsContent value="personal" className="mt-0 space-y-4">
                    <div>
                      <Label>Personal email</Label>
                      <Input type="email" value={editCandidateForm.personalEmail} onChange={(e) => setEditCandidateForm((f) => ({ ...f, personalEmail: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label>Date of birth</Label>
                      <Input type="date" value={editCandidateForm.dateOfBirth} onChange={(e) => setEditCandidateForm((f) => ({ ...f, dateOfBirth: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label>Gender</Label>
                      <Select value={editCandidateForm.gender || "_"} onValueChange={(v) => setEditCandidateForm((f) => ({ ...f, gender: v === "_" ? "" : v }))}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">—</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                          <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Marital status</Label>
                      <Select value={editCandidateForm.maritalStatus || "_"} onValueChange={(v) => setEditCandidateForm((f) => ({ ...f, maritalStatus: v === "_" ? "" : v }))}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">—</SelectItem>
                          <SelectItem value="Single">Single</SelectItem>
                          <SelectItem value="Married">Married</SelectItem>
                          <SelectItem value="Divorced">Divorced</SelectItem>
                          <SelectItem value="Widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Blood group</Label>
                      <Select value={editCandidateForm.bloodGroup || "_"} onValueChange={(v) => setEditCandidateForm((f) => ({ ...f, bloodGroup: v === "_" ? "" : v }))}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">—</SelectItem>
                          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                            <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>
                  <TabsContent value="address" className="mt-0 space-y-4">
                    <div>
                      <Label>Street</Label>
                      <Input value={editCandidateForm.street} onChange={(e) => setEditCandidateForm((f) => ({ ...f, street: e.target.value }))} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>City</Label>
                        <Input value={editCandidateForm.city} onChange={(e) => setEditCandidateForm((f) => ({ ...f, city: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input value={editCandidateForm.state} onChange={(e) => setEditCandidateForm((f) => ({ ...f, state: e.target.value }))} className="mt-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Zip code</Label>
                        <Input value={editCandidateForm.zipCode} onChange={(e) => setEditCandidateForm((f) => ({ ...f, zipCode: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Country</Label>
                        <Input value={editCandidateForm.country} onChange={(e) => setEditCandidateForm((f) => ({ ...f, country: e.target.value }))} className="mt-1" />
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
              <DialogFooter className="px-6 py-4 border-t">
                <Button type="button" variant="outline" onClick={() => setEditingCandidateId(null)}>Cancel</Button>
                <Button type="submit" disabled={updateCandidateMutation.isPending}>
                  {updateCandidateMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* LinkedIn Post Generator */}
      <LinkedInPostModal
        open={!!linkedInPostJob}
        jobId={linkedInPostJob?.id ?? null}
        jobTitle={linkedInPostJob?.title}
        onClose={() => setLinkedInPostJob(null)}
      />
    </Layout>
  );
}
