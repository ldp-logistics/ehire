import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, ChevronRight, ClipboardList, Clock, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeDisplay } from "@/lib/dateUtils";
import { interviewMeetingHasEnded } from "@shared/interviewScheduleTime";
import { recruitmentApplicantDeepLink } from "@shared/notificationDeepLinks";

export type InterviewerAssignmentRow = {
  history_id: string;
  application_id: string;
  scheduled_at: string;
  scheduled_at_end?: string | null;
  interview_type?: string | null;
  interview_round?: number | null;
  to_stage?: string | null;
  job_id: string;
  job_title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  my_feedback_status?: string | null;
};

function roundLabel(row: InterviewerAssignmentRow): string {
  if (row.interview_type?.trim()) return row.interview_type.trim();
  const stage = row.to_stage === "interview" ? "Interview" : "Screening";
  const round = row.interview_round ? ` — Round ${row.interview_round}` : "";
  return `${stage}${round}`;
}

function assignmentHref(row: InterviewerAssignmentRow, panel: "interviews" | "comments"): string {
  return `${recruitmentApplicantDeepLink(row.job_id, row.application_id)}&panel=${panel}`;
}

function assignmentAction(row: InterviewerAssignmentRow, now: Date): {
  label: string;
  variant: "default" | "secondary" | "outline";
  panel: "interviews" | "comments";
} {
  const ended = interviewMeetingHasEnded(row.scheduled_at, row.scheduled_at_end, now);
  const status = (row.my_feedback_status || "pending").toLowerCase();
  if (ended && (status === "pending" || status === "draft")) {
    return {
      label: status === "draft" ? "Finish feedback" : "Feedback pending",
      variant: "default",
      panel: "interviews",
    };
  }
  if (!ended && row.scheduled_at && new Date(row.scheduled_at).getTime() > now.getTime()) {
    return { label: "Upcoming", variant: "secondary", panel: "interviews" };
  }
  return { label: "View pipeline", variant: "outline", panel: "interviews" };
}

function AssignmentsList({
  assignments,
  isLoading,
  displayTz,
  dateFormat,
}: {
  assignments: InterviewerAssignmentRow[];
  isLoading: boolean;
  displayTz: string;
  dateFormat: string | null;
}) {
  const now = new Date();

  if (isLoading) {
    return (
      <div className="space-y-3 pr-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center rounded-xl border border-dashed bg-muted/20">
        No active interview assignments
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70 rounded-xl border border-border/70 overflow-hidden mr-4">
      {assignments.map((row) => {
        const candidateName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Candidate";
        const action = assignmentAction(row, now);
        return (
          <li key={row.history_id}>
            <Link
              href={assignmentHref(row, action.panel)}
              className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{candidateName}</span>
                  <Badge variant={action.variant} className="text-[10px] shrink-0">
                    {action.label}
                  </Badge>
                </div>
                <span className="text-xs font-medium text-foreground">{roundLabel(row)}</span>
                <p className="text-xs text-muted-foreground truncate">{row.job_title || "Job"}</p>
              </div>
              <div className="flex sm:flex-col items-start sm:items-end gap-1.5 shrink-0 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTimeDisplay(row.scheduled_at, displayTz, dateFormat)}
                </span>
                <span className="inline-flex items-center gap-1 text-primary/80 group-hover:text-primary">
                  <MessageSquare className="h-3 w-3" />
                  Open pipeline
                </span>
              </div>
              <ChevronRight className="hidden sm:block h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Landing card — applicants where the signed-in user is an active interview panelist. */
export function MyInterviewerAssignmentsLandingCard({ limit = 30 }: { limit?: number }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const displayTz = user?.timeZone?.trim() || "UTC";
  const dateFormat = user?.dateFormat ?? null;

  const { data, isLoading } = useQuery<{ assignments: InterviewerAssignmentRow[] }>({
    queryKey: ["/api/recruitment/interviewer-assignments", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/interviewer-assignments?limit=${limit}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const assignments = data?.assignments ?? [];
  const count = assignments.length;
  const now = new Date();
  const feedbackDue = assignments.filter((row) => {
    const ended = interviewMeetingHasEnded(row.scheduled_at, row.scheduled_at_end, now);
    const status = (row.my_feedback_status || "pending").toLowerCase();
    return ended && (status === "pending" || status === "draft");
  }).length;

  const subtitle = isLoading
    ? "Loading…"
    : count === 0
      ? "No assignments right now"
      : feedbackDue > 0
        ? `${count} assigned · ${feedbackDue} need feedback`
        : `${count} candidate${count === 1 ? "" : "s"} assigned to you`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group text-left rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 border border-sky-200 dark:bg-sky-900/20 dark:border-sky-800/40">
            <ClipboardList className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && feedbackDue > 0 && (
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[11px] font-bold tabular-nums text-white shadow-sm">
                {feedbackDue > 99 ? "99+" : feedbackDue}
              </span>
            )}
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-0.5 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-0.5">My Assignments</h2>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        <p className="text-[13px] text-muted-foreground/80 leading-relaxed">
          Candidates you are interviewing — open their pipeline to submit feedback or leave comments.
        </p>

        <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all duration-150">
          View Assignments <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[min(85vh,720px)] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/70 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-sky-600" />
              My Interview Assignments
            </DialogTitle>
            <DialogDescription>
              Applicants assigned to you as a panelist. Open a row to view their pipeline, submit interview feedback, or add comments.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6 py-4 max-h-[calc(min(85vh,720px)-7rem)]">
            <AssignmentsList
              assignments={assignments}
              isLoading={isLoading}
              displayTz={displayTz}
              dateFormat={dateFormat}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
