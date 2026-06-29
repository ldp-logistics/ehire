# Onboarding & Offboarding Module — Full Analysis

This document describes the database, backend, frontend, and wiring for the **Onboarding** and **Offboarding** modules.

---

## 1. Database

### 1.1 Onboarding

| Table | Purpose |
|-------|--------|
| `onboarding_records` | One record per employee onboarding (links to `employees`, `users` as owner). Supports pre-employee fields: `hire_name`, `hire_role`, `hire_department`, `hire_email`, `start_date`. Status: `in_progress` \| `completed`. |
| `onboarding_tasks` | Checklist items per record. `task_name`, `category` (e.g. "Company-wide", "Additional Assigned Items"), `completed` ('true'/'false'), `assignment_details`, `sort_order`. |

- **Schema**: `server/db/schema/onboarding.ts`
- **Migrations**: `0003_add_onboarding.sql`, `0004_add_employment_status_onboarding.sql`
- **Drizzle**: Onboarding schema is included in `server/db/index.ts` (and re-exported). Repositories use **raw SQL** via `BaseRepository` (Neon), not Drizzle ORM for queries.

### 1.2 Offboarding

| Table | Purpose |
|-------|--------|
| `offboarding_records` | One record per offboarding event. `employee_id`, `initiated_by` (employee id), `offboarding_type` (resignation \| termination \| contract_end), `reason`, `notice_required`, `notice_period_days`, `exit_date`, `status` (initiated \| in_notice \| completed \| cancelled). |
| `offboarding_tasks` | Checklist items: `task_type` (asset_return, handover, knowledge_transfer, final_settlement, exit_interview), `title`, `assigned_to`, `status` (pending \| completed \| waived), `related_asset_id` for asset returns. |
| `offboarding_audit_log` | Append-only audit: `action`, `performed_by`, `details`, `previous_value`, `new_value`, `created_at`. |

- **Schema**: `server/db/schema/offboarding.ts`
- **Migrations**: Offboarding tables are referenced in `0017_performance_indexes.sql`; base CREATE TABLE may live in another migration or Drizzle push.
- **Drizzle**: Offboarding schema is **not** passed into `server/db/index.ts` (only employees, assets, onboarding). Offboarding module uses raw Neon SQL only, so it still works.

### 1.3 Related employee fields

- `employees.employment_status`: includes `onboarding`, `offboarded`, `terminated`, `resigned`.
- `employees.exit_date`, `exit_type`, `resignation_date`, `resignation_reason`: set/cleared by offboarding flow.

---

## 2. Backend

### 2.1 Onboarding

| Layer | Location | Role |
|-------|----------|------|
| **Routes** | `server/modules/onboarding/onboarding.routes.ts` | Mounted at `/api/onboarding`. All routes require auth + role `admin` or `hr`. |
| **Controller** | `server/modules/onboarding/OnboardingController.ts` | Delegates to service; uses `ApiResponse` helpers. |
| **Service** | `server/modules/onboarding/OnboardingService.ts` | Business rules: cannot onboard offboarded/terminated; no duplicate in-progress; completing "Company Microsoft Account" with email syncs `employees.work_email`; completing record sets `employment_status = 'active'`. |
| **Repository** | `server/modules/onboarding/OnboardingRepository.ts` | Raw SQL (Neon). Default tasks: "Company Microsoft Account", "Laptop". |
| **DTO** | `server/modules/onboarding/Onboarding.dto.ts` | Request/response shapes. |

**API summary**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all onboarding records (with employee join, task counts). |
| GET | `/:id` | Single record with tasks. |
| GET | `/employee/:employeeId` | Record for one employee. |
| POST | `/` | Create record (body: `employeeId` / `employee_id`); seeds default tasks. |
| PATCH | `/:id` | Update status, completedAt. |
| DELETE | `/:id` | Delete record (and tasks). |
| POST | `/:id/tasks` | Add task (body: `taskName` / `task_name`). |
| PATCH | `/:id/tasks/:taskId` | Update task (completed, assignmentDetails). |
| DELETE | `/:id/tasks/:taskId` | Delete task (not allowed for company-wide). |

### 2.2 Offboarding

