/**
 * Five milestone steps for the applicant pipeline UI (Applied → Hired).
 * Maps full ATS stage ids to a milestone index 0–4.
 */
export const PIPELINE_MILESTONES = [
  { id: "applied", label: "Applied" },
  { id: "screening", label: "Screening" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "hired", label: "Hired" },
] as const;

const STAGE_TO_MILESTONE: Record<string, number> = {
  applied: 0,
  longlisted: 1,
  screening: 1,
  shortlisted: 1,
  assessment: 1,
  interview: 2,
  verbally_accepted: 3,
  tentative: 3,
  offer: 3,
  hired: 4,
  rejected: -1,
};

/** Active milestone index 0–4, or -1 if rejected / unknown. */
export function milestoneIndexForStage(stageId: string): number {
  if (stageId === "rejected") return -1;
  const i = STAGE_TO_MILESTONE[stageId];
  return i !== undefined ? i : 0;
}
