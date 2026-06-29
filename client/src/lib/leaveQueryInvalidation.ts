import type { Query, QueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

function isRecruitmentQuery(query: Query): boolean {
  const k = query.queryKey;
  if (!Array.isArray(k) || k.length === 0) return false;
  const first = k[0];
  return typeof first === "string" && first.startsWith("/api/recruitment");
}

/**
 * Invalidate leave + notification queries after submit, approve, reject, cancel, or SSE refresh.
 * Query keys use full path strings (e.g. "/api/leave/my-requests") — partial "/api/leave" does NOT match.
 */
export function invalidateLeaveAndNotifications(qc: QueryClient = queryClient): void {
  const keys: (string | readonly unknown[])[] = [
    ["/api/notifications"],
    ["/api/leave/pending-approvals"],
    ["/api/leave/stats"],
    ["/api/leave/requests"],
    ["/api/leave/request"],
    ["/api/leave/calendar"],
    ["/api/leave/my-requests"],
    ["/api/leave/employee"],
    ["/api/leave/balances"],
    ["/api/leave/all-balances"],
    ["/api/leave/types-for-employee"],
    ["/api/dashboard"],
  ];
  for (const queryKey of keys) {
    void qc.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
  }
  void qc.invalidateQueries({ predicate: isRecruitmentQuery });
}
