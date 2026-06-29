import { useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeMultiSelect } from "@/components/EmployeeSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, addMinutes } from "date-fns";
import {
  Globe,
  Clock,
  Video,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Calendar,
} from "lucide-react";

interface EmployeeTz {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
  department: string;
  work_email: string;
  avatar?: string;
  location?: string;
  time_zone: string | null;
}

interface TimezoneStatus {
  teamsConfigured: boolean;
}

interface ScheduledMeeting {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  join_url: string | null;
  attendee_emails: string[];
  created_at: string;
}

const DURATIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

function getLocalHour(tz: string | null, date: Date): number {
  const safeTz = tz?.trim() || "UTC";
  try {
    const str = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      hour: "numeric",
      hour12: false,
    }).format(date);
    return parseInt(str, 10) % 24;
  } catch {
    return date.getUTCHours();
  }
}

function formatLocalTime(tz: string | null, date: Date): string {
  const safeTz = tz?.trim() || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return format(date, "HH:mm:ss");
  }
}

function formatMeetingLocalTime(tz: string | null, date: Date): string {
  const safeTz = tz?.trim() || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return format(date, "EEE, MMM d, h:mm a");
  }
}

function getTzAbbr(tz: string | null): string {
  if (!tz) return "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

function getTzCity(tz: string | null): string {
  if (!tz) return "UTC";
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

type Availability = {
  label: string;
  color: string;
  bg: string;
  dot: string;
  Icon: React.ElementType;
};

function getAvailability(tz: string | null, date: Date): Availability {
  const h = getLocalHour(tz, date);
  if (h >= 9 && h < 18)
    return { label: "Business hours", color: "text-green-700", bg: "bg-green-100 dark:bg-green-900/40", dot: "bg-green-500", Icon: Sun };
  if (h >= 6 && h < 9)
    return { label: "Morning", color: "text-sky-700", bg: "bg-sky-100 dark:bg-sky-900/40", dot: "bg-sky-400", Icon: Sunrise };
  if (h >= 18 && h < 21)
    return { label: "Evening", color: "text-orange-700", bg: "bg-orange-100 dark:bg-orange-900/40", dot: "bg-orange-400", Icon: Sunset };
  return { label: "Night", color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800", dot: "bg-slate-400", Icon: Moon };
}

export default function Timezone() {
  const { user } = useAuth();
  const meetingSearch = useSearch();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Meeting form state
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [agenda, setAgenda] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<ScheduledMeeting | null>(null);

  // Live clock ticker
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery<ScheduledMeeting[]>({
    queryKey: ["/api/timezone/meetings"],
    staleTime: 0,
  });
  const nowMs = now.getTime();
  const upcomingMeetings = meetings.filter((m) => new Date(m.end_at).getTime() > nowMs);

  useEffect(() => {
    const meetingId = new URLSearchParams(meetingSearch || "").get("meeting")?.trim();
    if (!meetingId || meetings.length === 0) return;
    const match = meetings.find((m) => String(m.id) === meetingId);
    if (match) setSelectedMeeting(match);
  }, [meetingSearch, meetings]);

  const { data: employees = [], isLoading: employeesLoading } = useQuery<EmployeeTz[]>({
    queryKey: ["/api/timezone/employees"],
  });

  const { data: status } = useQuery<TimezoneStatus>({
    queryKey: ["/api/timezone/status"],
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEmployees = employees.filter((e) => selected.has(e.id));

  const meetingStart = (() => {
    try {
      return new Date(`${meetingDate}T${meetingTime}:00`);
    } catch {
      return new Date();
    }
  })();
  const meetingEnd = addMinutes(meetingStart, parseInt(duration, 10));

  const handleSchedule = async () => {
    if (!title.trim()) {
      toast.error("Please enter a meeting title");
      return;
    }
    if (!selected.size) {
      toast.error("Please select at least one attendee from the list");
      return;
    }
    setScheduling(true);
    setJoinUrl(null);
    setScheduleError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s for Teams API
    try {
      const res = await fetch("/api/timezone/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          start: meetingStart.toISOString(),
          end: meetingEnd.toISOString(),
          attendeeIds: Array.from(selected),
          body: agenda.trim() || null,
        }),
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }
      const data = await res.json();
      if (data.success) {
        toast.success("Teams meeting created successfully!");
        if (data.joinUrl) setJoinUrl(data.joinUrl);
        queryClient.invalidateQueries({ queryKey: ["/api/timezone/meetings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      } else {
        const msg = data.error || "Failed to schedule meeting";
        setScheduleError(msg);
        toast.error(msg);
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const errMsg = err instanceof Error ? err.message : String(err);
      const isFailedFetch = errMsg === "Failed to fetch" || errMsg.includes("NetworkError");
      const msg = isAbort
        ? "Request timed out. Teams may be slow—please try again."
        : isFailedFetch
          ? "Network error or request timed out. Check your connection and try again."
          : errMsg || "Failed to schedule meeting";
      setScheduleError(msg);
      toast.error(msg);
    } finally {
      setScheduling(false);
    }
  };

  const formatMeetingDuration = (start: string, end: string) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const mins = Math.round((e - s) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  /** Normalize attendee_emails from API (array or Postgres text representation). */
  const getAttendeeList = (m: ScheduledMeeting): string[] => {
    const raw: unknown = m.attendee_emails;
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === "string") {
      if (raw.startsWith("[")) try { return JSON.parse(raw); } catch { /* fallback */ }
      if (raw.startsWith("{")) return raw.replace(/^\{|\}$/g, "").split(",").map((s: string) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
      return raw ? [raw] : [];
    }
    return [];
  };

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100">
            Schedule Meeting
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            View your team's local times and schedule Microsoft Teams meetings across timezones.
          </p>
        </div>
        {status && (
          <Badge
            variant="outline"
            className={
              status.teamsConfigured
                ? "border-green-300 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300"
                : "border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-950 dark:text-orange-300"
            }
          >
            <Video className="h-3 w-3 mr-1.5" />
            {status.teamsConfigured ? "Teams Connected" : "Teams Not Configured"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Scheduled meetings ── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Scheduled meetings
            </h2>
          </div>

          {meetingsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[120px] bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upcomingMeetings.map((meeting) => {
                const startDate = new Date(meeting.start_at);
                const isPast = startDate < now;
                const attendeeList = getAttendeeList(meeting);
                return (
                  <Card
                    key={meeting.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMeeting(meeting)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedMeeting(meeting)}
                    className={`cursor-pointer overflow-hidden border transition-shadow hover:shadow-md ${
                      isPast
                        ? "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 opacity-90"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                            {meeting.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {format(startDate, "EEE, MMM d, yyyy · h:mm a")}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {formatMeetingDuration(meeting.start_at, meeting.end_at)}
                            {attendeeList.length > 0 && (
                              <span className="ml-1.5">
                                · {attendeeList.length} attendee
                                {attendeeList.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </p>
                        </div>
                        {meeting.join_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a
                              href={meeting.join_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Join
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {!meetingsLoading && upcomingMeetings.length === 0 && (
                <div className="md:col-span-2 text-center py-16 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No scheduled meetings yet</p>
                  <p className="text-xs mt-1">Schedule a Teams meeting using the form on the right.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Meeting detail dialog */}
        <Dialog open={!!selectedMeeting} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
          <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
            {selectedMeeting && (
              <>
                <DialogHeader>
                  <DialogTitle className="pr-8">{selectedMeeting.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>
                      {format(new Date(selectedMeeting.start_at), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {format(new Date(selectedMeeting.start_at), "h:mm a")} –{" "}
                      {format(new Date(selectedMeeting.end_at), "h:mm a")}
                      <span className="ml-1.5 text-slate-500">
                        ({formatMeetingDuration(selectedMeeting.start_at, selectedMeeting.end_at)})
                      </span>
                    </span>
                  </div>
                  {selectedMeeting.created_at && (
                    <p className="text-xs text-slate-400">
                      Scheduled {format(new Date(selectedMeeting.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                  {getAttendeeList(selectedMeeting).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Attendees
                      </p>
                      <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                        {getAttendeeList(selectedMeeting).map((email) => (
                          <li key={email} className="truncate">
                            {email}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
                  {selectedMeeting.join_url ? (
                    <Button asChild>
                      <a
                        href={selectedMeeting.join_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2"
                      >
                        <Video className="h-4 w-4" />
                        Join Teams meeting
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-slate-400">No join link available for this meeting.</p>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Right: My clock + Meeting scheduler ── */}
        <div className="space-y-5">
          {/* My current time */}
          <Card className="bg-slate-900 text-white border-0 shadow-lg overflow-hidden">
            <CardContent className="p-6 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 to-violet-900/40 pointer-events-none" />
              <Clock className="h-8 w-8 mx-auto mb-3 text-blue-400 relative" />
              <div className="text-4xl font-mono font-bold tabular-nums tracking-tight relative">
                {formatLocalTime(user?.timeZone ?? null, now)}
              </div>
              <p className="text-blue-300 text-xs uppercase tracking-widest mt-2 relative">
                {user?.timeZone
                  ? `${getTzCity(user.timeZone)} (${getTzAbbr(user.timeZone)})`
                  : "UTC (set your timezone in Settings)"}
              </p>
              <p className="text-slate-500 text-xs mt-3 relative">
                {format(now, "EEEE, MMMM d, yyyy")}
              </p>
            </CardContent>
          </Card>

          {/* Meeting Scheduler */}
          <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Video className="h-4 w-4 text-blue-500" />
                Schedule Teams Meeting
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Attendees — select from dropdown or click cards on the left */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Attendees ({selected.size})
                </Label>
                <div className="mt-1.5">
                  <EmployeeMultiSelect
                    value={Array.from(selected)}
                    onChange={(ids) => setSelected(new Set(ids))}
                    placeholder="Select employees for meeting..."
                    employees={employeesLoading || employees.length === 0 ? undefined : employees}
                    className="w-full"
                  />
                </div>
                {selectedEmployees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedEmployees.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        <span>
                          {e.first_name} {e.last_name}
                        </span>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleSelect(e.id);
                          }}
                          className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <Label
                  htmlFor="mtitle"
                  className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest"
                >
                  Meeting title
                </Label>
                <Input
                  id="mtitle"
                  placeholder="e.g. Sprint planning, 1:1 sync…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label
                    htmlFor="mdate"
                    className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest"
                  >
                    Date
                  </Label>
                  <Input
                    id="mdate"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="mtime"
                    className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest"
                  >
                    Start time
                  </Label>
                  <Input
                    id="mtime"
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Duration
                </Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Attendee time preview */}
              {selectedEmployees.length > 0 && (
                <div>
                  <Label className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Meeting time per attendee
                  </Label>
                  <div className="mt-1.5 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {selectedEmployees.map((e) => {
                      const avail = getAvailability(e.time_zone, meetingStart);
                      return (
                        <div
                          key={e.id}
                          className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 gap-2"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {e.first_name} {e.last_name}
                          </span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${avail.dot}`}
                            />
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              {formatMeetingLocalTime(e.time_zone, meetingStart)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Agenda */}
              <div>
                <Label
                  htmlFor="magenda"
                  className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest"
                >
                  Agenda{" "}
                  <span className="normal-case font-normal text-slate-400">(optional)</span>
                </Label>
                <Textarea
                  id="magenda"
                  placeholder="Meeting agenda or description…"
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  rows={2}
                  className="mt-1.5 resize-none"
                />
              </div>

              {/* Success */}
              {joinUrl && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                      Meeting created!
                    </span>
                  </div>
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 font-medium hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Teams meeting link
                  </a>
                </div>
              )}

              {/* Error */}
              {scheduleError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                      {scheduleError}
                    </p>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSchedule}
                disabled={scheduling || !title.trim() || selected.size === 0}
              >
                {scheduling ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-2" />
                    Scheduling…
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4 mr-2" />
                    Schedule on Teams
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
