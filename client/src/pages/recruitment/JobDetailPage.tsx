import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import {
  ArrowLeft, Pencil, Users, MapPin, Briefcase, Globe, Banknote,
  UserCheck, ChevronRight, Copy, ExternalLink, CheckCircle,
  Clock, XCircle, Archive, PauseCircle, Linkedin,
} from "lucide-react";
import { sanitizeJobHtml, isHtmlContent } from "@/lib/utils";
import { ApplicationFormBuilderCore, DEFAULT_FORM_CONFIG, type FormConfig } from "@/components/ApplicationFormBuilderCore";
import { LinkedInPostModal } from "@/components/recruitment/LinkedInPostModal";
import { JobRecordAudit } from "@/components/recruitment/JobRecordAudit";
import { useAuth } from "@/hooks/useAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobDetail {
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
  experience_level: string | null;
  remote: boolean | null;
  status: string;
  headcount: number | null;
  published_at: string | null;
  created_at: string;
  updated_at?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  published_channels: string[] | null;
  hm_ids: string[] | null;
  hm_names: string[] | null;
  recruiter_names?: string[] | null;
  limited_recruiter_names?: string[] | null;
  recruiter_user_ids?: string[] | null;
  limited_recruiter_user_ids?: string[] | null;
  hiring_manager_user_ids?: string[] | null;
  application_count?: number;
}

