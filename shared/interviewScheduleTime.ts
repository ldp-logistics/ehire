/** Default end time (HH:mm) = start + durationMinutes. */
export function defaultInterviewEndTime(startTime: string, durationMinutes = 60): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(startTime.trim());
  if (!match) return "";
  const total = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + durationMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function interviewEndTimeAfterStart(start: string, end: string): boolean {
  return end.trim() > start.trim();
}

const DEFAULT_INTERVIEW_DURATION_MS = 60 * 60 * 1000;

/** UTC instant when the interview round is considered finished. */
export function interviewMeetingEndInstant(
  scheduledAt: string | Date,
  scheduledAtEnd?: string | Date | null,
): Date {
  if (scheduledAtEnd) {
    const end = new Date(scheduledAtEnd);
    if (!Number.isNaN(end.getTime())) return end;
  }
  const start = new Date(scheduledAt);
  return new Date(start.getTime() + DEFAULT_INTERVIEW_DURATION_MS);
}

export function interviewMeetingHasEnded(
  scheduledAt: string | Date | null | undefined,
  scheduledAtEnd?: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!scheduledAt) return false;
  return interviewMeetingEndInstant(scheduledAt, scheduledAtEnd).getTime() <= now.getTime();
}
