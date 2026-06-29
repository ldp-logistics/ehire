/**
 * Stage history notes for rejection are stored like `Reason: …` plus optional team comment on following lines.
 * Returns the team comment only (not the structured reject_reason column).
 */
export function extractRejectionTeamComment(
  rejectionStageNotes: string | null | undefined,
  rejectReason: string | null | undefined,
): string | null {
  const notes = (rejectionStageNotes ?? "").trim();
  if (!notes) return null;
  const rr = rejectReason?.trim();
  if (rr) {
    const prefix = `Reason: ${rr}`;
    if (notes.startsWith(`${prefix}\n`)) return notes.slice(prefix.length + 1).trim() || null;
    if (notes === prefix) return null;
  }
  const firstLine = notes.split("\n")[0]?.trim() ?? "";
  if (/^reason:/i.test(firstLine)) {
    return notes.split("\n").slice(1).join("\n").trim() || null;
  }
  return notes;
}
