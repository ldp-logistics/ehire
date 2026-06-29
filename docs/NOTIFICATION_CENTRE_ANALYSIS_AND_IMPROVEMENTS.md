# Notification Centre — Analysis & Improvement Suggestions

This document analyses the Notification Centre and its wiring across the system, then suggests concrete improvements.

---

## 1. Current Architecture Overview

### 1.1 Server-side (API)

| Layer | File | Responsibility |
|-------|------|----------------|
| **Routes** | `server/modules/notifications/notification.routes.ts` | `GET /` → `requireAuth` → controller.list |
| **Controller** | `NotificationController.ts` | Resolves user timezone (DB), calls service, returns `{ notifications, role }` |
| **Service** | `NotificationService.ts` | Builds a list of `NotificationItem` from multiple data sources; role-based logic |
| **Repository** | `NotificationRepository.ts` | Raw SQL queries against leave, change_requests, onboarding, leave_approvals, tentative, offboarding, applications, probation |

**Important:** There is **no dedicated `notifications` table**. Notifications are **computed on each request** by querying domain tables (leave, change_requests, onboarding, etc.) and assembling items in the service.

### 1.2 Data flow

```
User opens app / dropdown
    → Client: GET /api/notifications (React Query, key: ["/api/notifications"])
    → Server: getRequestTz(req, sql) → getNotifications(user, userTz)
    → NotificationRepository: 8+ parallel queries (getMyLeave, getMyChangeRequests, getMyOnboarding, …)
    → NotificationService: build NotificationItem[] by role (employee / manager / hr)
    → Response: { notifications: NotificationItem[], role }
    → Client: merge with localNotifications (Zustand), sort by createdAt, show in NotificationDropdown
```

### 1.3 Client-side

| Piece | Location | Role |
|-------|----------|------|
| **UI** | `client/src/components/NotificationDropdown.tsx` | Bell icon in header; dropdown with list; "Mark all read"; link to /settings |
| **State** | `client/src/store/useNotificationStore.ts` | Persisted read IDs (`readNotificationIds`), `localNotifications`, `addNotification` |
| **Layout** | `client/src/components/layout/Layout.tsx` | Renders `<NotificationDropdown />` in the header |

**Read state:** Only client-side (Zustand persist). Server does not store “read” status.

---

## 2. Wiring with Other Modules

### 2.1 Modules that “feed” the Notification Centre (server-side aggregation)

The Notification **Repository** pulls from these domains:

| Domain | Repository method | Who sees it |
|--------|--------------------|-------------|
| **Leave** | `getMyLeave`, `getPendingApprovals` | Employee: own leave status; Manager/HR: approvals to act on |
| **Change requests** | `getMyChangeRequests`, `getPendingChangeCount` | Employee: own CR status; HR: count of pending CRs |
| **Onboarding** | `getMyOnboarding`, `getOnboardingAssignments`, `getOnboardingInProgress` | Employee: own tasks + assignments; HR: in-progress records |
| **Tentative** | `getTentativePending` | HR: tentative hires pending docs |
| **Offboarding** | `getOffboardingPending` | HR: active offboarding |
| **Recruitment** | `getNewApplications`, `getOffersSent` | HR: new applications, offers sent |
| **People** | `getProbationAlerts` | HR: probation ending in 7 days |

There is **no** direct call from Leave, Change Requests, Onboarding, etc. into a “notification service” when an event happens (e.g. “leave approved”). The centre only **reads** from those tables on each GET.

### 2.2 Modules that push “local” notifications (client-only)

| Module | When | What |
|--------|------|------|
| **Onboarding** | When user marks an onboarding record as **completed** | `addNotification({ type: "onboarding", title: "Onboarding Completed", ... })` — confirmation for the person who completed it |
| **IT Support** | When user **creates a support ticket** | `addNotification({ type: "ticket", title: "New Support Ticket", ... })` — confirmation for the submitter |

These exist only in the client (Zustand `localNotifications`). They are **not** stored on the server and **not** visible to other users (e.g. HR does not get a server-backed “Onboarding X completed” notification).

### 2.3 Where notification list is refreshed

- **Refetch:** When the dropdown is opened/mounted, React Query fetches `/api/notifications` (stale-while-revalidate depends on query client config).
- **No invalidation:** No module currently calls `queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })` after mutations (e.g. approving leave, completing onboarding). So the bell count/list can be stale until the next refetch or page reload.

---

## 3. Gaps and Issues

1. **No server-side notification persistence**  
   - Nothing is written to a `notifications` table. You cannot “mark as read” on the server, sync across devices, or build a proper notification history.

2. **Heavy read path**  
   - Every GET runs many repository queries. For HR/admin this is 8+ queries per request. No caching, no incremental loading.

3. **No real-time**  
   - No WebSocket/SSE. Users see updates only when they open the dropdown or when the query refetches.

4. **No invalidation after mutations**  
   - Leave, change requests, onboarding, recruitment, etc. do not invalidate `["/api/notifications"]`, so the bell can show outdated counts.

