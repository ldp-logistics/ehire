import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeMultiSelect } from "@/components/EmployeeSelect";
import {
  CalendarClock, Clock, Users, Video, BellRing, MessageSquarePlus,
  Loader2, Check, AlertCircle, Pencil, X, Ban, UserX, Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { defaultInterviewEndTime, interviewEndTimeAfterStart, interviewMeetingHasEnded } from "@shared/interviewScheduleTime";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeDisplay, formatTimeOnlyDisplay } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { InterviewFeedbackDialog, type InterviewRound, type FeedbackRow } from "./InterviewFeedbackDialog";
import { PanelFeedbackViewDialog, type PanelFeedbackRow } from "./PanelFeedbackViewDialog";

// ── Constants ─────────────────────────────────────────────────────────────────

const SCHEDULE_TZ_OPTIONS = [
  { value: "Asia/Karachi",   label: "Pakistan (PKT)" },
  { value: "America/New_York", label: "US Eastern (ET)" },
  { value: "Asia/Kolkata",   label: "India (IST)" },
  { value: "UTC",            label: "UTC" },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

type InterviewerRow = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

type Feedback = {
  id?: string;
  reviewer_employee_id?: string | null;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
  status: "pending" | "draft" | "submitted" | "no_show";
  overall_rating?: number | null;
  overall_comments?: string | null;
  scorecard?: unknown[];
  test_report_url?: string | null;
  test_report_filename?: string | null;
};

type Round = {
  id: string;
  to_stage: string;
  interview_round?: number | null;
  interview_type?: string | null;
  schedule_format?: string | null;
  scheduled_at?: string | null;
  scheduled_at_end?: string | null;
  meeting_link?: string | null;
  interviewer_names?: string | null;
  interviewer_ids?: string[];
  scheduled_by_name?: string | null;
  scheduled_by_employee_id?: string | null;
  feedback?: Feedback[];
  cancelled_at?: string | null;
  no_show_at?: string | null;
};

type Application = {
  id: string;
  job_title: string;
  job_department?: string;
  job_location?: string | null;
  stage: string;
};

interface Props {
  applications: Application[];
  candidate: {
    id?: string;
    first_name?: string;
    last_name?: string;
    resume_url?: string | null;
    resume_filename?: string | null;
  };
  employees: Array<{ id: string; first_name: string; last_name: string; work_email?: string }>;
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Feedback Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  draft:     { label: "Draft Saved",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  submitted: { label: "Submitted",          cls: "bg-green-50 text-green-700 border-green-200" },
  no_show:   { label: "No Show",            cls: "bg-red-50 text-red-700 border-red-200" },
};

function FeedbackStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
      {meta.label}
    </Badge>
  );
}

function shouldShowPanelFeedbackStatus(status: string, meetingEnded: boolean): boolean {
  if (status === "pending") return meetingEnded;
  return true;
}

// ── EditInterviewDialog ───────────────────────────────────────────────────────

