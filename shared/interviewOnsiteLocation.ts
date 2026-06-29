/** Max characters per saved or scheduled onsite interview location (address + optional Maps URL). */
export const ONSITE_INTERVIEW_LOCATION_MAX_LENGTH = 500;

/** Max number of saved default locations in org settings. */
export const ONSITE_INTERVIEW_LOCATIONS_MAX_COUNT = 20;

export function trimOnsiteInterviewLocation(value: string): string {
  return value.trim().slice(0, ONSITE_INTERVIEW_LOCATION_MAX_LENGTH);
}
