import { useEffect, useState, useMemo } from "react";
import { useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EmployeeMultiSelect, type EmployeeOption } from "@/components/EmployeeSelect";
import { SimpleEmailBodyEditor } from "@/components/recruitment/SimpleEmailBodyEditor";
import { apiRequest } from "@/lib/queryClient";
import { ONSITE_INTERVIEW_LOCATION_MAX_LENGTH } from "@shared/interviewOnsiteLocation";
import { defaultInterviewEndTime, interviewEndTimeAfterStart } from "@shared/interviewScheduleTime";

function calendarConnectUrl(returnPath: string) {
  return `/api/auth/microsoft/calendar/login?returnTo=${encodeURIComponent(returnPath)}`;
}

function parseApiErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong";
  const raw = err.message.replace(/^\d+:\s*/, "");
  try {
    const json = JSON.parse(raw) as { error?: { message?: string } };
    return json.error?.message || raw;
  } catch {
    return raw;
  }
}
import {
  CalendarClock,
  ChevronRight,
  ArrowLeft,
  Mail,
  MapPin,
  Users,
  Clock,
  Video,
  Building2,
  Info,
  Loader2,
  Send,
  Unlink,
} from "lucide-react";

const SCHEDULE_TZ_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "America/New_York", label: "US Eastern (ET)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
] as const;

function htmlBodyIsEmpty(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return !text;
}

type PreviewResp = {
  maxRoundThisStage: number;
  candidate: { subject: string; body: string; enabled: boolean } | null;
  panel: { subject: string; body: string; enabled: boolean } | null;
};

