import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

/** Shared query key for dashboard + timesheets clock widgets. */
export const QUERY_KEY_ATTENDANCE_TODAY = ["/api/attendance/today"] as const;

/** API may return `{ success, data }` (POST) or raw row / null (GET /today). */
export function unwrapAttendanceResponse(json: unknown): Record<string, unknown> | null {
  if (json == null) return null;
  if (typeof json === "object" && json !== null && "success" in json && (json as { success?: boolean }).success === true && "data" in json) {
    return (json as { data: Record<string, unknown> | null }).data ?? null;
  }
  return json as Record<string, unknown>;
}

export async function postCheckInAndPrimeCache(queryClient: QueryClient) {
  const res = await apiRequest("POST", "/api/attendance/check-in");
  const json = await res.json();
  const row = unwrapAttendanceResponse(json);
  queryClient.setQueryData(QUERY_KEY_ATTENDANCE_TODAY, row);
  void queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/attendance/stats"] });
}

export async function postCheckOutAndPrimeCache(queryClient: QueryClient) {
  const res = await apiRequest("POST", "/api/attendance/check-out");
  const json = await res.json();
  const row = unwrapAttendanceResponse(json);
  queryClient.setQueryData(QUERY_KEY_ATTENDANCE_TODAY, row);
  void queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/attendance/stats"] });
}
