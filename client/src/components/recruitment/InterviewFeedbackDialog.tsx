import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { parseApiError } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Star, Upload, FileText, X, Loader2, Calendar, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTimeDisplay } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InterviewRound {
  id: string;
  application_id: string;
  to_stage: string;
  interview_round?: number | null;
  interview_type?: string | null;
  schedule_format?: string | null;
  scheduled_at?: string | null;
  scheduled_by_name?: string | null;
  feedback?: FeedbackRow[];
}

export interface FeedbackRow {
  id?: string;
  status: "pending" | "draft" | "submitted" | "no_show";
  overall_rating?: number | null;
  overall_comments?: string | null;
  scorecard?: ScorecardItem[];
  test_report_url?: string | null;
  test_report_filename?: string | null;
}

export interface ScorecardItem {
  criterion: string;
  rating: number | null;
  note: string;
}

interface CandidateMeta {
  first_name: string;
  last_name: string;
  resume_url?: string | null;
  resume_filename?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  round: InterviewRound | null;
  candidate: CandidateMeta | null;
  /** existing feedback row for the current user, if any */
  myFeedback?: FeedbackRow | null;
  canRemind: boolean;
}

// ── Default scorecard criteria ────────────────────────────────────────────────

const DEFAULT_CRITERIA: ScorecardItem[] = [
  { criterion: "Interpersonal Skills", rating: null, note: "" },
  { criterion: "Communication", rating: null, note: "" },
  { criterion: "Technical Knowledge", rating: null, note: "" },
  { criterion: "Problem Solving", rating: null, note: "" },
  { criterion: "Culture Fit", rating: null, note: "" },
];

