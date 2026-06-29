import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Briefcase, Users, ArrowRight, UserPlus, CalendarClock, Send, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  isRecruitmentPipelineSearch,
  recruitmentPipelineSearchToJobsPath,
} from "@shared/notificationDeepLinks";
import { ScheduledInterviewsLandingCard } from "@/components/recruitment/ScheduledInterviewsCard";
import { MyInterviewerAssignmentsLandingCard } from "@/components/recruitment/MyInterviewerAssignmentsCard";

interface RecruitmentStats {
  jobs: {
    total_jobs: number;
    active_jobs: number;
    draft_jobs: number;
    closed_jobs: number;
  };
  applications: {
    total_applications: number;
    applied: number;
    in_review: number;
    interviewing: number;
    offers: number;
    hired: number;
    rejected: number;
    new_this_week: number;
  };
  candidates: {
    total_candidates: number;
  };
  offers: {
    total_offers: number;
    pending: number;
    accepted: number;
    declined: number;
  };
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm shadow-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold tabular-nums text-foreground">
        {value !== undefined ? value.toLocaleString() : "—"}
      </span>
    </div>
  );
}

export default function RecruitmentHome() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { effectiveRole } = useAuth();

  // Legacy deep links (notifications, emails) used /recruitment?job=&applicant= — pipeline lives on /recruitment/jobs.
  useEffect(() => {
    if (!isRecruitmentPipelineSearch(search || "")) return;
    setLocation(recruitmentPipelineSearchToJobsPath(search || ""));
  }, [search, setLocation]);

  const canPostJobs =
    effectiveRole === "admin" ||
    effectiveRole === "hr" ||
    effectiveRole === "recruiter";

  const { data: stats, isLoading } = useQuery<RecruitmentStats>({
    queryKey: ["/api/recruitment/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/recruitment/stats");
      return res.json();
    },
    staleTime: 30_000,
  });

  const activeJobs = stats?.jobs.active_jobs;
  const totalCandidates = stats?.candidates.total_candidates;
  const newThisWeek = stats?.applications.new_this_week;
  const interviewing = stats?.applications.interviewing;
  const offersPending = stats?.offers.pending;

  return (
    <Layout>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Recruitment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage open positions and your candidate pipeline
          </p>
        </div>
        {canPostJobs && (
          <Button
            onClick={() => setLocation("/recruitment/jobs/new")}
            size="sm"
            className="shrink-0 gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            New Job
          </Button>
        )}
      </div>

      {/* ── Main entry cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {/* Jobs card */}
        <button
          type="button"
          onClick={() => setLocation("/recruitment/jobs")}
          className="group text-left rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/8 border border-primary/15">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-150" />
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-0.5">Jobs</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isLoading
              ? "Loading…"
              : activeJobs !== undefined
              ? `${activeJobs.toLocaleString()} active position${activeJobs === 1 ? "" : "s"}`
              : "Open positions"}
          </p>
          <p className="text-[13px] text-muted-foreground/80 leading-relaxed">
            View and manage all job postings, track applicants through the hiring pipeline, and coordinate interviews and offers.
          </p>

          <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all duration-150">
            View Jobs <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Talent Pool card */}
        <button
          type="button"
          onClick={() => setLocation("/recruitment/talent-pool")}
          className="group text-left rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-900/20 dark:border-violet-800/40">
              <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-150" />
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-0.5">Talent Pool</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isLoading
              ? "Loading…"
              : totalCandidates !== undefined
              ? `${totalCandidates.toLocaleString()} candidate${totalCandidates === 1 ? "" : "s"}`
              : "All candidates"}
          </p>
          <p className="text-[13px] text-muted-foreground/80 leading-relaxed">
            Browse all candidates across every role, review profiles, resumes, and application history in one place.
          </p>

          <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all duration-150">
            View Talent Pool <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        <ScheduledInterviewsLandingCard limit={30} />

        <MyInterviewerAssignmentsLandingCard limit={30} />
      </div>

      {/* ── Quick stats chips ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <StatChip
          icon={<TrendingUp className="h-4 w-4" />}
          label="New applicants this week"
          value={newThisWeek}
        />
        <StatChip
          icon={<CalendarClock className="h-4 w-4" />}
          label="In interview stage"
          value={interviewing}
        />
        <StatChip
          icon={<Send className="h-4 w-4" />}
          label="Offers pending"
          value={offersPending}
        />
      </div>
    </Layout>
  );
}
