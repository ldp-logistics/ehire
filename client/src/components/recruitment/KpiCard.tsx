import { cn } from "@/lib/utils";
import type { KpiCardProps } from "./types";

export function KpiCard({ label, value, subtext }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm",
        "min-w-0 flex-1 basis-0"
      )}
    >
      <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5 truncate">
        {value}
      </p>
      {subtext != null && subtext !== "" && (
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtext}</p>
      )}
    </div>
  );
}
