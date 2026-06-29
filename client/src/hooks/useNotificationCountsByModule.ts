import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNotificationStore } from "@/store/useNotificationStore";
import { apiRequest } from "@/lib/queryClient";
import type { ApiNotification, ApiNotificationsResponse } from "@/types/notification";

/** Map notification module/type/link to sidebar path for badge counts */
function getPathForNotification(n: { module: string; type: string; link: string }): string | null {
  const mod = (n.module || "").toLowerCase();
  const type = (n.type || "").toLowerCase();
  const link = (n.link || "").toLowerCase();
  if (mod === "leave" || link.startsWith("/leave")) return "/leave";
  if (mod === "company feed" || type === "feed_post" || link.startsWith("/news")) return "/news";
  if (mod === "profile" || type === "change_request") return "/change-requests";
  if (mod === "onboarding") return "/onboarding";
  if (mod === "recruitment") return "/recruitment";
  if (mod === "offboarding") return "/offboarding";
  if (mod === "people") return "/employees";
  if (type === "ticket" || mod === "it support") return "/it-support";
  return null;
}

/**
 * Returns unread notification counts keyed by sidebar href (e.g. { "/leave": 2, "/onboarding": 1 }).
 * Uses the same API query as NotificationDropdown so data is shared.
 */
export function useNotificationCountsByModule(): Record<string, number> {
  const isRead = useNotificationStore((s) => s.isRead);
  const clearedNotificationIds = useNotificationStore((s) => s.clearedNotificationIds);
  const localNotifications = useNotificationStore((s) => s.localNotifications);

  const { data } = useQuery<ApiNotificationsResponse>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return useMemo(() => {
    const typeToModule: Record<string, string> = {
      onboarding: "Onboarding",
      ticket: "IT Support",
      leave: "Leave",
      change_request: "Profile",
      tentative: "Recruitment",
      offboarding: "Offboarding",
      recruitment: "Recruitment",
      probation_reminder: "People",
    };
    const fromApi = (data?.notifications ?? []).map((n) => ({
      id: n.id,
      module: n.module,
      type: n.type,
      link: n.link,
    }));
    const fromLocal = localNotifications.map((n) => ({
      id: n.id,
      module: n.module || typeToModule[n.type] || "General",
      type: n.type,
      link: n.link || "#",
    }));
    const combined = [...fromApi, ...fromLocal];
    const counts: Record<string, number> = {};
    for (const n of combined) {
      if (isRead(n.id) || clearedNotificationIds.includes(n.id)) continue;
      const path = getPathForNotification(n);
      if (path) {
        counts[path] = (counts[path] ?? 0) + 1;
      }
    }
    return counts;
  }, [data?.notifications, localNotifications, isRead, clearedNotificationIds]);
}