// ── StarRating ────────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  size = 18,
}: {
  value: number | null;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(null)}
          className="focus:outline-none"
        >
          <Star
            style={{ width: size, height: size }}
            className={
              (hover ?? value ?? 0) >= s
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            }
          />
        </button>
      ))}
      {value && (
        <Badge variant="outline" className="ml-2 text-[10px] py-0">
          {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][value]}
        </Badge>
      )}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function InterviewFeedbackDialog({ open, onClose, round, candidate, myFeedback, canRemind }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const initScorecard = (): ScorecardItem[] => {
    if (myFeedback?.scorecard?.length) return myFeedback.scorecard as ScorecardItem[];
    return DEFAULT_CRITERIA.map((c) => ({ ...c }));
  };

  const [overallRating, setOverallRating] = useState<number | null>(myFeedback?.overall_rating ?? null);
  const [overallComments, setOverallComments] = useState(myFeedback?.overall_comments ?? "");
  const [scorecard, setScorecard] = useState<ScorecardItem[]>(initScorecard);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reportFile, setReportFile] = useState<{ name: string; url: string } | null>(
    myFeedback?.test_report_url
      ? { name: myFeedback.test_report_filename ?? "test-report", url: myFeedback.test_report_url }
      : null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Reset form when opening or when server data for this round changes (fixes stale state + empty first paint). */
  useEffect(() => {
    if (!open || !round) return;
    setOverallRating(myFeedback?.overall_rating ?? null);
    setOverallComments(myFeedback?.overall_comments ?? "");
    if (myFeedback?.scorecard?.length) {
      setScorecard(myFeedback.scorecard as ScorecardItem[]);
    } else {
      setScorecard(DEFAULT_CRITERIA.map((c) => ({ ...c })));
    }
    setReportFile(
      myFeedback?.test_report_url
        ? { name: myFeedback.test_report_filename ?? "test-report", url: myFeedback.test_report_url }
        : null,
    );
  }, [open, round?.id, myFeedback?.id, myFeedback?.status, myFeedback?.overall_rating, myFeedback?.overall_comments, myFeedback?.test_report_url]);

  if (!round || !candidate) return null;

  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const isSubmitted = myFeedback?.status === "submitted" || myFeedback?.status === "no_show";
  const stageLabelFb = round.to_stage === "interview" ? "Interview" : "Screening";
  const roundLabelFb = round.interview_round ? `Round ${round.interview_round}` : null;
  const positionHeadline =
    (round.interview_type && String(round.interview_type).trim()) ||
    [stageLabelFb, roundLabelFb].filter(Boolean).join(" · ") ||
    stageLabelFb;

  function updateCriterion(index: number, patch: Partial<ScorecardItem>) {
    setScorecard((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function feedbackSaveErrorMessage(err: unknown): string {
    if (!(err instanceof Error)) return "Could not save feedback.";
    const raw = err.message;
    const brace = raw.indexOf("{");
    if (brace >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(brace)) as unknown;
        return parseApiError(parsed);
      } catch {
        /* fall through */
      }
    }
    return raw || "Could not save feedback.";
  }

  async function save(status: "draft" | "submitted" | "no_show") {
    setSaving(true);
    try {
      await apiRequest("POST", `/api/recruitment/applications/${round!.application_id}/interviews/${round!.id}/feedback`, {
        status,
        overallRating: overallRating ?? null,
        overallComments: overallComments.trim() || null,
        scorecard,
      });
      qc.invalidateQueries({ queryKey: ["/api/recruitment/applications", round!.application_id, "interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      if (status === "draft") {
        toast.success("Draft saved.");
      } else if (status === "no_show") {
        toast.success("Marked as no show.");
        onClose();
      } else {
        toast.success("Feedback submitted.");
        onClose();
      }
    } catch (err: unknown) {
      toast.error(feedbackSaveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/recruitment/applications/${round!.application_id}/interviews/${round!.id}/test-report`,
        { method: "POST", body: fd, credentials: "include" },
      );
      const text = await res.text();
      let json: { filename?: string; url?: string } = {};
      try {
        json = text ? (JSON.parse(text) as { filename?: string; url?: string }) : {};
      } catch {
        json = {};
      }
      if (!res.ok) {
        toast.error(feedbackSaveErrorMessage(new Error(`${res.status}: ${text}`)));
        return;
      }
      setReportFile({ name: json.filename ?? file.name, url: json.url ?? "" });
      qc.invalidateQueries({ queryKey: ["/api/recruitment/applications", round!.application_id, "interviews"] });
      toast.success("Test report attached.");
    } catch (err: unknown) {
      toast.error(feedbackSaveErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const scoreAvg = (() => {
    const rated = scorecard.filter((s) => s.rating != null);
    if (!rated.length) return null;
    return (rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length).toFixed(1);
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showClose={false} className="max-w-5xl w-full h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 flex-row items-center justify-between px-5 py-3 border-b bg-muted/40">
          <DialogTitle className="text-base font-semibold">
            Submit Interview Feedback
          </DialogTitle>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded-full">
              Drafts stay private until you submit — then the panel can read your feedback
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || isSubmitted}
              onClick={() => save("draft")}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Draft
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || isSubmitted}
              onClick={() => save("no_show")}
            >
              Mark as 'No Show'
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || isSubmitted}
              onClick={() => save("submitted")}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Submit Feedback
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: candidate + resume ──────────────────────────────────── */}
          <div className="w-72 shrink-0 border-r flex flex-col overflow-y-auto">
            <div className="p-5 space-y-3">
              {/* Candidate */}
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0 border-2 border-muted">
                  <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                    {candidate.first_name?.[0]}{candidate.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm leading-snug">{candidateName}</p>
                </div>
              </div>

              <Separator />

              {/* Round meta */}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <span className="shrink-0 font-medium text-foreground/80 w-20">Position</span>
                  <span className="text-foreground/70">{positionHeadline}</span>
                </div>
                {round.scheduled_at && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="shrink-0 font-medium text-foreground/80 w-20 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-foreground/70 text-xs">
                      {formatDateTimeDisplay(round.scheduled_at, user?.timeZone ?? null, user?.dateFormat ?? null)}
                    </span>
                  </div>
                )}
                {round.scheduled_by_name && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="shrink-0 font-medium text-foreground/80 w-20">Scheduled</span>
                    <span className="text-foreground/70 text-xs">by {round.scheduled_by_name}</span>
                  </div>
                )}
                {round.schedule_format && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="shrink-0 font-medium text-foreground/80 w-20">Format</span>
                    <Badge variant="secondary" className="text-[10px] uppercase px-1.5">{round.schedule_format}</Badge>
                  </div>
                )}
                {isSubmitted && (
                  <Badge className={myFeedback?.status === "no_show" ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}>
                    {myFeedback?.status === "no_show" ? "No Show" : "Submitted"}
                  </Badge>
                )}
              </div>

              {/* Score summary */}
              {(overallRating || scoreAvg) && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    {overallRating && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Overall</span>
                        <StarRating value={overallRating} onChange={() => {}} size={13} />
                      </div>
                    )}
                    {scoreAvg && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Avg scorecard</span>
                        <span className="font-semibold">{scoreAvg} / 5</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* Resume */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Resume</p>
                {candidate.resume_url ? (
                  <a
                    href={candidate.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    {candidate.resume_filename ?? "View Resume"}
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">No resume uploaded</p>
                )}
              </div>

              {/* Test report */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Test Report</p>
                {reportFile ? (
                  <div className="flex items-center gap-2">
                    <a href={reportFile.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline flex-1 min-w-0">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{reportFile.name}</span>
                    </a>
                  </div>
                ) : null}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1.5 gap-1.5 text-xs w-full"
                  disabled={uploading || isSubmitted}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {reportFile ? "Replace" : "Attach"} Test Report
                </Button>
              </div>
            </div>
          </div>

          {/* Right: feedback tabs ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="scorecard" className="flex flex-col h-full">
              <TabsList className="shrink-0 m-4 mb-0 w-fit">
                <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation Criteria</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
              </TabsList>

              {/* ── Scorecard tab ──────────────────────────────────────── */}
              <TabsContent value="scorecard" className="flex-1 overflow-y-auto m-0 p-4 pt-3 space-y-3">
                {scorecard.map((item, i) => (
                  <div key={item.criterion} className="border border-border rounded-lg p-4 space-y-2.5 bg-card">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="font-medium text-sm">{item.criterion}</p>
                      <div className="flex items-center gap-3">
                        <StarRating
                          value={item.rating}
                          onChange={(v) => updateCriterion(i, { rating: v })}
                        />
                        {item.rating == null && (
                          <span className="text-xs text-muted-foreground italic">Not Assessed</span>
                        )}
                      </div>
                    </div>
                    <Textarea
                      placeholder="Note (optional)"
                      value={item.note}
                      onChange={(e) => updateCriterion(i, { note: e.target.value })}
                      className="text-sm min-h-[56px] resize-none"
                      disabled={isSubmitted}
                    />
                  </div>
                ))}
              </TabsContent>

              {/* ── Evaluation Criteria tab ────────────────────────────── */}
              <TabsContent value="evaluation" className="flex-1 overflow-y-auto m-0 p-4 pt-3 space-y-3">
                <div className="border border-border rounded-lg p-5 space-y-4">
                  <div>
                    <p className="font-medium text-sm mb-1">Overall Rating</p>
                    <p className="text-xs text-muted-foreground mb-3">How would you rate the candidate overall?</p>
                    <StarRating value={overallRating} onChange={setOverallRating} size={22} />
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    {scorecard.map((item, i) => (
                      <div key={item.criterion} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{item.criterion}</p>
                          <div className="flex items-center gap-2">
                            <StarRating
                              value={item.rating}
                              onChange={(v) => updateCriterion(i, { rating: v })}
                            />
                            {item.rating == null && (
                              <span className="text-xs text-muted-foreground italic">Not Assessed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── Comments tab ──────────────────────────────────────── */}
              <TabsContent value="comments" className="flex-1 overflow-y-auto m-0 p-4 pt-3 flex flex-col gap-3">
                <div className="border border-border rounded-lg p-4 flex-1 flex flex-col gap-2">
                  <p className="font-medium text-sm">Overall Comments</p>
                  <p className="text-xs text-muted-foreground">Share any additional observations about the candidate.</p>
                  <Textarea
                    placeholder="Write your overall assessment here…"
                    value={overallComments}
                    onChange={(e) => setOverallComments(e.target.value)}
                    className="flex-1 min-h-[200px] resize-none text-sm"
                    disabled={isSubmitted}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
