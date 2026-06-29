import { Check } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { PIPELINE_MILESTONES, milestoneIndexForStage } from "./pipelineFunnel";

/**
 * Horizontal milestone stepper: Applied → Screening → Interview → Offer → Hired.
 * Active: blue + bold. Completed: muted + check. Future: light gray.
 */
export function PipelineStepper({
  currentStageId,
  rejectReason,
  rejectComment,
}: {
  currentStageId: string;
  /** Structured reason from applications.reject_reason */
  rejectReason?: string | null;
  /** Hiring-team comment (from stage history, excluding duplicated reason line) */
  rejectComment?: string | null;
}) {
  const rejected = currentStageId === "rejected";
  const activeIdx = milestoneIndexForStage(currentStageId);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {PIPELINE_MILESTONES.map((step, i) => {
          const done = !rejected && activeIdx > i;
          const current = !rejected && activeIdx === i;
          const future = !rejected && activeIdx < i;

          return (
            <Fragment key={step.id}>
              <div
                className={cn(
                  "flex shrink-0 cursor-default items-center gap-1.5 transition-all duration-150",
                  current && "font-semibold text-blue-600",
                  done && !current && "text-gray-500",
                  future && "text-gray-300",
                  rejected && "text-gray-300",
                )}
              >
                {done && !rejected && <Check className="h-3.5 w-3.5 shrink-0 text-gray-400" strokeWidth={2.5} aria-hidden />}
                <span>{step.label}</span>
              </div>
              {i < PIPELINE_MILESTONES.length - 1 && (
                <div className="h-[2px] min-w-[12px] flex-1 bg-gray-200 transition-colors duration-150" aria-hidden />
              )}
            </Fragment>
          );
        })}
      </div>
      {rejected && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2.5 text-left dark:border-red-900 dark:bg-red-950/40">
          <p className="text-center text-xs font-semibold text-red-700 dark:text-red-300">Application rejected</p>
          {rejectReason?.trim() ? (
            <p className="text-xs leading-snug text-red-900 dark:text-red-100">
              <span className="font-semibold">Reason:</span> {rejectReason.trim()}
            </p>
          ) : null}
          {rejectComment?.trim() ? (
            <p className="text-xs leading-snug text-red-800/95 dark:text-red-100/90 whitespace-pre-wrap">
              <span className="font-semibold">Comment:</span> {rejectComment.trim()}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
