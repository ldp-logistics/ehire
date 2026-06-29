import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/useNotificationStore";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Laptop,
  DollarSign,
  Trophy,
  UserPlus,
  User,
  ShieldCheck,
  Briefcase,
  UserMinus,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useMemo, useEffect, useRef, useState } from "react";
import type { ApiNotification, ApiNotificationsResponse } from "@/types/notification";
import { formatDateTimeDisplay } from "@/lib/dateUtils";

export type { ApiNotification } from "@/types/notification";

const iconMap: Record<string, typeof Bell> = {
  leave: Calendar,
  change_request: User,
  onboarding: UserPlus,
  tentative: Briefcase,
  offboarding: UserMinus,
  recruitment: Briefcase,
  offer_approval_pending: FileText,
  offer_approved_ready: FileText,
  probation_reminder: AlertTriangle,
  ticket: Laptop,
  payroll: DollarSign,
  kudos: Trophy,
  compliance: ShieldCheck,
};

function formatTimeAgo(dateStr: string, tz?: string | null, df?: string | null): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateTimeDisplay(dateStr, tz ?? null, df ?? null);
}

function NotificationDropdown() {
  const { user } = useAuth();
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const isRead = useNotificationStore((s) => s.isRead);
  const clearNotification = useNotificationStore((s) => s.clearNotification);
  const clearAllNotifications = useNotificationStore((s) => s.clearAllNotifications);
  const isCleared = useNotificationStore((s) => s.isCleared);
  const clearedNotificationIds = useNotificationStore((s) => s.clearedNotificationIds);
  const localNotifications = useNotificationStore((s) => s.localNotifications);

  const { data, isLoading } = useQuery<ApiNotificationsResponse>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const apiList = data?.notifications ?? [];
  const role = (user?.role || "employee").toString().toLowerCase();

  const merged = useMemo(() => {
    const fromApi: Array<{ id: string; type: string; module: string; title: string; message: string; link: string; createdAt: string }> = apiList.map((n) => ({
      id: n.id,
      type: n.type,
      module: n.module,
      title: n.title,
      message: n.message,
      link: n.link,
      createdAt: n.createdAt,
    }));
    const typeToModule: Record<string, string> = { onboarding: "Onboarding", ticket: "IT Support", leave: "Leave", change_request: "Profile" };
    const fromLocal = localNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      module: n.module || typeToModule[n.type] || "General",
      title: n.title,
      message: n.message,
      link: n.link || "#",
      createdAt: n.createdAt,
    }));
    const combined = [...fromApi, ...fromLocal];
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return combined;
  }, [apiList, localNotifications]);

  const visible = useMemo(
    () => merged.filter((n) => !clearedNotificationIds.includes(n.id)),
    [merged, clearedNotificationIds]
  );

  const unreadCount = useMemo(
    () => visible.filter((n) => !isRead(n.id)).length,
    [visible, isRead]
  );

  const hasShakenRef = useRef(false);
  const [bellShake, setBellShake] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const POPOVER_DISMISSED_KEY = "notification-popover-dismissed";

  // Show notification popover when user has unread items (once per session)
  useEffect(() => {
    if (isLoading || !data || unreadCount === 0) return;
    try {
      if (sessionStorage.getItem(POPOVER_DISMISSED_KEY)) return;
      // Short delay so layout is stable before the nudge
      const t = setTimeout(() => setPopoverOpen(true), 800);
      return () => clearTimeout(t);
    } catch {
      /* ignore */
    }
  }, [isLoading, data, unreadCount]);

  const dismissPopover = (openDropdown = false) => {
    try {
      sessionStorage.setItem(POPOVER_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setPopoverOpen(false);
    if (openDropdown) setDropdownOpen(true);
  };

  // One-time gentle bell shake when unread notifications appear (draw attention)
  useEffect(() => {
    if (unreadCount === 0) return;
    if (hasShakenRef.current) return;
    hasShakenRef.current = true;
    setBellShake(true);
    const t = setTimeout(() => setBellShake(false), 600);
    return () => clearTimeout(t);
  }, [unreadCount]);

  const handleMarkAllRead = () => {
    markAllAsRead(visible.map((n) => n.id));
  };

  const handleClearAll = () => {
    clearAllNotifications(visible.map((n) => n.id));
  };

  return (
    <div className="relative inline-flex">
      <Popover open={popoverOpen} onOpenChange={(open) => { if (!open) dismissPopover(false); }}>
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <PopoverAnchor asChild>
            <span className="inline-flex">
              <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "relative text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-shadow",
              unreadCount > 0 && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
            )}
          >
            <Bell
              className={cn(
                "h-5 w-5",
                bellShake && "notification-bell-shake"
              )}
            />
            {unreadCount > 0 && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-destructive-foreground bg-destructive rounded-full border-2 border-background",
                  "notification-badge-pulse"
                )}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
            </span>
          </PopoverAnchor>
        <DropdownMenuContent align="end" className="w-[400px] p-0" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
            {visible.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {visible.map((n) => {
                const Icon = iconMap[n.type] || Bell;
                const read = isRead(n.id);
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group relative",
                      !read && "bg-primary/5"
                    )}
                  >
                    <Link
                      href={n.link}
                      className="flex flex-1 min-w-0 gap-3 cursor-pointer"
                      onClick={() => markAsRead(n.id)}
                    >
                      <div
                        className={cn(
                          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                          !read ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              !read && "text-foreground"
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0">
                            {n.module}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimeAgo(n.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                        </p>
                      </div>
                      {!read && (
                        <div className="shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                      )}
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearNotification(n.id);
                      }}
                      className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                      aria-label="Clear notification"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {visible.length > 0 && (
          <div className="p-2 border-t">
            <Link href="/settings">
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2"
              >
                Settings
              </button>
            </Link>
          </div>
        )}
      </DropdownMenuContent>
        </DropdownMenu>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          className="w-80 p-0 border-primary/20 shadow-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">
                  {unreadCount === 1 ? "1 unread notification" : `${unreadCount} unread notifications`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click below to view and manage your notifications.
                </p>
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => dismissPopover(true)}
                >
                  View notifications
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { NotificationDropdown };
