import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FileText, Mail, Calendar, ArrowRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeDisplay } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";
import type { CandidateDrawerProps, PipelineCandidate } from "./types";

function ratingBadge(rating: PipelineCandidate["rating"]) {
  if (!rating) return null;
  const map = {
    strong: { label: "Strong", class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40" },
    medium: { label: "Medium", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/40" },
    weak: { label: "Weak", class: "bg-slate-100 text-slate-600 dark:bg-slate-800" },
  };
  const r = map[rating];
  return <Badge variant="secondary" className={cn("text-xs", r.class)}>{r.label}</Badge>;
}

export function CandidateDrawer({
  open,
  onClose,
  candidate,
  stageLabel,
  onMoveStage,
  onScheduleInterview,
  onEmailCandidate,
  onOpenFullDetails,
  onDeleteApplication,
}: CandidateDrawerProps) {
  const { user } = useAuth();
  if (!candidate) return null;

  const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || "—";
  const initials = (candidate.first_name?.[0] ?? "") + (candidate.last_name?.[0] ?? "") || "?";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] sm:w-[420px] flex flex-col p-0 gap-0 bg-[#F8FAFC] dark:bg-background"
      >
        <SheetHeader className="p-4 pb-2 border-b border-border/60 flex-shrink-0">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 rounded-xl flex-shrink-0">
              <AvatarFallback className="rounded-xl text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold truncate">{name}</SheetTitle>
              <p className="text-sm text-muted-foreground truncate mt-0.5">{candidate.job_title}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {ratingBadge(candidate.rating)}
                {stageLabel && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {stageLabel}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-10 px-4 gap-6 flex-shrink-0">
            <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              Overview
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              Activity
            </TabsTrigger>
            <TabsTrigger value="email" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              Email
            </TabsTrigger>
            <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              Notes
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TabsContent value="overview" className="mt-0 p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Contact</p>
                <a
                  href={`mailto:${candidate.candidate_email}`}
                  className="text-sm text-primary hover:underline flex items-center gap-2"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {candidate.candidate_email}
                </a>
              </div>
              {candidate.current_company && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {candidate.current_company}
                  {candidate.experience_years != null && ` · ${candidate.experience_years}y`}
                </div>
              )}
              {(candidate.resume_url || candidate.has_resume) && (
                <div className="flex items-center gap-3">
                  <a
                    href={candidate.resume_url || `/api/recruitment/candidates/${candidate.candidate_id}/resume`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      const url = candidate.resume_url || `/api/recruitment/candidates/${candidate.candidate_id}/resume`;
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    View CV
                  </a>
                </div>
              )}
              {onDeleteApplication && (
                <div className="pt-2 border-t border-border/60">
                  <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDeleteApplication}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Remove from pipeline
                  </Button>
                </div>
              )}
              {(candidate.skills?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills!.map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {candidate.assigned_recruiter && (
                <p className="text-xs text-muted-foreground">
                  Assigned: {candidate.assigned_recruiter.name}
                </p>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Stage</p>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 rounded-xl" onClick={onMoveStage}>
                  <ArrowRight className="h-3.5 w-3.5" />
                  Move stage
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="activity" className="mt-0 p-4">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Applied</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.applied_at
                        ? formatDateTimeDisplay(candidate.applied_at, user?.timeZone ?? null, user?.dateFormat ?? null)
                        : "—"}
                    </p>
                  </div>
                </div>
                {candidate.stage_updated_at && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Stage updated</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeDisplay(candidate.stage_updated_at, user?.timeZone ?? null, user?.dateFormat ?? null)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="email" className="mt-0 p-4">
              <p className="text-sm text-muted-foreground">Email history will appear here.</p>
            </TabsContent>
            <TabsContent value="notes" className="mt-0 p-4">
              <p className="text-sm text-muted-foreground">Notes will appear here.</p>
            </TabsContent>
          </div>
        </Tabs>

        <div className="p-4 border-t border-border/60 flex flex-wrap gap-2 flex-shrink-0 bg-background/80">
          <Button size="sm" className="rounded-xl gap-2 flex-1 sm:flex-none" onClick={onMoveStage}>
            <ArrowRight className="h-3.5 w-3.5" />
            Move stage
          </Button>
          {onScheduleInterview && (
            <Button size="sm" variant="outline" className="rounded-xl gap-2" onClick={onScheduleInterview}>
              <Calendar className="h-3.5 w-3.5" />
              Schedule
            </Button>
          )}
          {onEmailCandidate && (
            <Button size="sm" variant="outline" className="rounded-xl gap-2" onClick={onEmailCandidate}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </Button>
          )}
          {onOpenFullDetails && (
            <Button size="sm" variant="ghost" className="rounded-xl gap-2 text-muted-foreground" onClick={onOpenFullDetails}>
              Full details
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
