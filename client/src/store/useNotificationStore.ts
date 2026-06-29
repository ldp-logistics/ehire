import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotificationRole = "employee" | "admin" | "hr" | "it" | "manager" | "all";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  roles: NotificationRole[];
  read: boolean;
  createdAt: string;
  link?: string;
  icon?: string;
  module?: string;
}

interface NotificationState {
  /** Persisted set of notification IDs (from API) that user has marked as read */
  readNotificationIds: string[];
  markAsRead: (id: string) => void;
  markAllAsRead: (ids: string[]) => void;
  isRead: (id: string) => boolean;
  /** Persisted set of notification IDs user has cleared (hidden from list) */
  clearedNotificationIds: string[];
  clearNotification: (id: string) => void;
  clearAllNotifications: (ids: string[]) => void;
  isCleared: (id: string) => boolean;
  /** For backwards compat: add a local notification (e.g. from Onboarding completion) */
  addNotification: (n: Omit<Notification, "id" | "read" | "createdAt">) => void;
  /** Local-only notifications (e.g. from addNotification); merged with API in UI */
  localNotifications: Notification[];
}

const MAX_READ_IDS = 500;
const MAX_CLEARED_IDS = 500;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      readNotificationIds: [],
      clearedNotificationIds: [],
      localNotifications: [],

      markAsRead: (id) =>
        set((state) => {
          const next = state.readNotificationIds.includes(id)
            ? state.readNotificationIds
            : [...state.readNotificationIds.slice(-(MAX_READ_IDS - 1)), id];
          return { readNotificationIds: next };
        }),

      markAllAsRead: (ids) =>
        set((state) => {
          const set = new Set(state.readNotificationIds);
          ids.forEach((id) => set.add(id));
          return { readNotificationIds: Array.from(set).slice(-MAX_READ_IDS) };
        }),

      isRead: (id) => get().readNotificationIds.includes(id),

      clearNotification: (id) =>
        set((state) => {
          const readSet = new Set(state.readNotificationIds);
          readSet.add(id);
          const clearedSet = new Set(state.clearedNotificationIds);
          clearedSet.add(id);
          return {
            readNotificationIds: Array.from(readSet).slice(-MAX_READ_IDS),
            clearedNotificationIds: Array.from(clearedSet).slice(-MAX_CLEARED_IDS),
          };
        }),

      clearAllNotifications: (ids) =>
        set((state) => {
          const readSet = new Set(state.readNotificationIds);
          const clearedSet = new Set(state.clearedNotificationIds);
          ids.forEach((id) => {
            readSet.add(id);
            clearedSet.add(id);
          });
          return {
            readNotificationIds: Array.from(readSet).slice(-MAX_READ_IDS),
            clearedNotificationIds: Array.from(clearedSet).slice(-MAX_CLEARED_IDS),
          };
        }),

      isCleared: (id) => get().clearedNotificationIds.includes(id),

      addNotification: (n) =>
        set((state) => ({
          localNotifications: [
            {
              ...n,
              id: `local-${Date.now()}`,
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...state.localNotifications,
          ].slice(0, 20),
        })),
    }),
    { name: "voyager-notifications" }
  )
);
