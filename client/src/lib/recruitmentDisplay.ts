/** e.g. `Finance (Junior Accountant)` — department with job title for talent pool / applicant lists. */
export function formatDepartmentWithJob(
  department?: string | null,
  jobTitle?: string | null,
): string | null {
  const dept = department?.trim() ?? "";
  const title = jobTitle?.trim() ?? "";
  if (dept && title) return `${dept} (${title})`;
  if (title) return title;
  if (dept) return dept;
  return null;
}