function EditInterviewDialog({
  open,
  onClose,
  appId,
  round,
  employees,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  appId: string;
  round: Round;
  employees: Props["employees"];
  onSuccess: () => void;
}) {
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState("");
  const [ianaTimezone, setIanaTimezone] = useState("Asia/Karachi");
  const [selectedInterviewerIds, setSelectedInterviewerIds] = useState<string[]>([]);
  const [format, setFormat] = useState<"onsite" | "teams">("onsite");
  const [saving, setSaving] = useState(false);

  // Populate from existing round on open
  useEffect(() => {
    if (!open) return;
    if (round.scheduled_at) {
      const d = new Date(round.scheduled_at);
      setScheduledDate(d.toISOString().slice(0, 10));
      const start = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      setScheduledTime(start);
      setScheduledTimeEnd(defaultInterviewEndTime(start));
    } else {
      setScheduledDate("");
      setScheduledTime("");
      setScheduledTimeEnd("");
    }
    setIanaTimezone("Asia/Karachi");
    setSelectedInterviewerIds(round.interviewer_ids ?? []);
    setFormat((round.schedule_format as "onsite" | "teams") ?? "onsite");
  }, [open, round.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !scheduledTime) return;
    setScheduledTimeEnd((prev) => {
      if (!prev || !interviewEndTimeAfterStart(scheduledTime, prev)) {
        return defaultInterviewEndTime(scheduledTime);
      }
      return prev;
    });
  }, [open, scheduledTime]);

  const handleSave = async () => {
    if (!scheduledDate || !scheduledTime || !scheduledTimeEnd) {
      toast.error("Please pick a date, start time, and end time.");
      return;
    }
    if (!interviewEndTimeAfterStart(scheduledTime, scheduledTimeEnd)) {
      toast.error("End time must be after start time.");
      return;
    }
    if (selectedInterviewerIds.length === 0) {
      toast.error("Select at least one interviewer.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/recruitment/applications/${appId}/interviews/${round.id}`, {
        scheduledWallDate: scheduledDate,
        scheduledWallTime: scheduledTime,
        scheduledWallTimeEnd: scheduledTimeEnd,
        ianaTimezone,
        interviewerIds: selectedInterviewerIds,
        format,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to update interview");
      }
      toast.success("Interview updated. Candidate and panel have been notified by email.");
      onSuccess();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update interview");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Interview</DialogTitle>
          <DialogDescription>
            Update time, panel, or format. Saving will email the candidate and all interviewers with the updated details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="time" value={scheduledTimeEnd} onChange={(e) => setScheduledTimeEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Select value={ianaTimezone} onValueChange={setIanaTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCHEDULE_TZ_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as "onsite" | "teams")}
              className="flex items-center gap-6"
            >
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <RadioGroupItem value="onsite" id="edit-onsite" /> Onsite
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <RadioGroupItem value="teams" id="edit-teams" />
                <Video className="h-3.5 w-3.5 text-[#5059c9]" /> Microsoft Teams
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Panel / Interviewers</Label>
            <EmployeeMultiSelect
              value={selectedInterviewerIds}
              onChange={setSelectedInterviewerIds}
              employees={employees}
              placeholder="Add interviewers…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving & notifying…</> : "Save & notify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RoundCard ─────────────────────────────────────────────────────────────────

function RoundCard({
  round,
  appId,
  candidate,
  employeeMap,
  myEmployeeId,
  canAdminRemind,
  employees,
  onRoundUpdated,
}: {
  round: Round;
  appId: string;
  candidate: Props["candidate"];
  employeeMap: Map<string, { first_name: string; last_name: string; work_email?: string }>;
  myEmployeeId?: string | null;
  canAdminRemind: boolean;
  employees: Props["employees"];
  onRoundUpdated: () => void;
}) {
  const { user } = useAuth();
  const displayTz = user?.timeZone?.trim() || "UTC";
  const qc = useQueryClient();
  const [reminding, setReminding] = useState(false);
  const [feedbackDlg, setFeedbackDlg] = useState(false);
  const [panelFeedbackDlg, setPanelFeedbackDlg] = useState(false);
  const [editDlg, setEditDlg] = useState(false);
  const [cancelDlg, setCancelDlg] = useState(false);
  const [noShowDlg, setNoShowDlg] = useState(false);
  const [actioning, setActioning] = useState(false);

  const now = new Date();
  const isCancelled = !!round.cancelled_at;
  const isNoShow = !!round.no_show_at;
  const meetingEnded = interviewMeetingHasEnded(round.scheduled_at, round.scheduled_at_end, now);
  const meetingLive = round.scheduled_at && !meetingEnded
    ? new Date(round.scheduled_at).getTime() - 15 * 60 * 1000 < now.getTime()
    : false;

  const interviewerIds: string[] = round.interviewer_ids ?? [];
  const interviewers: InterviewerRow[] = interviewerIds.map((id) => {
    const emp = employeeMap.get(id);
    return emp
      ? { id, name: `${emp.first_name} ${emp.last_name}`.trim() }
      : { id, name: id };
  });

  const myFeedback = round.feedback?.find(
    (f) => f.reviewer_employee_id && myEmployeeId && String(f.reviewer_employee_id) === String(myEmployeeId),
  ) ?? null;

  const iAmInterviewer = myEmployeeId && interviewerIds.includes(myEmployeeId);
  const canSubmitFeedback = (iAmInterviewer || canAdminRemind) && meetingEnded && !isCancelled;
  const submittedPanelFeedback = (round.feedback ?? []).filter(
    (f) => f.status === "submitted" || f.status === "no_show",
  );
  const canViewPanelFeedback =
    meetingEnded && !isCancelled && (iAmInterviewer || canAdminRemind) && submittedPanelFeedback.length > 0;
  const allSubmitted = round.feedback?.length
    ? round.feedback.every((f) => f.status === "submitted" || f.status === "no_show")
    : false;

  const canEdit   = canAdminRemind && !isCancelled;
  const canCancel = canAdminRemind && !isCancelled && !meetingEnded;
  const canNoShow = canAdminRemind && !isCancelled && meetingEnded && !isNoShow;

  async function sendReminder() {
    setReminding(true);
    try {
      const res = await apiRequest("POST", `/api/recruitment/applications/${appId}/interviews/${round.id}/remind`, {});
      const data = (await res.json()) as { sent?: number };
      qc.invalidateQueries({ queryKey: ["/api/recruitment/applications", appId, "interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      if ((data.sent ?? 0) > 0) {
        toast.success(`Reminder email sent to ${data.sent} interviewer(s).`);
      } else {
        toast.message("No reminders sent", {
          description: "There may be no pending reviewers, or interviewer emails are missing.",
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send reminder");
    } finally {
      setReminding(false);
    }
  }

  async function doCancel() {
    setActioning(true);
    try {
      const res = await apiRequest("POST", `/api/recruitment/applications/${appId}/interviews/${round.id}/cancel`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to cancel");
      }
      toast.success("Interview cancelled and participants notified.");
      onRoundUpdated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel interview");
    } finally {
      setActioning(false);
      setCancelDlg(false);
    }
  }

  async function doNoShow() {
    setActioning(true);
    try {
      const res = await apiRequest("POST", `/api/recruitment/applications/${appId}/interviews/${round.id}/no-show`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to mark no-show");
      }
      toast.success("Interview marked as no-show.");
      onRoundUpdated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to mark no-show");
    } finally {
      setActioning(false);
      setNoShowDlg(false);
    }
  }

  const stageLabel = round.to_stage === "interview" ? "Interview" : "Screening";
  const roundLabel = round.interview_round ? `Round ${round.interview_round}` : null;
  const headline =
    (round.interview_type && String(round.interview_type).trim()) ||
    [stageLabel, roundLabel].filter(Boolean).join(" · ") ||
    stageLabel;

  return (
    <>
      <div className={`border border-border rounded-xl overflow-hidden bg-card shadow-sm ${isCancelled ? "opacity-60" : ""}`}>
        {/* Time column + header */}
        <div className="flex items-stretch">
          {/* Left time block */}
          {round.scheduled_at && (() => {
            const sched = new Date(round.scheduled_at);
            const tzOpt = { timeZone: displayTz } as const;
            return (
            <div className="w-20 shrink-0 flex flex-col items-center justify-center bg-muted/40 border-r border-border py-4 gap-0.5">
              <p className="text-[10px] font-bold uppercase text-primary tracking-wide">
                {sched.toLocaleString("en-US", { month: "short", ...tzOpt }).toUpperCase()}
              </p>
              <p className="text-2xl font-bold leading-none text-foreground">
                {sched.toLocaleString("en-US", { day: "numeric", ...tzOpt })}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {sched.toLocaleString("en-US", { weekday: "short", ...tzOpt })}
              </p>
              <p className="text-[10px] font-medium mt-1 text-muted-foreground text-center leading-tight">
                {formatTimeOnlyDisplay(round.scheduled_at, displayTz)}
              </p>
            </div>
            );
          })()}

          {/* Content */}
          <div className="flex-1 p-4 space-y-3">
            {/* Title row */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold text-sm ${isCancelled ? "line-through text-muted-foreground" : ""}`}>{headline}</span>
                  {round.schedule_format && !isCancelled && (
                    <Badge variant="secondary" className="text-[10px] uppercase px-1.5">
                      {round.schedule_format === "teams" ? (
                        <span className="flex items-center gap-1"><Video className="h-2.5 w-2.5" />{round.schedule_format}</span>
                      ) : round.schedule_format}
                    </Badge>
                  )}
                  {isCancelled && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
                      <Ban className="h-2.5 w-2.5" /> Cancelled
                    </Badge>
                  )}
                  {isNoShow && !isCancelled && (
                    <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 flex items-center gap-1">
                      <UserX className="h-2.5 w-2.5" /> No Show
                    </Badge>
                  )}
                  {allSubmitted && interviewerIds.length > 0 && !isCancelled && (
                    <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                      <Check className="h-2.5 w-2.5 mr-0.5" /> All Feedback Submitted
                    </Badge>
                  )}
                </div>
                {round.scheduled_at && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTimeDisplay(round.scheduled_at, displayTz, user?.dateFormat ?? null)}
                    {!isCancelled && !meetingEnded && <span className="text-blue-600 ml-1">(upcoming)</span>}
                    {!isCancelled && meetingEnded && <span className="text-muted-foreground ml-1">(ended)</span>}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {!isCancelled && (
                <div className="flex flex-wrap items-center gap-2">
                  {round.meeting_link && (meetingLive || !meetingEnded) && (
                    <Button size="sm" className="gap-1.5 bg-[#5059c9] hover:bg-[#4048b0] text-white" asChild>
                      <a href={round.meeting_link} target="_blank" rel="noopener noreferrer">
                        <Video className="h-3.5 w-3.5" /> Join
                      </a>
                    </Button>
                  )}
                  {canSubmitFeedback && (
                    <Button
                      size="sm"
                      variant={myFeedback?.status === "submitted" ? "outline" : "default"}
                      className="gap-1.5"
                      onClick={() => setFeedbackDlg(true)}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      {myFeedback?.status === "submitted" ? "View My Feedback" : myFeedback?.status === "draft" ? "Continue Feedback" : "Submit Feedback"}
                    </Button>
                  )}
                  {canViewPanelFeedback && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setPanelFeedbackDlg(true)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Panel Feedback ({submittedPanelFeedback.length})
                    </Button>
                  )}
                  {canAdminRemind && meetingEnded && !allSubmitted && !isNoShow && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={reminding}
                      onClick={sendReminder}
                    >
                      {reminding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                      Send Reminder
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-blue-600"
                      onClick={() => setEditDlg(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setCancelDlg(true)}
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                  {canNoShow && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => setNoShowDlg(true)}
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> No Show
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Interviewer list */}
            {interviewers.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Panel
                </p>
                <div className="space-y-1.5">
                  {interviewers.map((iv) => {
                    const fb = round.feedback?.find(
                      (f) => f.reviewer_employee_id && iv.id && String(f.reviewer_employee_id) === String(iv.id),
                    );
                    const initials = (iv.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={iv.id ?? iv.name} className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 border border-muted shrink-0">
                          {iv.id ? (
                            <AvatarImage src={`/api/employees/${iv.id}/avatar`} alt="" className="object-cover" />
                          ) : null}
                          <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium leading-snug">{iv.name ?? "Unknown"}</span>
                        {fb && shouldShowPanelFeedbackStatus(fb.status, meetingEnded) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (fb.status === "submitted" || fb.status === "no_show") setPanelFeedbackDlg(true);
                            }}
                            className={cn(
                              fb.status === "submitted" || fb.status === "no_show"
                                ? "cursor-pointer hover:opacity-80"
                                : "cursor-default",
                            )}
                            title={
                              fb.status === "submitted" || fb.status === "no_show"
                                ? "View submitted feedback"
                                : undefined
                            }
                          >
                            <FeedbackStatusBadge status={fb.status} />
                          </button>
                        )}
                        {!fb && meetingEnded && !isCancelled && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            Feedback Pending
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scheduled by */}
            {round.scheduled_by_name && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Scheduled by <span className="font-medium text-foreground/80 ml-1">{round.scheduled_by_name}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <PanelFeedbackViewDialog
        open={panelFeedbackDlg}
        onClose={() => setPanelFeedbackDlg(false)}
        candidateName={`${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim() || "Candidate"}
        roundLabel={headline}
        feedback={(round.feedback ?? []) as PanelFeedbackRow[]}
        myEmployeeId={myEmployeeId}
        interviewerNames={new Map(interviewers.map((iv) => [iv.id ?? "", iv.name ?? "Unknown"]))}
      />

      {/* Feedback dialog */}
      <InterviewFeedbackDialog
        open={feedbackDlg}
        onClose={() => setFeedbackDlg(false)}
        round={{
          id: round.id,
          application_id: appId,
          to_stage: round.to_stage,
          interview_round: round.interview_round,
          interview_type: round.interview_type,
          schedule_format: round.schedule_format,
          scheduled_at: round.scheduled_at,
          scheduled_by_name: round.scheduled_by_name,
        } as InterviewRound}
        candidate={{
          first_name: candidate.first_name ?? "",
          last_name: candidate.last_name ?? "",
          resume_url: candidate.resume_url,
          resume_filename: candidate.resume_filename,
        }}
        myFeedback={myFeedback as FeedbackRow | null}
        canRemind={canAdminRemind}
      />

      {/* Edit dialog */}
      <EditInterviewDialog
        open={editDlg}
        onClose={() => setEditDlg(false)}
        appId={appId}
        round={round}
        employees={employees}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["/api/recruitment/applications", appId, "interviews"] });
          onRoundUpdated();
        }}
      />

      {/* Cancel confirmation */}
      <AlertDialog open={cancelDlg} onOpenChange={setCancelDlg}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this interview?</AlertDialogTitle>
            <AlertDialogDescription>
              The candidate and panel will receive a cancellation email. This cannot be undone — you can schedule a new interview separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doCancel}
              disabled={actioning}
            >
              {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Yes, Cancel Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-show confirmation */}
      <AlertDialog open={noShowDlg} onOpenChange={setNoShowDlg}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No Show?</AlertDialogTitle>
            <AlertDialogDescription>
              All pending feedback slots for this round will be marked as No Show. This is for HR records only and does not send an email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={doNoShow}
              disabled={actioning}
            >
              {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Mark No Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function InterviewsTab({ applications, candidate, employees }: Props) {
  const { user, canManageRecruitmentInterviews } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const canAdminRemind = canManageRecruitmentInterviews;

  const employeeMap = new Map(
    employees.map((e) => [e.id, e]),
  );

  const interviewsData = applications.map((app) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data, isLoading } = useQuery<Round[]>({
      queryKey: ["/api/recruitment/applications", app.id, "interviews"],
      queryFn: async () => {
        const res = await fetch(`/api/recruitment/applications/${app.id}/interviews`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      },
      enabled: true,
      refetchInterval: 15_000,
    });
    return { app, rounds: data ?? [], isLoading };
  });

  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No applications — add an application first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {interviewsData.map(({ app, rounds, isLoading }) => (
        <Card key={app.id}>
          <CardHeader className="pb-2 flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{app.job_title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[app.job_department, app.job_location].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/recruitment/applications/${app.id}/schedule-interview`)}
            >
              <CalendarClock className="h-3.5 w-3.5" /> Schedule
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading interviews…
              </div>
            ) : rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No scheduled interviews for this role yet.</p>
            ) : (
              rounds.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  appId={app.id}
                  candidate={candidate}
                  employeeMap={employeeMap}
                  myEmployeeId={user?.employeeId ?? null}
                  canAdminRemind={canAdminRemind}
                  employees={employees}
                  onRoundUpdated={() => {
                    qc.invalidateQueries({ queryKey: ["/api/recruitment/applications", app.id, "interviews"] });
                    qc.invalidateQueries({ queryKey: ["/api/recruitment/applications", app.id, "history"] });
                    qc.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>
      ))}

    </div>
  );
}