5. **Local vs API semantics**  
   - Local notifications (Onboarding completed, IT ticket created) are “confirmation” style and only for the actor. HR/admin do not get a server-backed “Onboarding completed” or “New ticket” in the centre.

6. **Controller/repository duplication**  
   - `NotificationController` creates its own `neon(process.env.DATABASE_URL!)` only for `getRequestTz`. Repository already has DB access; timezone could be resolved in one place or via a shared helper.

7. **Broken / misleading link**  
   - IT Support local notification uses `link: "/assets"`. If the main IT Support UI is under `/it-support`, the link should likely be `/it-support` for consistency.

8. **“Notification settings” link**  
   - Dropdown links to `/settings` with label “Notification settings”. If Settings has no notification preferences, this is misleading.

9. **Role vs identity**  
   - Change requests in the repo are fetched by `user.id` (auth user). If `change_requests.requester_id` is actually an employee id, this could be wrong; worth verifying.

10. **Limited coverage**  
    - No notifications from: Tasks, Assets (except local ticket), Leave calendar events, Payroll, Compliance, etc. Either by design or future expansion.

---

## 4. Suggested Improvements

### 4.1 Quick wins (no schema change)

- **Invalidate notifications after relevant mutations**  
  In Leave, Change Requests, Onboarding, Recruitment, Offboarding (and anywhere that affects approval/status), add:
  ```ts
  queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  ```
  so the bell list (and count) refreshes after actions.

- **Fix IT Support notification link**  
  In `ITSupport.tsx`, use `link: "/it-support"` (or the canonical route for the IT Support page) instead of `"/assets"` so the notification takes the user to the right place.

- **Remove unused import**  
  In `NotificationController.ts`, remove `ApiResponse` if it is not used.

- **Resolve timezone in one place**  
  Have the controller use a shared DB client or a small helper that uses the same connection as the rest of the app (e.g. from request or from a service) so you don’t instantiate `neon()` only for `getRequestTz`.

- **Verify change_requests.requester_id**  
  Confirm whether it is user id or employee id; if it’s employee id, pass `user.employeeId` (with fallback) when calling `getMyChangeRequests`.

### 4.2 Medium-term (better UX and consistency)

- **Notification settings**  
  - Either add a real “Notification settings” section under Settings (e.g. per-type or per-channel toggles) or change the dropdown label/link to something like “Settings” so it’s not misleading.

- **Stale time and refetch**  
  - Give the notifications query a short `staleTime` (e.g. 30–60 seconds) and optional `refetchOnWindowFocus` so the list feels fresher without over-fetching.

- **Dedicated notifications API types**  
  - Share a single TypeScript type (e.g. `ApiNotification`) between client and server (or generate from OpenAPI) so the response shape is consistent and documented.

### 4.3 Larger improvements (with schema change)

- **Persisted notifications table**  
  - Add a `notifications` table (e.g. `id`, `user_id`, `type`, `module`, `title`, `message`, `link`, `read_at`, `created_at`, `entity_type`, `entity_id`).
  - When important events occur (leave approved/rejected, onboarding completed, change request approved, new ticket for IT, etc.), **write** a row (via a shared NotificationService or event bus).
  - GET `/api/notifications` would then read from this table (with pagination), optionally still merging or replacing with critical “live” items (e.g. pending approvals count).
  - Enables: server-side “mark as read”, sync across devices, and a clear audit trail of what was shown.

- **Mark as read on server**  
  - Add `PATCH /api/notifications/:id/read` (and maybe “mark all read”) that set `read_at`. Client continues to track read state for backward compatibility and for items not yet in the DB.

- **Real-time updates**  
  - Add WebSocket or SSE for “new notification” events so the bell count updates without opening the dropdown; optional “toast” for high-priority types.

- **Central “emit notification” API**  
  - Single function or API used by Leave, Onboarding, Change Requests, Recruitment, etc., e.g. `notificationService.create({ userId, type, module, title, message, link, entityType, entityId })`. This keeps notification logic in one place and makes it easier to add new modules.

---

## 5. Summary Table

| Area | Current | Suggested |
|------|---------|-----------|
| **Source of truth** | Computed from domain tables on each GET | Optional: persisted `notifications` table + event-driven writes |
| **Read state** | Client-only (Zustand) | Optional: server `read_at` + PATCH endpoint |
| **Refresh** | On dropdown open / refetch | Invalidate after mutations; optional real-time |
| **Local notifications** | Onboarding complete, IT ticket create | Keep; fix IT link to `/it-support` |
| **Settings** | Link to /settings | Add real notification settings or rename link |
| **Performance** | Many queries per GET | Optional: cache, or replace with reads from `notifications` table |
| **Cross-module wiring** | Repository reads from each domain | Optional: central “create notification” used by all modules |

Implementing the quick wins (invalidation, IT link, timezone/import/requester_id fixes) will improve correctness and perceived freshness of the Notification Centre with minimal effort. The larger changes (persisted table, server-side read, real-time) can be phased in as product requirements grow.