| Layer | Location | Role |
|-------|----------|------|
| **Routes** | `server/modules/offboarding/offboarding.routes.ts` | Mounted at `/api/offboarding`. Auth + admin/hr. |
| **Controller** | `server/modules/offboarding/OffboardingController.ts` | Uses timezone helpers for initiate/complete (today in user TZ). |
| **Service** | `server/modules/offboarding/OffboardingService.ts` | Initiate: validations, notice/exit date logic, default tasks + asset-return tasks from `assigned_systems`; on completion calls `onOffboardingComplete` hook. |
| **Repository** | `server/modules/offboarding/OffboardingRepository.ts` | Raw SQL; **bug**: `getAuditLog` orders by `performed_at` but table has `created_at`. |
| **Hooks** | `server/lib/offboardingHooks.ts` | On completion: log revoke system access, mark assets for return in `assigned_systems`, note attendance blocking. |

**API summary**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List records (optional `?status=`). **Gap**: list does not return `total_tasks`, `done_tasks`, `emp_id`, `job_title`, `work_email`, initiator names; frontend expects these. |
| GET | `/:id` | Single record by **record id** (no tasks/assets/audit). **Gap**: frontend calls `GET /api/offboarding/:employeeId/details` which **does not exist**. |
| POST | `/initiate` | Start offboarding (body: employeeId, offboardingType, reason, noticeRequired, noticePeriodDays, exitDateOverride, remarks). |
| PATCH | `/:id/exit-date` | Update exit date (body: exitDate, reason). |
| POST | `/:id/cancel` | Cancel (body: reason). |
| POST | `/:id/complete` | Complete (only when exit_date <= today in request TZ). |
| GET | `/:id/tasks` | Tasks for record. |
| PATCH | `/tasks/:taskId` | Update task (status, notes, assignedTo). Completing asset_return unassigns asset. |
| GET | `/:id/audit` | Audit log for record. |

---

## 3. Frontend

### 3.1 Onboarding

- **Page**: `client/src/pages/Onboarding.tsx`
- **Routes**: `/onboarding` (App.tsx), guarded by `RoleGuard` (admin, hr).
- **Nav**: Layout sidebar "Onboarding" (admin, hr).

**Flow**

1. **List**: GET `/api/onboarding` → list of records with name, role, department, start date, task counts, status.
2. **Detail**: Select record → GET `/api/onboarding/:id` → tasks (company-wide vs additional). Edit assignment details in dialog; toggle complete (backend requires assignment details before complete).
3. **Complete**: When all tasks done, PATCH `/:id` with `status: 'completed'`. Frontend then syncs MS Account / Laptop to employee profile and assets (assign-from-stock if laptop pattern), creates notification, invalidates caches.
4. **Start onboarding**: From Employee Profile (fetch `/api/onboarding/employee/:id`, then POST `/api/onboarding` with `employeeId` → redirect to `/onboarding`). From Employees page: create employee with "requires onboarding" → POST onboarding → redirect to `/onboarding?recordId=...`.

**Integrations**

- Dashboard: onboarding widget (task counts, link to /onboarding).
- Employee profile: "Start onboarding" when no active record; link to onboarding when in progress.
- Recruitment: after creating employee from candidate, prompt to start onboarding and invalidate onboarding list.
- Tasks page: category "Onboarding".
- Notifications: type "onboarding", link /onboarding.

### 3.2 Offboarding

- **Page**: `client/src/pages/Offboarding.tsx`
- **Routes**: `/offboarding` (App.tsx), guarded (admin, hr).
- **Nav**: Layout "Offboarding".

**Flow**

1. **List**: GET `/api/offboarding` → table expects `total_tasks`, `done_tasks`, `emp_id`, `job_title`, `work_email`, `avatar`, `initiator_first_name`, `initiator_last_name`. **Backend currently returns only** `o.*, e.first_name, e.last_name, e.department` → table missing columns/counts.
2. **Detail**: User clicks row → `setDetailEmployeeId(r.employee_id)` → DetailDialog fetches **GET `/api/offboarding/${employeeId}/details`**. This endpoint **does not exist** → detail view fails (404 or wrong data).
3. **Initiate**: Dialog POST `/api/offboarding/initiate` with employee, type, reason, notice, exit date override, remarks.
4. **In detail**: Complete, cancel, update exit date, task status (done/waive) call the correct backend routes by **record id** (`detail!.id`) — but detail is never loaded because `/details` is missing.

