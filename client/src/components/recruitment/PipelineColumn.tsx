import { useDroppable } from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PipelineColumnProps } from "./types";

export function PipelineColumn({
  stage,
  count,
  avgDaysInStage,
  conversionPercent,
  isRejected,
  children,
  droppableId,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[280px] flex h-full min-h-0 flex-col rounded-2xl border transition-shadow",
        isRejected
          ? "bg-red-50/40 dark:bg-red-950/10 border-red-200/50 dark:border-red-800/30"
          : "bg-muted/20 border-border",
        isOver && !isRejected && "ring-2 ring-primary/20 ring-offset-2 ring-offset-background"
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-10 flex-shrink-0 rounded-t-2xl border-b p-3",
          isRejected
            ? "border-red-200/50 bg-red-50/60 dark:bg-red-950/20"
            : "border-border bg-muted/40"
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full flex-shrink-0",
              isRejected ? "bg-red-500" : stage.color
            )}
          />
          <span
            className={cn(
              "font-semibold text-sm truncate",
              isRejected && "text-red-700 dark:text-red-400"
            )}
          >
            {stage.label}
          </span>
          <span
            className={cn(
              "ml-auto text-xs font-medium tabular-nums rounded-full px-2 py-0.5",
              isRejected
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                : "bg-muted text-muted-foreground"
            )}
          >
            {count}
          </span>
        </div>
        {(avgDaysInStage != null || conversionPercent != null) && !isRejected && (
          <p className="text-[11px] text-muted-foreground mt-1 truncate">
            {[avgDaysInStage != null && `${avgDaysInStage}d avg`, conversionPercent != null && `${conversionPercent}% conv`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0 pl-2 pr-3 py-2">
        <div className="space-y-2">{children}</div>
      </ScrollArea>
    </div>
  );
}
