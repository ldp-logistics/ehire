import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Calendar, ArrowRight, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeAppliedDate } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";
import type { CandidateCardProps, PipelineCandidate } from "./types";

function ratingBadge(rating: PipelineCandidate["rating"]) {
  if (!rating) return null;
  const map = {
    strong: { label: "Strong", class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    medium: { label: "Medium", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    weak: { label: "Weak", class: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  };
  const r = map[rating];
  return <Badge variant="secondary" className={cn("text-[10px] font-medium", r.class)}>{r.label}</Badge>;
}

export function CandidateCard({
  candidate,
  isSelected,
  onClick,
  onMove,
  onView,
  onEmail,
  onSchedule,
  onDelete,
  children,
}: CandidateCardProps) {
  const { user } = useAuth();
  const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || "—";
  const initials = (candidate.first_name?.[0] ?? "") + (candidate.last_name?.[0] ?? "") || "?";
  const skills = candidate.skills ?? [];
  const showSkills = skills.slice(0, 3);
  const overflowCount = skills.length > 3 ? skills.length - 3 : 0;
  const source = candidate.source ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "group rounded-xl border bg-card p-4 pr-5 shadow-sm transition-shadow text-left overflow-visible",
        "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1",
        isSelected && "ring-2 ring-primary/40 ring-offset-1"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 rounded-lg flex-shrink-0">
          <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{name}</span>
            {ratingBadge(candidate.rating)}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{candidate.job_title}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {candidate.experience_years != null && <span>{candidate.experience_years}y</span>}
        {candidate.location && <span>· {candidate.location}</span>}
        {source && <span>· {source.replace(/_/g, " ")}</span>}
      </div>
      {showSkills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {showSkills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="text-[10px] text-muted-foreground">+{overflowCount}</span>
          )}
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {candidate.assigned_recruiter && (
            <Avatar className="h-6 w-6 rounded-md flex-shrink-0">
              <AvatarFallback className="rounded-md text-[9px]">
                {candidate.assigned_recruiter.initials ?? candidate.assigned_recruiter.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="text-[11px] text-muted-foreground truncate">
            {formatRelativeAppliedDate(candidate.applied_at, user?.timeZone ?? null, user?.dateFormat ?? null)}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onView && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onView(); }}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          {onEmail && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEmail(); }}>
              <Mail className="h-3.5 w-3.5" />
            </Button>
          )}
          {onSchedule && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
              <Calendar className="h-3.5 w-3.5" />
            </Button>
          )}
          {onMove && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onMove(); }}>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
