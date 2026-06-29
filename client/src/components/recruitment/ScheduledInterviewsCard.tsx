import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, CalendarClock, ChevronRight, Clock, MapPin, Users, Video } from "lucide-react";
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

export type ScheduledInterviewRow = {
  history_id: string;
  application_id: string;
  scheduled_at: string;
  scheduled_at_end?: string | null;
  interview_type?: string | null;
  interview_round?: number | null;
  to_stage?: string | null;
  schedule_format?: string | null;
  interviewer_names?: string | null;
  meeting_link?: string | null;
  job_id: string;
  job_title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function roundLabel(row: ScheduledInterviewRow): string {
  if (row.interview_type?.trim()) return row.interview_type.trim();
  const stage = row.to_stage === "interview" ? "Interview" : "Screening";
  const round = row.interview_round ? ` — Round ${row.interview_round}` : "";
  return `${stage}${round}`;
}

function applicantHref(row: ScheduledInterviewRow): string {
  return `${recruitmentApplicantDeepLink(row.job_id, row.application_id)}&panel=interviews`;
}

/** Online (Teams) vs offline (onsite); infer from meeting link when format not stored. */
function interviewDeliveryMeta(row: ScheduledInterviewRow): { isOnline: boolean; badgeLabel: string } {
  const fmt = (row.schedule_format || "").trim().toLowerCase();
  if (fmt === "teams" || (!fmt && row.meeting_link)) {
    return { isOnline: true, badgeLabel: "Online · MS Teams" };
  }
  if (fmt === "onsite") {
    return { isOnline: false, badgeLabel: "Offline · Onsite" };
  }
  return row.meeting_link
    ? { isOnline: true, badgeLabel: "Online · MS Teams" }
    : { isOnline: false, badgeLabel: "Offline · Onsite" };
}

function InterviewFormatBadge({ row }: { row: ScheduledInterviewRow }) {
  const { isOnline, badgeLabel } = interviewDeliveryMeta(row);
  if (isOnline) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-semibold uppercase tracking-wide gap-1 border-[#5059c9]/40 bg-[#5059c9]/10 text-[#5059c9] shrink-0"
      >
        <Video className="h-2.5 w-2.5" />
        {badgeLabel}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wide gap-1 shrink-0">
      <MapPin className="h-2.5 w-2.5" />
      {badgeLabel}
    </Badge>
  );
}

function ScheduledInterviewsList({
  interviews,
  isLoading,
  displayTz,
  dateFormat,
}: {
  interviews: ScheduledInterviewRow[];
  isLoading: boolean;
  displayTz: string;
  dateFormat: string | null;
}) {
  const now = new Date();

  if (isLoading) {
    return (
      <div className="space-y-3 pr-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center rounded-xl border border-dashed bg-muted/20">
        No upcoming interviews scheduled
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70 rounded-xl border border-border/70 overflow-hidden mr-4">
      {interviews.map((row) => {
        const candidateName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Candidate";
        const ended = interviewMeetingHasEnded(row.scheduled_at, row.scheduled_at_end, now);
        const live = !ended && row.scheduled_at
          ? new Date(row.scheduled_at).getTime() - 15 * 60 * 1000 < now.getTime()
          : false;
        return (
          <li key={row.history_id}>
            <Link
              href={applicantHref(row)}
              className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{candidateName}</span>
                  {live && (
                    <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                      Live
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{roundLabel(row)}</span>
                  <InterviewFormatBadge row={row} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{row.job_title || "Job"}</p>
              </div>
              <div className="flex sm:flex-col items-start sm:items-end gap-1 shrink-0 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTimeDisplay(row.scheduled_at, displayTz, dateFormat)}
                </span>
                {row.interviewer_names?.trim() && (
                  <span className="inline-flex items-center gap-1 max-w-[220px] truncate" title={row.interviewer_names}>
                    <Users className="h-3 w-3 shrink-0" />
                    {row.interviewer_names}
                  </span>
                )}
              </div>
              <ChevronRight className="hidden sm:block h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Landing-page card — click to open the scheduled interviews list in a dialog. */
export function ScheduledInterviewsLandingCard({ limit = 30 }: { limit?: number }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const displayTz = user?.timeZone?.trim() || "UTC";
  const dateFormat = user?.dateFormat ?? null;

  const { data, isLoading } = useQuery<{ interviews: ScheduledInterviewRow[] }>({
    queryKey: ["/api/recruitment/interviews/scheduled", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/interviews/scheduled?limit=${limit}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const interviews = data?.interviews ?? [];
  const count = interviews.length;
  const onlineCount = interviews.filter((r) => interviewDeliveryMeta(r).isOnline).length;
  const offlineCount = count - onlineCount;
  const subtitle = isLoading
    ? "Loading…"
    : count === 0
      ? "No upcoming interviews"
      : `${count} upcoming · ${onlineCount} online, ${offlineCount} onsite`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group text-left rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/40">
            <CalendarClock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && count > 0 && (
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-bold tabular-nums text-white shadow-sm">
                {count > 99 ? "99+" : count}
              </span>
            )}
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-0.5 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-0.5">Scheduled Interviews</h2>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        <p className="text-[13px] text-muted-foreground/80 leading-relaxed">
          See upcoming and in-progress interview rounds — open a candidate to view details, panel, and feedback.
        </p>

        <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all duration-150">
          View Interviews <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[min(85vh,720px)] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/70 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-orange-600" />
              Scheduled Interviews
            </DialogTitle>
            <DialogDescription>
              Upcoming and in-progress rounds across your jobs. Click a row to open the candidate interviews tab.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6 py-4 max-h-[calc(min(85vh,720px)-7rem)]">
            <ScheduledInterviewsList
              interviews={interviews}
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
