/**
 * Pipeline ordering for recruitment applications (higher = later in funnel).
 * Used to prevent accidental stage regressions past active offer work.
 */
export const PIPELINE_RANK: Record<string, number> = {
  applied: 0,
  longlisted: 1,
  screening: 2,
  shortlisted: 3,
  assessment: 4,
  interview: 5,
  verbally_accepted: 6,
  tentative: 7,
  offer: 8,
  hired: 9,
  rejected: -1,
};

export function stageRank(stage: string | undefined | null): number {
  if (!stage) return 0;
  const r = PIPELINE_RANK[stage];
  return r !== undefined ? r : 0;
}

export type WorkflowFloorResult = {
  floorStage: string | null;
  reasons: string[];
};

/**
 * Derives the minimum pipeline stage implied by backend state (offer row).
 * Does not depend on the current `applications.stage` value (that can be wrong after mistakes).
 */
export function deriveWorkflowFloorStage(input: {
  tentativeStatus: string | null | undefined;
  offerId: string | null | undefined;
  offerStatus: string | null | undefined;
}): WorkflowFloorResult {
  void input.tentativeStatus;
  const reasons: string[] = [];
  const offerStatus = (input.offerStatus || "").toLowerCase();
  const withdrawn = offerStatus === "withdrawn";

  if (input.offerId && !withdrawn) {
    reasons.push("An offer exists for this application (draft through accepted).");
    return { floorStage: "offer", reasons };
  }

  return { floorStage: null, reasons: [] };
}

export function shouldBlockStageRegression(targetStage: string, floorStage: string | null): boolean {
  if (targetStage === "rejected") return false;
  if (!floorStage) return false;
  return stageRank(targetStage) < stageRank(floorStage);
}

export function enrichApplicationWorkflowFields(row: {
  stage: string;
  tentative_status?: string | null;
  offer_id?: string | null;
  offer_status?: string | null;
}) {
  const { floorStage, reasons } = deriveWorkflowFloorStage({
    tentativeStatus: row.tentative_status,
    offerId: row.offer_id,
    offerStatus: row.offer_status,
  });
  const mismatch = !!(floorStage && stageRank(row.stage) < stageRank(floorStage));
  return {
    workflow_floor_stage: floorStage,
    workflow_floor_reasons: reasons,
    workflow_stage_mismatch: mismatch,
  };
}