function teamDisplayNames(
  names?: string[] | null,
  ids?: string[] | null,
): string[] {
  if (names?.length) return names;
  return ids ?? [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  published: { label: "Published",  icon: <CheckCircle className="h-3.5 w-3.5" />, variant: "default" },
  draft:     { label: "Draft",      icon: <Clock className="h-3.5 w-3.5" />,       variant: "secondary" },
  paused:    { label: "On Hold",    icon: <PauseCircle className="h-3.5 w-3.5" />, variant: "outline" },
  closed:    { label: "Closed",     icon: <XCircle className="h-3.5 w-3.5" />,     variant: "destructive" },
  archived:  { label: "Archived",   icon: <Archive className="h-3.5 w-3.5" />,     variant: "outline" },
};

function fmtType(t: string | null) {
  if (!t) return "—";
  return t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

// ── Tab components ─────────────────────────────────────────────────────────────

function JobInfoTab({
  job,
  displayTz,
  dateFormat,
}: {
  job: JobDetail;
  displayTz: string;
  dateFormat: string | null;
}) {
  const skills = job.requirements
    ? job.requirements.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      {/* Left: main content */}
      <div className="min-w-0 space-y-6">
        {/* Title card */}
        <div className="rounded-xl border border-border bg-card p-6 lg:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Job Title</p>
          <h2 className="text-2xl font-bold text-foreground">{job.title}</h2>
        </div>

        {/* Description card */}
        <div className="rounded-xl border border-border bg-card p-6 lg:p-8">
          <h3 className="text-lg font-semibold text-foreground mb-5">Job Description</h3>
          {job.description ? (
            isHtmlContent(job.description) ? (
              <div
                className="text-[15px] text-muted-foreground leading-relaxed prose prose-base max-w-none w-full prose-p:my-2 prose-ul:my-3 prose-li:my-1 prose-strong:font-semibold prose-headings:text-foreground"
                dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(job.description) }}
              />
            ) : (
              <p className="text-[15px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{job.description}</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground italic">No description provided.</p>
          )}
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground mb-4">Required Skills</h3>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: posting details sidebar */}
      <div className="w-full min-w-0 shrink-0">
        <div className="rounded-xl border border-border bg-card p-5 sticky top-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Job Posting Details</h3>
          <p className="text-xs text-muted-foreground mb-4">Summary of this position</p>

          <div className="divide-y divide-border">
            <DetailRow label="Department">
              {job.department || <span className="text-muted-foreground">—</span>}
            </DetailRow>
            <DetailRow label="Experience">
              {job.experience_level || <span className="text-muted-foreground">—</span>}
            </DetailRow>
            <DetailRow label="Location">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {job.location || <span className="text-muted-foreground">—</span>}
              </span>
            </DetailRow>
            <DetailRow label="Remote">
              <label className="flex items-center gap-2 cursor-default">
                <input type="checkbox" readOnly checked={!!job.remote} className="rounded border-border h-4 w-4 accent-primary" />
                <span className="text-sm font-medium">Mark as Remote Job</span>
              </label>
            </DetailRow>
            <DetailRow label="Job Type">
              {fmtType(job.employment_type)}
            </DetailRow>
            <DetailRow label="Salary details">
              <span className="flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {job.salary_range_min && job.salary_range_max
                  ? `${job.salary_currency || ""} ${Number(job.salary_range_min).toLocaleString()} – ${Number(job.salary_range_max).toLocaleString()}`
                  : job.salary_currency
                    ? `${job.salary_currency} —`
                    : "—"}
              </span>
            </DetailRow>
            <DetailRow label="Headcount">
              {job.headcount ?? "—"}
            </DetailRow>
            <DetailRow label="Allow employees to apply">
              <div className="flex items-center gap-2">
                <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${Array.isArray(job.published_channels) && job.published_channels.includes("internal") ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${Array.isArray(job.published_channels) && job.published_channels.includes("internal") ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {Array.isArray(job.published_channels) && job.published_channels.includes("internal") ? "Enabled" : "Disabled"}
                </span>
              </div>
            </DetailRow>
          </div>

          <div className="mt-5 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Record</p>
            <JobRecordAudit
              created_at={job.created_at}
              updated_at={job.updated_at}
              created_by_name={job.created_by_name}
              updated_by_name={job.updated_by_name}
              displayTz={displayTz}
              dateFormat={dateFormat}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HiringTeamTab({ job }: { job: JobDetail }) {
  const section = (label: string, names: string[] | null | undefined) => (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{label}</h3>
      {names && names.length > 0 ? (
        <div className="space-y-3">
          {names.map((name) => (
            <div key={name} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <UserCheck className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium">{name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">None assigned</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {section("Recruiter(s)", teamDisplayNames(job.recruiter_names, job.recruiter_user_ids))}
      {section("Hiring Manager(s)", teamDisplayNames(job.hm_names, job.hiring_manager_user_ids))}
      {section("Limited Recruiter(s)", teamDisplayNames(job.limited_recruiter_names, job.limited_recruiter_user_ids))}
    </div>
  );
}

function ApplicationFormTab({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FormConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery<FormConfig>({
    queryKey: [`/api/recruitment/jobs/${jobId}/application-form`],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/jobs/${jobId}/application-form`);
      if (!res.ok) throw new Error("Failed to load application form");
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: !!jobId,
  });

  useEffect(() => {
    setDraft(null);
    setDirty(false);
  }, [jobId]);

  if (isLoading && data === undefined) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Loading form config…</div>;
  }

  const serverConfig = data && data.sections?.length ? data : DEFAULT_FORM_CONFIG;
  const displayConfig = dirty && draft ? draft : serverConfig;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/recruitment/jobs/${jobId}/application-form`, { config: displayConfig });
      queryClient.invalidateQueries({ queryKey: [`/api/recruitment/jobs/${jobId}/application-form`] });
      setDirty(false);
      setDraft(null);
      toast.success("Application form saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApplicationFormBuilderCore
      config={displayConfig}
      onChange={(c) => { setDraft(c); setDirty(true); }}
      saving={saving}
      onSave={dirty ? handleSave : undefined}
      onReset={() => {
        if (!confirm("Reset this job's application form to default?")) return;
        setDraft(DEFAULT_FORM_CONFIG);
        setDirty(true);
        toast.info("Reset to default — save to apply");
      }}
      compact
    />
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "info",   label: "Job Information" },
  { id: "team",   label: "Hiring Team" },
  { id: "form",   label: "Application Form" },
] as const;
type TabId = typeof TABS[number]["id"];

export default function JobDetailPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const queryClient = useQueryClient();
  const displayTz = user?.timeZone?.trim() || "UTC";
  const dateFormat = user?.dateFormat ?? null;

  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [linkedInModalOpen, setLinkedInModalOpen] = useState(false);

  const { data: job, isLoading, isError } = useQuery<JobDetail>({
    queryKey: ["/api/recruitment/jobs", jobId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/jobs/${jobId}`);
      if (!res.ok) throw new Error("Failed to load job");
      return res.json();
    },
    enabled: !!jobId,
    staleTime: 30_000,
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!job || newStatus === job.status) return;
    setUpdatingStatus(true);
    try {
      await apiRequest("PATCH", `/api/recruitment/jobs/${jobId}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/jobs"] });
      toast.success(`Job ${newStatus === "published" ? "published" : `set to ${newStatus}`}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Failed to load job details.</p>
          <Button variant="outline" onClick={() => setLocation("/recruitment/jobs")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Recruitment
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex h-full flex-col">

        {/* ── HEADER ── */}
        <div className="sticky top-0 z-10 border-b border-border bg-background">

          {/* Row 1: breadcrumb */}
          <div className="flex items-center gap-2 px-6 pt-3 pb-1 text-sm text-muted-foreground">
            <button type="button" onClick={() => setLocation("/recruitment")} className="hover:text-foreground transition-colors">
              Recruitment
            </button>
            <ChevronRight className="h-3.5 w-3.5 opacity-40 shrink-0" />
            <button type="button" onClick={() => setLocation("/recruitment/jobs")} className="hover:text-foreground transition-colors">
              Jobs
            </button>
            <ChevronRight className="h-3.5 w-3.5 opacity-40 shrink-0" />
            <span className="text-foreground font-medium truncate max-w-xs">
              {isLoading ? "Loading…" : (job?.title ?? "Job")}
            </span>
          </div>

          {/* Row 2: title + actions */}
          <div className="flex items-center justify-between gap-3 px-6 py-2">
            {/* Left: back + title */}
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setLocation("/recruitment/jobs")} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {isLoading
                ? <Skeleton className="h-6 w-48" />
                : <h1 className="text-lg font-bold leading-tight truncate">{job?.title}</h1>
              }
            </div>

            {/* Right: actions */}
            {job && (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation(`/recruitment/jobs?job=${jobId}`)}>
                  <Users className="h-4 w-4" /> View Applicants
                </Button>

                {/* Status: default SelectTrigger + SelectValue only — never use asChild here (shadcn SelectTrigger renders Icon sibling, breaks Radix Children.only) */}
                <Select value={job.status} onValueChange={handleStatusChange} disabled={updatingStatus}>
                  <SelectTrigger className="h-9 w-[11rem] min-w-[8rem] gap-2 font-medium">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {Object.entries(STATUS_META).map(([val, meta]) => (
                      <SelectItem key={val} value={val}>
                        <span className="flex items-center gap-2">{meta.icon} {meta.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  className="gap-1.5 font-semibold"
                  style={{ backgroundColor: "#0A66C2", color: "#fff" }}
                  onClick={() => setLinkedInModalOpen(true)}
                >
                  <Linkedin className="h-4 w-4" /> LinkedIn Post
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setLocation(`/recruitment/jobs/${jobId}/edit`)}>
                  <Pencil className="h-4 w-4" /> Edit Job
                </Button>
              </div>
            )}
          </div>

          {/* Tab strip */}
          <div className="flex px-6 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── BODY ── */}
        <ScrollArea className="flex-1">
          <div className="mx-auto w-full min-w-0 max-w-7xl px-6 py-8">

            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            ) : !job ? null : (
              <>
                {activeTab === "info"  && <JobInfoTab job={job} displayTz={displayTz} dateFormat={dateFormat} />}
                {activeTab === "team"  && <HiringTeamTab job={job} />}
                {activeTab === "form"  && <ApplicationFormTab jobId={job.id} />}
              </>
            )}

          </div>

          {/* Quick action bar at the bottom */}
          {job && (
            <div className="border-t border-border bg-muted/20 px-6 py-3">
              <div className="mx-auto w-full max-w-7xl flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4" />
                  {job.department}
                </span>
                {job.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </span>
                )}
                {job.remote && (
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    Remote
                  </span>
                )}
                <button
                  type="button"
                  className="ml-auto flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    const url = `${window.location.origin}/careers?job=${encodeURIComponent(job.id)}`;
                    navigator.clipboard.writeText(url);
                    toast.success("Career page link copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy apply link
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => window.open(
                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${window.location.origin}/careers?job=${job.id}`)}`,
                    "_blank", "width=600,height=400"
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  Share on LinkedIn
                </button>
              </div>
            </div>
          )}
        </ScrollArea>

      </div>

      <LinkedInPostModal
        open={linkedInModalOpen}
        jobId={job?.id ?? null}
        jobTitle={job?.title}
        onClose={() => setLinkedInModalOpen(false)}
      />
    </Layout>
  );
}
