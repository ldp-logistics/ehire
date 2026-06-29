/**
 * In-app paths for notification centre, emails, and toasts.
 * Keep in sync with client route + query-param handlers (Recruitment, Leave, etc.).
 */

export function recruitmentApplicantDeepLink(
  jobId: string | null | undefined,
  applicationId: string | null | undefined,
): string {
  const job = String(jobId ?? "").trim();
  const app = String(applicationId ?? "").trim();
  if (!job || !app) return "/recruitment/jobs";
  const q = new URLSearchParams({ job, applicant: app });
  return `/recruitment/jobs?${q.toString()}`;
}

export function leaveApprovalDeepLink(leaveRequestId: string | null | undefined): string {
  const id = String(leaveRequestId ?? "").trim();
  if (!id) return "/leave/admin";
  return `/leave/admin?requestId=${encodeURIComponent(id)}`;
}

export function leaveEmployeeRequestDeepLink(leaveRequestId: string | null | undefined): string {
  const id = String(leaveRequestId ?? "").trim();
  if (!id) return "/leave/employee";
  return `/leave/employee?requestId=${encodeURIComponent(id)}`;
}

export function offboardingEmployeeDeepLink(employeeId: string | null | undefined): string {
  const id = String(employeeId ?? "").trim();
  if (!id) return "/offboarding";
  return `/offboarding?employeeId=${encodeURIComponent(id)}`;
}

export function onboardingRecordDeepLink(recordId: string | null | undefined): string {
  const id = String(recordId ?? "").trim();
  if (!id) return "/onboarding";
  return `/onboarding?recordId=${encodeURIComponent(id)}`;
}

export function changeRequestDeepLink(requestId: string | null | undefined): string {
  const id = String(requestId ?? "").trim();
  if (!id) return "/change-requests";
  return `/change-requests?request=${encodeURIComponent(id)}`;
}

export function employeeProfileTabLink(
  employeeId: string | null | undefined,
  tab: string = "overview",
): string {
  const id = String(employeeId ?? "").trim();
  if (!id) return "/employees";
  return `/employees/${encodeURIComponent(id)}?tab=${encodeURIComponent(tab)}`;
}

export function feedPostDeepLink(postId: string | null | undefined): string {
  const id = String(postId ?? "").trim();
  if (!id) return "/news";
  return `/news?post=${encodeURIComponent(id)}`;
}

export function timezoneMeetingDeepLink(meetingId: string | null | undefined): string {
  const id = String(meetingId ?? "").trim();
  if (!id) return "/timezones";
  return `/timezones?meeting=${encodeURIComponent(id)}`;
}

export function itSupportTicketDeepLink(ticketId: string | null | undefined): string {
  const id = String(ticketId ?? "").trim();
  if (!id) return "/it-support";
  return `/it-support?ticket=${encodeURIComponent(id)}`;
}

export function taskDetailDeepLink(taskId: string | null | undefined): string {
  const id = String(taskId ?? "").trim();
  if (!id) return "/tasks";
  return `/tasks?task=${encodeURIComponent(id)}`;
}

/** Legacy /recruitment?job=… — redirect target for RecruitmentHome. */
export function isRecruitmentPipelineSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return !!(params.get("job")?.trim() || params.get("applicant")?.trim());
}

export function recruitmentPipelineSearchToJobsPath(search: string): string {
  const q = (search.startsWith("?") ? search.slice(1) : search).trim();
  return `/recruitment/jobs${q ? `?${q}` : ""}`;
}
