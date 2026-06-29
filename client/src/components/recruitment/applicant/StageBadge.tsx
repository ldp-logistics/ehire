import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const COLOR: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
  longlisted: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-800",
  screening: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800",
  shortlisted: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-200 dark:border-cyan-800",
  assessment: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
  interview: "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800",
  verbally_accepted: "bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-800",
  tentative: "bg-yellow-100 text-yellow-900 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-800",
  offer: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800",
  hired: "bg-green-100 text-green-900 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-800",
  rejected: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800",
};

const LABELS: Record<string, string> = {
  applied: "Applied",
  longlisted: "Longlisted",
  screening: "Screening",
  shortlisted: "Shortlisted",
  assessment: "Assessment",
  interview: "Interview",
  verbally_accepted: "Verbally Accepted",
  tentative: "Tentative",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export function ApplicantStageBadge({ stageId, className }: { stageId: string; className?: string }) {
  const label = LABELS[stageId] ?? stageId.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={cn("rounded-lg px-2.5 py-0.5 text-xs font-semibold shadow-sm", COLOR[stageId] ?? "", className)}>
      {label}
    </Badge>
  );
}
