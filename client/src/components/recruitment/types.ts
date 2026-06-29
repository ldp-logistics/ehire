/**
 * Shared types for recruitment pipeline components.
 * Aligns with API/AppRow where applicable; optional fields for future (rating, skills, recruiter).
 */

export interface PipelineStage {
  id: string;
  label: string;
  color: string;
}

export interface PipelineCandidate {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: string;
  first_name: string;
  last_name: string;
  candidate_email: string;
  current_company: string | null;
  experience_years: number | null;
  job_title: string;
  job_department: string;
  applied_at: string;
  stage_updated_at: string | null;
  resume_url?: string | null;
  /** True when list endpoint omits resume blob; use for View/Download visibility */
  has_resume?: boolean;
  source?: string | null;
  /** Optional: from candidate or future API */
  rating?: "strong" | "medium" | "weak" | null;
  skills?: string[];
  location?: string | null;
  assigned_recruiter?: { name: string; initials?: string } | null;
}

export interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
}

export interface FilterBarProps {
  jobFilterValue: string;
  onJobFilterChange: (value: string) => void;
  jobOptions?: { value: string; label: string }[];
  jobFilterOptions?: { value: string; label: string }[];
  onAdvancedFiltersClick: () => void;
  view?: "list";
  onViewChange?: (view: "list") => void;
  selectedCount?: number;
  bulkActions?: React.ReactNode;
}

export interface PipelineColumnProps {
  stage: PipelineStage;
  count: number;
  avgDaysInStage?: number | null;
  conversionPercent?: number | null;
  isRejected?: boolean;
  children: React.ReactNode;
  droppableId: string;
}

export interface CandidateCardProps {
  candidate: PipelineCandidate;
  stageId: string;
  isSelected?: boolean;
  onClick: () => void;
  onMove?: () => void;
  onView?: () => void;
  onEmail?: () => void;
  onSchedule?: () => void;
  /** Remove application from pipeline (delete application) */
  onDelete?: () => void;
  /** When true, card is wrapped by parent in DraggableCard */
  isDraggable?: boolean;
  children?: React.ReactNode;
}

export interface CandidateDrawerProps {
  open: boolean;
  onClose: () => void;
  candidate: PipelineCandidate | null;
  stageLabel?: string;
  onMoveStage: () => void;
  onScheduleInterview?: () => void;
  onEmailCandidate?: () => void;
  onOpenFullDetails?: () => void;
  /** Remove this application from pipeline (delete application) */
  onDeleteApplication?: () => void;
}

/** Alias for PipelineCandidate when used as application row in pipeline */
export type PipelineApplication = PipelineCandidate;
