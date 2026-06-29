import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

/** API responses use { success, data } — unwrap to the payload. */
export function unwrapApiData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export async function fetchLoanList(url: string): Promise<any[]> {
  const j = await (await apiRequest("GET", url)).json();
  const rows = unwrapApiData<unknown>(j);
  return Array.isArray(rows) ? rows : [];
}

/** Refetch every loans-related query (employee, HR, dashboard, profile). */
export function invalidateLoanQueries(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/loans");
    },
    refetchType: "all",
  });
}
