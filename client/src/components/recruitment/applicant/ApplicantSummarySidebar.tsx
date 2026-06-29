import type { ReactNode } from "react";
import { ArrowRight, StickyNote, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PipelineStepper } from "./PipelineStepper";

/**
 * Minimal left column: identity, pipeline stepper, team score, three actions only.
 */
export function ApplicantSummarySidebar({
  firstName,
  lastName,
  email,
  rating,
  ratingStars,
  stageId,
  rejectReason,
  rejectComment,
  onMoveStage,
  onAddNote,
  onRemoveClick,
  className,
}: {
  firstName: string;
  lastName: string;
  email: string;
  rating: number | null | undefined;
  ratingStars: ReactNode;
  stageId: string;
  rejectReason?: string | null;
  rejectComment?: string | null;
  onMoveStage: () => void;
  onAddNote: () => void;
  onRemoveClick: () => void;
  className?: string;
}) {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
  const score =
    rating != null && rating >= 1 && rating <= 5 ? rating.toFixed(1) : null;

  return (
    <aside className={cn("w-[320px] shrink-0 border-r border-gray-200 bg-white", className)}>
      <div className="p-6">
        {/* 1. Identity */}
        <div className="mb-6 flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="text-sm font-semibold text-gray-700">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-gray-900">
              {firstName} {lastName}
            </p>
            <a
              href={`mailto:${email}`}
              className="mt-0.5 block cursor-pointer truncate text-sm text-gray-500 transition-colors duration-150 hover:text-blue-600"
            >
              {email}
            </a>
          </div>
        </div>

        {/* 2. Pipeline */}
        <div className="mb-6">
          <PipelineStepper currentStageId={stageId} rejectReason={rejectReason} rejectComment={rejectComment} />
        </div>

        {/* 3. Rating */}
        <div className="mb-6 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">{ratingStars}</div>
            {score ? (
              <span className="text-base font-medium tabular-nums text-gray-900">{score}</span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-gray-500">Team score</p>
        </div>

        {/* 4. Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onMoveStage}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-all duration-150 hover:bg-blue-700"
          >
            <ArrowRight className="h-4 w-4" />
            Move to stage
          </button>
          <button
            type="button"
            onClick={onAddNote}
            className="h-10 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition-all duration-150 hover:bg-gray-50"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <StickyNote className="h-4 w-4 text-gray-600" />
              Add note
            </span>
          </button>
          <button
            type="button"
            onClick={onRemoveClick}
            className="h-10 w-full cursor-pointer rounded-lg px-4 text-sm font-medium text-red-600 transition-all duration-150 hover:bg-red-50"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Trash2 className="h-4 w-4" />
              Remove applicant
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