export default function ScheduleInterviewPage() {
  const [, params] = useRoute("/recruitment/applications/:appId/schedule-interview");
  const appId = params?.appId ?? "";
  const goBack = () => window.history.back();
  const queryClient = useQueryClient();

  // ── Schedule details ─────────────────────────────────────────────────────
  const [pipelineStage, setPipelineStage] = useState<"screening" | "interview">("screening");
  const [round, setRound] = useState(1);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState("");
  const [ianaTimezone, setIanaTimezone] = useState<string>("Asia/Karachi");
  const [format, setFormat] = useState<"onsite" | "teams">("onsite");
  const [location, setLocation] = useState("");
  const [selectedInterviewerIds, setSelectedInterviewerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // ── Email composition ────────────────────────────────────────────────────
  const [candidateSubject, setCandidateSubject] = useState("");
  const [candidateBody, setCandidateBody] = useState("");
  const [panelSubject, setPanelSubject] = useState("");
  const [panelBody, setPanelBody] = useState("");
  const [templateNonce, setTemplateNonce] = useState(0);
  const [sending, setSending] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);

  const { data: calendarStatus, refetch: refetchCalendarStatus } = useQuery<{
    configured: boolean;
    connected: boolean;
  }>({
    queryKey: ["/api/auth/microsoft/calendar/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/microsoft/calendar/status");
      return res.json();
    },
  });

  const calendarConnectRequired = calendarStatus?.configured === true && calendarStatus.connected !== true;
  const calendarConnected = calendarStatus?.configured === true && calendarStatus.connected === true;

  async function disconnectMicrosoftCalendar() {
    setDisconnectingCalendar(true);
    try {
      const res = await apiRequest("POST", "/api/auth/microsoft/calendar/disconnect");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not disconnect Microsoft Calendar");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/microsoft/calendar/status"] });
      toast.success("Microsoft Calendar disconnected.");
    } catch (err) {
      toast.error(parseApiErrorMessage(err));
    } finally {
      setDisconnectingCalendar(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      toast.success("Microsoft Calendar connected. You can schedule interviews now.");
      refetchCalendarStatus();
      params.delete("calendar");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
    const calErr = params.get("calendar_error");
    if (calErr) {
      toast.error(decodeURIComponent(calErr));
      params.delete("calendar_error");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [refetchCalendarStatus]);

  // Location in preview: immediate on format/chip; debounced while typing
  const [locationDebounced, setLocationDebounced] = useState("");
  useEffect(() => {
    if (format !== "onsite") {
      setLocationDebounced("");
      return;
    }
    setLocationDebounced(location);
  }, [format]);

  useEffect(() => {
    if (format !== "onsite") return;
    const t = setTimeout(() => setLocationDebounced(location), 350);
    return () => clearTimeout(t);
  }, [location, format]);

  // ── Load application details ─────────────────────────────────────────────
  const { data: appDetail, isLoading: appLoading } = useQuery<{
    id: string;
    first_name: string;
    last_name: string;
    job_title: string;
    job_department?: string;
    stage: string;
    candidate_email?: string;
  }>({
    queryKey: ["/api/recruitment/applications", appId, "detail"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/applications/${appId}`);
      return res.json();
    },
    enabled: !!appId,
  });

  // ── Load employees ───────────────────────────────────────────────────────
  const { data: employeesRaw } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/employees", "schedule-interview"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/employees");
      const json = await res.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: !!appId,
    staleTime: 300_000,
  });
  const employees = Array.isArray(employeesRaw) ? employeesRaw : [];

  // ── Load saved onsite locations ──────────────────────────────────────────
  const { data: onsiteLocationsData } = useQuery<{ locations: string[] }>({
    queryKey: ["/api/settings/interview-onsite-locations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/interview-onsite-locations");
      return res.json();
    },
  });
  const savedLocations = Array.isArray(onsiteLocationsData?.locations) ? onsiteLocationsData.locations : [];

  // ── Initialise stage from application ───────────────────────────────────
  useEffect(() => {
    if (!appDetail) return;
    if (appDetail.stage === "interview") setPipelineStage("interview");
    else setPipelineStage("screening");
  }, [appDetail?.id, appDetail?.stage]);

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

  // ── Meta (max round for stage) ───────────────────────────────────────────
  const { data: meta } = useQuery<PreviewResp>({
    queryKey: ["/api/recruitment/applications", appId, "interview-meta", pipelineStage],
    queryFn: async () => {
      const u = new URLSearchParams({ pipelineStage });
      const res = await apiRequest("GET", `/api/recruitment/applications/${appId}/interview-schedule/preview?${u}`);
      return res.json();
    },
    enabled: !!appId && !!pipelineStage,
  });

  useEffect(() => {
    if (!meta || typeof meta.maxRoundThisStage !== "number") return;
    const next = Math.min(3, Math.max(1, meta.maxRoundThisStage + 1));
    setRound(next);
  }, [meta?.maxRoundThisStage, pipelineStage]);

  // ── Full preview (live template) ─────────────────────────────────────────
  const scheduleReady = !!(scheduledDate && scheduledTime && scheduledTimeEnd && selectedInterviewerIds.length > 0);

  const previewLocation = format === "onsite" ? locationDebounced : "";

  const previewQueryKey = useMemo(
    () => [
      "/api/recruitment/applications",
      appId,
      "interview-preview-full",
      pipelineStage,
      round,
      format,
      scheduledDate,
      scheduledTime,
      scheduledTimeEnd,
      ianaTimezone,
      selectedInterviewerIds.join(","),
      previewLocation,
      notes,
    ],
    [appId, pipelineStage, round, format, scheduledDate, scheduledTime, scheduledTimeEnd, ianaTimezone, selectedInterviewerIds, previewLocation, notes]
  );

  const {
    data: fullPreview,
    isLoading: previewLoading,
    isFetching: previewFetching,
  } = useQuery<PreviewResp>({
    queryKey: previewQueryKey,
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
        location: previewLocation,
        notes: notes || "",
      });
      const res = await apiRequest("GET", `/api/recruitment/applications/${appId}/interview-schedule/preview?${u}`);
      return res.json();
    },
    enabled: !!appId && scheduleReady,
    staleTime: 0,
  });

  const composerSynced =
    scheduleReady && !!fullPreview?.candidate?.body && !!fullPreview?.panel?.body && !previewLoading && !previewFetching;

  // Clear compose panel when schedule prerequisites are incomplete
  useEffect(() => {
    if (scheduleReady) return;
    setCandidateSubject("");
    setCandidateBody("");
    setPanelSubject("");
    setPanelBody("");
    setTemplateNonce((n) => n + 1);
  }, [scheduleReady]);

  // Keep compose emails in sync with every preview change (date, time, format, interviewers, location, notes)
  useEffect(() => {
    if (!scheduleReady || previewLoading || previewFetching) return;
    if (!fullPreview?.candidate || !fullPreview?.panel) return;

    setCandidateSubject(fullPreview.candidate.subject);
    setCandidateBody(fullPreview.candidate.body);
    setPanelSubject(fullPreview.panel.subject);
    setPanelBody(fullPreview.panel.body);
    setTemplateNonce((n) => n + 1);
  }, [fullPreview, scheduleReady, previewLoading, previewFetching]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!appId) return;
    if (!scheduledDate || !scheduledTime || !scheduledTimeEnd) {
      toast.error("Set date, start time, and end time for the interview.");
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
    if (!candidateSubject.trim() || !panelSubject.trim() || htmlBodyIsEmpty(candidateBody) || htmlBodyIsEmpty(panelBody)) {
      toast.error("Fill in all email subjects and messages.");
      return;
    }
    if (previewLoading || previewFetching) {
      toast.error("Email preview is still updating. Wait until it shows “Synced”, then send.");
      return;
    }
    const finalInterviewerIds = [...new Set(selectedInterviewerIds.map((id) => id.trim()).filter(Boolean))];
    if (finalInterviewerIds.length === 0) {
      toast.error("Select at least one interviewer.");
      return;
    }
    if (calendarConnectRequired) {
      toast.error("Connect Microsoft Calendar before sending invites.");
      return;
    }
    setSending(true);
    try {
      await apiRequest("POST", `/api/recruitment/applications/${appId}/interview-schedule/send`, {
        pipelineStage,
        round,
        scheduledWallDate: scheduledDate,
        scheduledWallTime: scheduledTime,
        scheduledWallTimeEnd: scheduledTimeEnd,
        ianaTimezone,
        interviewerIds: finalInterviewerIds,
        format,
        location: format === "onsite" ? location : null,
        notes: notes || null,
        candidateSubject,
        candidateBodyHtml: candidateBody,
        panelSubject,
        panelBodyHtml: panelBody,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", appId, "interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications", appId, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      toast.success("Interview scheduled and invites sent!");
      goBack();
    } catch (err: unknown) {
      const msg = parseApiErrorMessage(err);
      if (msg.toLowerCase().includes("calendar") && msg.toLowerCase().includes("connect")) {
        toast.error(msg, {
          action: {
            label: "Connect now",
            onClick: () => {
              window.location.href = calendarConnectUrl(window.location.pathname + window.location.search);
            },
          },
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setSending(false);
    }
  };

  const labelStage = pipelineStage === "screening" ? "Screening" : "Interview";
  const candidateName = appDetail ? `${appDetail.first_name} ${appDetail.last_name}`.trim() : "—";

  if (appLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-5" />
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <a href="/recruitment/jobs" className="hover:text-foreground transition-colors">
              Recruitment
            </a>
            <ChevronRight className="h-3.5 w-3.5" />
            <button type="button" onClick={goBack} className="hover:text-foreground transition-colors">
              {appDetail?.job_title ?? "Job"}
            </button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">{candidateName}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Schedule Interview</span>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {scheduleReady && (
              <Badge variant="outline" className="gap-1 text-xs font-normal">
                <CalendarClock className="h-3 w-3" />
                {labelStage} · Round {round}
              </Badge>
            )}
            <Button
              onClick={handleSend}
              disabled={sending || !composerSynced || calendarConnectRequired}
              className="gap-2"
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              ) : (
                <><Send className="h-4 w-4" /> Send Invites</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Page heading ─────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-6 pt-6 pb-4 space-y-4">
        {calendarConnectRequired && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 text-sm text-amber-950">
              <p className="font-medium">Connect Microsoft Calendar (one-time)</p>
              <p className="text-amber-900/80 mt-0.5">
                Outlook / Teams invites will be created on <strong>your</strong> calendar as the organizer.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-amber-300 bg-white hover:bg-amber-100"
              onClick={() => {
                window.location.href = calendarConnectUrl(window.location.pathname + window.location.search);
              }}
            >
              Connect Microsoft Calendar
            </Button>
          </div>
        )}

        {calendarConnected && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 text-sm text-emerald-950">
              <p className="font-medium">Microsoft Calendar connected</p>
              <p className="text-emerald-900/80 mt-0.5">
                Interview invites are created on your Outlook / Teams calendar. Disconnect to switch accounts or revoke access.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-emerald-300 bg-white hover:bg-emerald-100"
              disabled={disconnectingCalendar}
              onClick={() => void disconnectMicrosoftCalendar()}
            >
              {disconnectingCalendar ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Disconnecting…</>
              ) : (
                <><Unlink className="h-4 w-4" /> Disconnect Microsoft Calendar</>
              )}
            </Button>
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <CalendarClock className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Schedule Interview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {candidateName}
              {appDetail?.job_title && (
                <> &middot; <span className="text-foreground">{appDetail.job_title}</span></>
              )}
              {appDetail?.job_department && (
                <> &middot; {appDetail.job_department}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">

          {/* ── LEFT: Schedule details ─────────────────────────────────── */}
          <div className="space-y-5">

            {/* Stage & Round */}
            <div className="rounded-xl border bg-card p-5 space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarClock className="h-4 w-4 text-orange-500" />
                Interview Details
              </div>

              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Pipeline Stage</Label>
                <RadioGroup
                  value={pipelineStage}
                  onValueChange={(v) => setPipelineStage(v as "screening" | "interview")}
                  className="flex gap-4"
                >
                  {(["screening", "interview"] as const).map((s) => (
                    <label
                      key={s}
                      htmlFor={`ps-${s}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <RadioGroupItem value={s} id={`ps-${s}`} />
                      <span className="text-sm capitalize">{s}</span>
                    </label>
                  ))}
                </RadioGroup>
                {meta && typeof meta.maxRoundThisStage === "number" && meta.maxRoundThisStage > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {meta.maxRoundThisStage} round(s) already scheduled in this stage
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Round</Label>
                <RadioGroup value={String(round)} onValueChange={(v) => setRound(parseInt(v, 10))} className="flex gap-3">
                  {[1, 2, 3].map((r) => (
                    <label key={r} htmlFor={`round-${r}`} className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value={String(r)} id={`round-${r}`} />
                      <span className="text-sm">Round {r}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>

            {/* Date, Time & Timezone */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock className="h-4 w-4 text-blue-500" />
                Date &amp; Time
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">
                    Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Timezone</Label>
                  <Select value={ianaTimezone} onValueChange={setIanaTimezone}>
                    <SelectTrigger className="h-9">
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
                  <Label className="text-xs">
                    From <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">
                    To <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="time"
                    value={scheduledTimeEnd}
                    onChange={(e) => setScheduledTimeEnd(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Calendar invite and emails use this start–end window in the selected timezone.
              </p>
            </div>

            {/* Format & Location */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Building2 className="h-4 w-4 text-emerald-500" />
                Format &amp; Location
              </div>

              <RadioGroup value={format} onValueChange={(v) => setFormat(v as "onsite" | "teams")} className="grid grid-cols-2 gap-2">
                <label
                  htmlFor="fmt-onsite"
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    format === "onsite" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="onsite" id="fmt-onsite" className="sr-only" />
                  <Building2 className={`h-4 w-4 shrink-0 ${format === "onsite" ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium">Onsite</p>
                    <p className="text-xs text-muted-foreground">In-person meeting</p>
                  </div>
                </label>
                <label
                  htmlFor="fmt-teams"
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    format === "teams" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="teams" id="fmt-teams" className="sr-only" />
                  <Video className={`h-4 w-4 shrink-0 ${format === "teams" ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium">MS Teams</p>
                    <p className="text-xs text-muted-foreground">Online meeting</p>
                  </div>
                </label>
              </RadioGroup>

              {format === "onsite" && (
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                    {savedLocations.length > 0 && (
                      <span className="ml-1 text-muted-foreground font-normal">(pick saved or type custom)</span>
                    )}
                  </Label>
                  {savedLocations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {savedLocations.map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          title={loc}
                          onClick={() => setLocation(loc)}
                          className={`max-w-full px-2.5 py-1 rounded-lg text-xs border transition-colors text-left truncate ${
                            location === loc
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 border-border hover:bg-muted text-foreground"
                          }`}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Address on separate lines, then Google Maps link on its own line"
                    className="min-h-[72px] resize-y"
                    maxLength={ONSITE_INTERVIEW_LOCATION_MAX_LENGTH}
                    rows={3}
                  />
                  {savedLocations.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Save default locations in Settings → Onsite interview locations to enable quick selection.
                    </p>
                  )}
                </div>
              )}
              {format === "teams" && (
                <p className="text-xs text-muted-foreground">
                  A Teams meeting link will be created when you click Send.
                </p>
              )}
            </div>

            {/* Interviewers */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="h-4 w-4 text-violet-500" />
                Interviewers <span className="text-destructive text-base leading-none">*</span>
              </div>
              <EmployeeMultiSelect
                value={selectedInterviewerIds}
                onChange={setSelectedInterviewerIds}
                employees={employees}
                placeholder="Select interviewers…"
              />
            </div>

            {/* Notes */}
            <div className="rounded-xl border bg-card p-5 space-y-2">
              <Label className="text-xs text-muted-foreground font-normal">Notes / Agenda (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional information for the candidate or panel…"
                className="resize-none text-sm"
              />
            </div>
          </div>

          {/* ── RIGHT: Email composition ───────────────────────────────── */}
          <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Compose Interview Invites</span>
              {(previewLoading || previewFetching) && scheduleReady && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />
              )}
              {!scheduleReady && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Fill in date, time &amp; interviewers to load templates
                </span>
              )}
              {scheduleReady && (previewLoading || previewFetching) && (
                <span className="ml-auto text-xs text-amber-600">Updating emails…</span>
              )}
              {composerSynced && (
                <span className="ml-auto text-xs text-emerald-600 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                  Synced with schedule details
                </span>
              )}
            </div>

            <div className="flex-1 p-5">
              {!scheduleReady ? (
                <div className="flex flex-col items-center justify-center h-64 text-center gap-3 text-muted-foreground">
                  <CalendarClock className="h-10 w-10 opacity-30" />
                  <div>
                    <p className="text-sm font-medium">Complete the schedule details</p>
                    <p className="text-xs mt-1">Select date, time and at least one interviewer to preview the email templates.</p>
                  </div>
                </div>
              ) : (
                <Tabs defaultValue="candidate" className="flex flex-col h-full">
                  <TabsList className="grid w-full grid-cols-2 shrink-0">
                    <TabsTrigger value="candidate" className="gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Candidate Email
                    </TabsTrigger>
                    <TabsTrigger value="panel" className="gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Panel &amp; Recruiter
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="candidate" className="flex-1 space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-xs">
                        Subject line <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={candidateSubject}
                        onChange={(e) => setCandidateSubject(e.target.value)}
                        placeholder="e.g. Interview Invitation — Round 1"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        Message to candidate <span className="text-destructive">*</span>
                      </Label>
                      <SimpleEmailBodyEditor
                        remountKey={`c-${templateNonce}`}
                        value={candidateBody}
                        onChange={setCandidateBody}
                        placeholder="Write your message to the candidate…"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="panel" className="flex-1 space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-xs">
                        Subject line <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={panelSubject}
                        onChange={(e) => setPanelSubject(e.target.value)}
                        placeholder="e.g. Interview Scheduled: Candidate Name"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        Message to interviewers &amp; recruiter <span className="text-destructive">*</span>
                      </Label>
                      <SimpleEmailBodyEditor
                        remountKey={`p-${templateNonce}`}
                        value={panelBody}
                        onChange={setPanelBody}
                        placeholder="Write your message to the interview panel…"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {composerSynced && (
              <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {format === "teams" && (
                    <span className="flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      Teams meeting link will be injected when you click Send.
                    </span>
                  )}
                </p>
                <Button onClick={handleSend} disabled={sending} className="gap-2">
                  {sending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="h-4 w-4" /> Send Invites</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
