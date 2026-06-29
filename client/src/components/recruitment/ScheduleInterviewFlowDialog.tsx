import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeMultiSelect } from "@/components/EmployeeSelect";
import { SimpleEmailBodyEditor } from "@/components/recruitment/SimpleEmailBodyEditor";
import { apiRequest } from "@/lib/queryClient";
import { CalendarClock, ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultInterviewEndTime, interviewEndTimeAfterStart } from "@shared/interviewScheduleTime";

/** Must match server `INTERVIEW_SCHEDULE_IANA_OPTIONS` (Asia/Karachi, America/New_York, Asia/Kolkata). */
const SCHEDULE_TZ_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "America/New_York", label: "US Eastern (ET)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
] as const;

function htmlBodyIsEmpty(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return !text;
}

export type ScheduleInterviewApp = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
  stage: string;
};

type PreviewResp = {
  maxRoundThisStage: number;
  candidate: { subject: string; body: string; enabled: boolean } | null;
  panel: { subject: string; body: string; enabled: boolean } | null;
};

export function ScheduleInterviewFlowDialog({
  open,
  onClose,
  application,
  employees,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  application: ScheduleInterviewApp | null;
  employees: { id: string; first_name: string; last_name: string; department?: string; work_email?: string }[];
  onSuccess?: (updatedApp: Record<string, unknown>) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [pipelineStage, setPipelineStage] = useState<"screening" | "interview">("screening");
  const [round, setRound] = useState(1);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState("");
  /** Wall-clock zone for date/time + email placeholders (not browser local). */
  const [ianaTimezone, setIanaTimezone] = useState<string>("Asia/Karachi");
  const [selectedInterviewerIds, setSelectedInterviewerIds] = useState<string[]>([]);
  const [format, setFormat] = useState<"onsite" | "teams">("onsite");
  const [notes, setNotes] = useState("");
  const [candidateSubject, setCandidateSubject] = useState("");
  const [candidateBody, setCandidateBody] = useState("");
  const [panelSubject, setPanelSubject] = useState("");
  const [panelBody, setPanelBody] = useState("");
  const [sending, setSending] = useState(false);
  /** Bump when template HTML is applied so WYSIWYG editors reload. */
  const [templateNonce, setTemplateNonce] = useState(0);

  useEffect(() => {
    if (!open || !application) return;
    setStep(1);
    setScheduledDate("");
    setScheduledTime("");
    setScheduledTimeEnd("");
    setIanaTimezone("Asia/Karachi");
    setSelectedInterviewerIds([]);
    setNotes("");
    setFormat("onsite");
    setCandidateSubject("");
    setCandidateBody("");
    setPanelSubject("");
    setPanelBody("");
    setTemplateNonce(0);
    if (application.stage === "interview") setPipelineStage("interview");
    else if (application.stage === "screening") setPipelineStage("screening");
    else setPipelineStage("screening");
  }, [open, application?.id, application?.stage]);

  useEffect(() => {
    if (!scheduledTime) {
      setScheduledTimeEnd("");
      return;
    }
    setScheduledTimeEnd((prev) => {
      if (!prev || !interviewEndTimeAfterStart(scheduledTime, prev)) {
        return defaultInterviewEndTime(scheduledTime);
      }
      return prev;
    });
  }, [scheduledTime]);

  const { data: meta } = useQuery({
    queryKey: ["/api/recruitment/applications", application?.id, "interview-meta", pipelineStage],
    queryFn: async () => {
      const u = new URLSearchParams({ pipelineStage });
      const res = await apiRequest("GET", `/api/recruitment/applications/${application!.id}/interview-schedule/preview?${u}`);
      return res.json() as Promise<PreviewResp>;
    },
    enabled: open && !!application?.id && !!pipelineStage,
  });

  useEffect(() => {
    if (!open || !meta || typeof meta.maxRoundThisStage !== "number") return;
    const next = Math.min(3, Math.max(1, meta.maxRoundThisStage + 1));
    setRound(next);
  }, [open, meta?.maxRoundThisStage, pipelineStage]);

  const scheduleReady = !!(scheduledDate && scheduledTime && scheduledTimeEnd);

  const { data: fullPreview, isLoading: previewLoading } = useQuery({
    queryKey: [
      "/api/recruitment/applications",
      application?.id,
      "interview-preview-full",
      pipelineStage,
      round,
      format,
      scheduledDate,
      scheduledTime,
      scheduledTimeEnd,
      ianaTimezone,
      selectedInterviewerIds.join(","),
      notes,
    ],
    queryFn: async () => {
      const u = new URLSearchParams({
        pipelineStage,
        round: String(round),
        format,
        scheduledWallDate: scheduledDate,
        scheduledWallTime: scheduledTime,
        scheduledWallTimeEnd: scheduledTimeEnd,
        ianaTimezone,
        interviewerIds: selectedInterviewerIds.join(","),
        notes: notes || "",
      });
      const res = await apiRequest("GET", `/api/recruitment/applications/${application!.id}/interview-schedule/preview?${u}`);
      return res.json() as Promise<PreviewResp>;
    },
    enabled: open && !!application && step === 2 && scheduleReady && selectedInterviewerIds.length > 0,
  });

  useEffect(() => {
    if (step !== 2 || !fullPreview?.candidate || !fullPreview?.panel) return;
    setCandidateSubject(fullPreview.candidate.subject);
    setCandidateBody(fullPreview.candidate.body);
    setPanelSubject(fullPreview.panel.subject);
    setPanelBody(fullPreview.panel.body);
    setTemplateNonce((n) => n + 1);
  }, [step, fullPreview]);

  const updateApplicationsCache = (updatedApp: Record<string, unknown>) => {
    queryClient.setQueriesData({ queryKey: ["/api/recruitment/applications"] }, (old: unknown) => {
      if (!old) return old;
      if (Array.isArray(old)) return old.map((a: { id: string }) => (a.id === updatedApp.id ? { ...a, ...updatedApp } : a));
      if (typeof old === "object" && old !== null && "applications" in old) {
        const data = old as { applications: { id: string }[]; total: number };
        return { ...data, applications: data.applications.map((a) => (a.id === updatedApp.id ? { ...a, ...updatedApp } : a)) };
      }
      return old;
    });
  };

  const handleNext = () => {
    if (!application) return;
    if (!scheduledDate || !scheduledTime || !scheduledTimeEnd) {
      toast.error("Pick a date, start time, and end time.");
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(scheduledTime)) {
      toast.error("Invalid date or time.");
      return;
    }
    setStep(2);
  };

  const handleSend = async () => {
    if (!application) return;
    if (
      !candidateSubject.trim() ||
      !panelSubject.trim() ||
      htmlBodyIsEmpty(candidateBody) ||
      htmlBodyIsEmpty(panelBody)
    ) {
      toast.error("Fill in both subject lines and both email messages.");
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest("POST", `/api/recruitment/applications/${application.id}/interview-schedule/send`, {
        pipelineStage,
        round,
        scheduledWallDate: scheduledDate,
        scheduledWallTime: scheduledTime,
        scheduledWallTimeEnd: scheduledTimeEnd,
        ianaTimezone,
        interviewerIds: selectedInterviewerIds,
        format,
        notes: notes || null,
        candidateSubject,
        candidateBodyHtml: candidateBody,
        panelSubject,
        panelBodyHtml: panelBody,
      });
      const updatedApp = (await res.json()) as Record<string, unknown>;
      updateApplicationsCache(updatedApp);
      onSuccess?.(updatedApp);
      toast.success("Invites sent and schedule saved.");
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", application.id, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  if (!application) return null;

  const labelStage = pipelineStage === "screening" ? "Screening" : "Interview";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <CalendarClock className="h-5 w-5 text-orange-600" />
            Schedule {labelStage}
            <span className="text-xs font-normal bg-muted px-2 py-0.5 rounded-full border border-border">
              Round {round} · {labelStage}
            </span>
          </DialogTitle>
          <DialogDescription>
            {application.first_name} {application.last_name} · {application.job_title}
            <span className="block mt-1 text-xs text-muted-foreground">
              Step {step} of 2 — {step === 1 ? "Details" : "Review emails, then send"}
            </span>
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Pipeline stage</Label>
              <RadioGroup
                value={pipelineStage}
                onValueChange={(v) => setPipelineStage(v as "screening" | "interview")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="screening" id="ps-screening" />
                  <Label htmlFor="ps-screening" className="font-normal cursor-pointer">
                    Screening
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="interview" id="ps-interview" />
                  <Label htmlFor="ps-interview" className="font-normal cursor-pointer">
                    Interview
                  </Label>
                </div>
              </RadioGroup>
              {meta && typeof meta.maxRoundThisStage === "number" && (
                <p className="text-xs text-muted-foreground">
                  Scheduled so far in this stage: {meta.maxRoundThisStage} — next suggested round: {Math.min(3, meta.maxRoundThisStage + 1)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Round</Label>
              <RadioGroup value={String(round)} onValueChange={(v) => setRound(parseInt(v, 10))} className="flex gap-3">
                {([1, 2, 3] as const).map((r) => (
                  <div key={r} className="flex items-center space-x-2">
                    <RadioGroupItem value={String(r)} id={`round-${r}`} />
                    <Label htmlFor={`round-${r}`} className="font-normal cursor-pointer">
                      Round {r}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>
                  Timezone <span className="text-destructive">*</span>
                </Label>
                <Select value={ianaTimezone} onValueChange={setIanaTimezone}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_TZ_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>
                  From <span className="text-destructive">*</span>
                </Label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>
                  To <span className="text-destructive">*</span>
                </Label>
                <Input type="time" value={scheduledTimeEnd} onChange={(e) => setScheduledTimeEnd(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Calendar invite and emails use this start–end window in the selected timezone.
            </p>
            <div className="space-y-2">
              <Label>Format</Label>
              <RadioGroup value={format} onValueChange={(v) => setFormat(v as "onsite" | "teams")} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="onsite" id="fmt-onsite" />
                  <Label htmlFor="fmt-onsite" className="font-normal cursor-pointer">
                    Onsite
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="teams" id="fmt-teams" />
                  <Label htmlFor="fmt-teams" className="font-normal cursor-pointer">
                    Microsoft Teams
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {format === "teams"
                  ? "Teams meeting is created only when you click Send."
                  : "No Teams meeting — invite email only."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                Interviewer(s) <span className="text-destructive">*</span>
              </Label>
              <EmployeeMultiSelect
                value={selectedInterviewerIds}
                onChange={setSelectedInterviewerIds}
                employees={employees as never}
                placeholder="Select employees…"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-normal">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Location, agenda…" className="resize-none" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            {previewLoading && <p className="text-sm text-muted-foreground">Loading templates…</p>}
            <Tabs defaultValue="candidate" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="candidate" className="gap-1">
                  <Mail className="h-3.5 w-3.5" /> Candidate
                </TabsTrigger>
                <TabsTrigger value="panel" className="gap-1">
                  <Mail className="h-3.5 w-3.5" /> Panel + recruiter
                </TabsTrigger>
              </TabsList>
              <TabsContent value="candidate" className="space-y-2 mt-3">
                <Label>Subject line</Label>
                <Input value={candidateSubject} onChange={(e) => setCandidateSubject(e.target.value)} placeholder="e.g. Interview confirmed" />
                <Label>Email to the candidate</Label>
                <SimpleEmailBodyEditor
                  remountKey={`c-${templateNonce}`}
                  value={candidateBody}
                  onChange={setCandidateBody}
                  placeholder="Write your message to the candidate…"
                />
              </TabsContent>
              <TabsContent value="panel" className="space-y-2 mt-3">
                <Label>Subject line</Label>
                <Input value={panelSubject} onChange={(e) => setPanelSubject(e.target.value)} placeholder="e.g. Interview panel — details" />
                <Label>Email to interviewers and recruiter</Label>
                <SimpleEmailBodyEditor
                  remountKey={`p-${templateNonce}`}
                  value={panelBody}
                  onChange={setPanelBody}
                  placeholder="Write your message to the interview panel…"
                />
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Text comes from Settings → Notifications (you can change it here). For Microsoft Teams interviews, leave the line
              about the meeting link in the message — it will be filled in when you click Send.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 2 && (
            <Button type="button" variant="outline" onClick={() => setStep(1)} className="mr-auto">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button type="button" onClick={handleNext}>
              Next: compose emails <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSend} disabled={sending || previewLoading}>
              {sending ? "Sending…" : "Send invites"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