**Integrations**

- Dashboard: offboarding pending list, risks (offboarding with unreturned assets), links to /offboarding.
- Employee profile: milestones for offboarding initiated/completed.
- Notifications: type "offboarding", link /offboarding.
- Settings: People modules include "Offboarding".
- Tasks page: category "Offboarding".

---

## 4. Wiring Summary & Gaps

### 4.1 Onboarding

- **Database ↔ Backend**: Repository uses raw SQL; schema in Drizzle for types/migrations. Employee status and work email updated on completion.
- **Backend ↔ Frontend**: All list/detail/create/update/task APIs exist and are used correctly. Create expects `employeeId`; frontend and Employee/Employees flows pass it.

### 4.2 Offboarding — gaps

1. **Missing endpoint**: Frontend calls `GET /api/offboarding/:employeeId/details` to load one offboarding by **employee id** with full detail (record + tasks + assets + audit). Backend has no such route → detail dialog never loads.
2. **List response shape**: Frontend expects list items with `total_tasks`, `done_tasks`, `emp_id`, `job_title`, `work_email`, `avatar`, `initiator_first_name`, `initiator_last_name`. Backend list returns only `o.*, e.first_name, e.last_name, e.department`.
3. **Audit log column**: `OffboardingRepository.getAuditLog` uses `ORDER BY performed_at` but `offboarding_audit_log` has `created_at` (no `performed_at`) → SQL error when audit is queried.

### 4.3 Recommended fixes

1. **Add** `GET /api/offboarding/employee/:employeeId/details` that:
   - Finds the (active or latest) offboarding record for that employee.
   - Returns record + tasks (with assignee first/last name) + assets (from `assigned_systems` for that employee) + audit log.
2. **Extend** list query (or add a separate list DTO) to include:
   - Task counts: `total_tasks`, `done_tasks`.
   - Employee: `emp_id`, `job_title`, `work_email`, `avatar`.
   - Initiator: `initiator_first_name`, `initiator_last_name` (join on `initiated_by`).
3. **Fix** `getAuditLog`: use `ORDER BY created_at` instead of `performed_at`.

---

## 5. File Reference

| Area | Onboarding | Offboarding |
|------|------------|-------------|
| **Schema** | `server/db/schema/onboarding.ts` | `server/db/schema/offboarding.ts` |
| **Routes** | `server/modules/onboarding/onboarding.routes.ts` | `server/modules/offboarding/offboarding.routes.ts` |
| **Controller** | `server/modules/onboarding/OnboardingController.ts` | `server/modules/offboarding/OffboardingController.ts` |
| **Service** | `server/modules/onboarding/OnboardingService.ts` | `server/modules/offboarding/OffboardingService.ts` |
| **Repository** | `server/modules/onboarding/OnboardingRepository.ts` | `server/modules/offboarding/OffboardingRepository.ts` |
| **DTO** | `server/modules/onboarding/Onboarding.dto.ts` | — |
| **Hooks** | — | `server/lib/offboardingHooks.ts` |
| **Frontend page** | `client/src/pages/Onboarding.tsx` | `client/src/pages/Offboarding.tsx` |
| **App routes** | `client/src/App.tsx` (Route path="/onboarding") | `client/src/App.tsx` (Route path="/offboarding") |
| **Nav** | `client/src/components/layout/Layout.tsx` | Same |
| **Registration** | `server/routes.ts` (`/api/onboarding`) | `server/routes.ts` (`/api/offboarding`) |

---

## 6. Cross-module references

- **Dashboard**: DashboardRepository / DashboardService use onboarding_records, onboarding_tasks, offboarding_records, assigned_systems for counts and widgets.
- **Employees**: Employment status and exit fields; profile and list start onboarding.
- **Assets**: assigned_systems used for offboarding asset-return tasks and for onboarding laptop assignment (assign-from-stock on complete).
- **Notifications**: NotificationService builds offboarding notifications from offboarding records.
- **Recruitment**: After creating employee from candidate, suggests onboarding and invalidates onboarding list.
