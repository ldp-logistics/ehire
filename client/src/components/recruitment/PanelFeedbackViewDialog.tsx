import { useMemo, useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Star, FileText, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScorecardItem } from "./InterviewFeedbackDialog";

export type PanelFeedbackRow = {
  id?: string;
  reviewer_employee_id?: string | null;
  reviewer_name?: string | null;
  status: "pending" | "draft" | "submitted" | "no_show";
  overall_rating?: number | null;
  overall_comments?: string | null;
  scorecard?: ScorecardItem[] | unknown[];
  test_report_url?: string | null;
  test_report_filename?: string | null;
  submitted_at?: string | null;
};

function ReadOnlyStars({ value, size = 16 }: { value: number | null | undefined; size?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          style={{ width: size, height: size }}
          className={s <= v ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25"}
        />
      ))}
    </div>
  );
}

function scorecardAvg(scorecard: ScorecardItem[] | undefined): string | null {
  const rated = (scorecard ?? []).filter((s) => s.rating != null);
  if (!rated.length) return null;
  return (rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length).toFixed(1);
}

function FeedbackDetail({ row, isMe }: { row: PanelFeedbackRow; isMe: boolean }) {
  const scorecard = (row.scorecard ?? []) as ScorecardItem[];
  const avg = scorecardAvg(scorecard);
  const isNoShow = row.status === "no_show";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isNoShow ? (
          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">No Show</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Submitted</Badge>
        )}
        {isMe && (
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">You</Badge>
        )}
        {row.submitted_at && (
          <span className="text-[11px] text-muted-foreground">
            {new Date(row.submitted_at).toLocaleString()}
          </span>
        )}
      </div>

      {isNoShow ? (
        <p className="text-sm text-muted-foreground">This interviewer marked the candidate as a no-show for this round.</p>
      ) : (
        <>
          {row.overall_rating != null && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overall rating</p>
              <ReadOnlyStars value={row.overall_rating} size={18} />
            </div>
          )}

          {scorecard.length > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scorecard</p>
                {avg && <span className="text-xs font-semibold text-foreground">Avg {avg} / 5</span>}
              </div>
              <div className="space-y-2">
                {scorecard.map((item) => (
                  <div key={item.criterion} className="rounded-md bg-muted/30 px-3 py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.criterion}</span>
                      {item.rating != null ? (
                        <ReadOnlyStars value={item.rating} size={14} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">Not assessed</span>
                      )}
                    </div>
                    {item.note?.trim() && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{item.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {row.overall_comments?.trim() && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{row.overall_comments}</p>
            </div>
          )}

          {row.test_report_url && (
            <a
              href={row.test_report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4 shrink-0" />
              {row.test_report_filename ?? "View test report"}
            </a>
          )}

          {!row.overall_rating && !scorecard.some((s) => s.rating != null) && !row.overall_comments?.trim() && (
            <p className="text-sm text-muted-foreground">No detailed ratings or comments were provided.</p>
          )}
        </>
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  candidateName: string;
  roundLabel: string;
  feedback: PanelFeedbackRow[];
  myEmployeeId?: string | null;
  interviewerNames: Map<string, string>;
};

export function PanelFeedbackViewDialog({
  open,
  onClose,
  candidateName,
  roundLabel,
  feedback,
  myEmployeeId,
  interviewerNames,
}: Props) {
  const visible = useMemo(
    () => feedback.filter((f) => f.status === "submitted" || f.status === "no_show"),
    [feedback],
  );

  const rowKey = (row: PanelFeedbackRow) =>
    String(row.reviewer_employee_id ?? row.reviewer_name ?? row.id ?? "");

  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) setActiveKey(null);
  }, [open, roundLabel]);

  const activeRow = useMemo(() => {
    if (!visible.length) return null;
    const key = activeKey ?? rowKey(visible[0]);
    return visible.find((f) => rowKey(f) === key) ?? visible[0];
  }, [visible, activeKey]);

  function displayName(row: PanelFeedbackRow): string {
    if (row.reviewer_name?.trim()) return row.reviewer_name.trim();
    if (row.reviewer_employee_id) {
      return interviewerNames.get(row.reviewer_employee_id) ?? "Interviewer";
    }
    return "Interviewer";
  }

  function initials(name: string): string {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showClose={false} className="max-w-4xl w-full h-[85vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 flex-row items-center justify-between px-5 py-3 border-b bg-muted/40">
          <div>
            <DialogTitle className="text-base font-semibold">Panel feedback</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {candidateName} · {roundLabel}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground p-8">
            <User className="h-8 w-8 opacity-30" />
            <p className="text-sm">No submitted panel feedback yet.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-56 shrink-0 border-r overflow-y-auto bg-muted/20">
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Interviewers ({visible.length})
              </p>
              <div className="space-y-0.5 px-2 pb-3">
                {visible.map((row) => {
                  const name = displayName(row);
                  const key = rowKey(row);
                  const isMe = !!(myEmployeeId && row.reviewer_employee_id && String(row.reviewer_employee_id) === String(myEmployeeId));
                  const selected = activeRow ? rowKey(activeRow) === key : false;
                  return (
                    <button
                      key={row.id ?? key}
                      type="button"
                      onClick={() => setActiveKey(key)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                        selected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/60 border border-transparent",
                      )}
                    >
                      <Avatar className="h-8 w-8 shrink-0 border border-muted">
                        {row.reviewer_employee_id ? (
                          <AvatarImage src={`/api/employees/${row.reviewer_employee_id}/avatar`} alt="" className="object-cover" />
                        ) : null}
                        <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">{initials(name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {row.status === "no_show" ? "No show" : row.overall_rating ? `${row.overall_rating}/5` : "Submitted"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {activeRow ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="h-10 w-10 border border-muted">
                      {activeRow.reviewer_employee_id ? (
                        <AvatarImage src={`/api/employees/${activeRow.reviewer_employee_id}/avatar`} alt="" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                        {initials(displayName(activeRow))}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm">{displayName(activeRow)}</p>
                      <p className="text-xs text-muted-foreground">Interview feedback</p>
                    </div>
                  </div>
                  <Separator className="mb-4" />
                  <FeedbackDetail
                    row={activeRow}
                    isMe={!!(myEmployeeId && activeRow.reviewer_employee_id && String(activeRow.reviewer_employee_id) === String(myEmployeeId))}
                  />
                </>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
