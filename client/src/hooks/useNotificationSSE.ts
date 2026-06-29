import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { invalidateLeaveAndNotifications } from "@/lib/leaveQueryInvalidation";

const NOTIFICATION_QUERY_KEY = ["/api/notifications"];
const MAX_RETRY_DELAY_MS = 30_000;
const INITIAL_RETRY_DELAY_MS = 2_000;

/**
 * Opens a persistent SSE connection to /api/notifications/stream.
 * When the server emits a "refresh" event (e.g. after leave submit/approve/reject),
 * notification + leave + dashboard queries are invalidated so open UIs update without refresh.
 */
export function useNotificationSSE(): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = INITIAL_RETRY_DELAY_MS;
    let active = true;

    const invalidateNotificationsOnly = () =>
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });

    const connect = () => {
      if (!active) return;

      es = new EventSource("/api/notifications/stream", { withCredentials: true });

      es.onopen = () => {
        retryDelay = INITIAL_RETRY_DELAY_MS;
      };

      es.addEventListener("refresh", () => invalidateLeaveAndNotifications());

      es.addEventListener("heartbeat", invalidateNotificationsOnly);

      es.onerror = () => {
        es?.close();
        es = null;
        if (!active) return;
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY_MS);
          connect();
        }, retryDelay);
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      es?.close();
    };
  }, [user?.id]);
}
