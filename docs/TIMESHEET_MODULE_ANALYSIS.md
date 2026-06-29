# Timesheet (Time & Attendance) Module — Full Analysis

This document analyzes the entire Timesheet module: database, backend (refactored module + legacy leave sync), and frontend, including gaps and bugs.

---

## 1. Database Layer

**Schema:** `server/db/schema/attendance.ts`  
**Migration:** `migrations/0006_add_attendance.sql`

### Tables

| Table | Purpose |
|-------|--------|
| **shifts** | Shift definitions: name, start_time, end_time, grace_minutes, weekly_pattern (JSON), is_active |
| **employee_shifts** | Assignment of shift to employee with effective_from / effective_to |
| **attendance_records** | One row per employee per date: check_in_time, check_out_time, source, status, **remarks**, created_by |
| **attendance_audit** | Append-only audit: attendance_id, action, performed_by, reason, changes (JSON) |

### Enums

- **attendance_source:** `manual` \| `web` \| `mobile` \| `biometric`
- **attendance_status:** `present` \| `late` \| `half_day` \| `absent`
- **attendance_audit_action:** `create` \| `update` \| `delete` only

### Indexes (from migration + 0017)

- `idx_attendance_employee`, `idx_attendance_date`, `idx_attendance_employee_date`
- `idx_attendance_status`, `idx_attendance_emp_date_status`
- `idx_audit_attendance`, `idx_attendance_audit_created_at`

### Relations

- `attendance_records.employee_id` → `employees.id` (CASCADE)
- `attendance_audit.attendance_id` → `attendance_records.id` (CASCADE)

---

## 2. Backend Layer — Refactored Module

**Mount:** `app.use("/api/attendance", attendanceRouter)` in `server/routes.ts`  
**Module root:** `server/modules/attendance/`

### Route → Controller → Service → Repository

| Route | Auth | Handler | Purpose |
|-------|------|---------|--------|
| GET /shifts | ✓ | listShifts | List shifts (cached 30s) |
| POST /shifts | admin/hr | createShift | Create shift |
| PATCH /shifts/:id | admin/hr | updateShift | Update shift |
| DELETE /shifts/:id | admin | deleteShift | Delete shift |
| GET /employee-shifts | ✓ | listEmployeeShifts | List assignments |
| POST /employee-shifts | admin/hr | assignShift | Assign shift to employee |
| DELETE /employee-shifts/:id | admin/hr | removeEmployeeShift | Remove assignment |
| POST /check-in | ✓ | checkIn | Employee check-in (user TZ) |
| POST /check-out | ✓ | checkOut | Employee check-out |
| GET /records | ✓ | listRecords | List records (query: employeeId, startDate, endDate, status, limit, offset) |
| POST /manual | admin/hr | manualUpsert | Create/update record manually |
| GET /records/:id/audit | admin/hr | listAudit | Audit trail for a record |

### Logic (Service)

- **deriveStatus:** Compares check-in/out to shift start/end + grace → present \| late \| half_day \| absent.
- **checkIn / checkOut:** Use `todayInTz(userTz)`; validate employment_status, exit_date, join_date; then create/update record and audit.
- **manualUpsert:** Upsert by employeeId + date; writes audit with reason.

### Repository bugs (critical)

1. **Column name:** Table has **remarks**, repository uses **notes** in `manualUpsert` (INSERT/UPDATE). This will cause DB errors (column "notes" does not exist).
2. **Audit action:** Enum allows only `create`, `update`, `delete`. Repository uses `"manual_update"` and `"manual_create"` in `logAudit` → PostgreSQL will reject the insert.

---

## 3. Frontend Expectations vs Module API

The Timesheets page and Dashboard call endpoints that the **refactored module does not implement**. Result: 404 or wrong data.

| Frontend call | Module has? | Notes |
|---------------|-------------|--------|
| GET /api/attendance/today | ❌ No | Today’s record for current user + shift; used for clock card and timer. |
| GET /api/attendance/stats | ❌ No | Today’s counts: present, late, absent, totalEmployees; used for stats cards. |
| GET /api/attendance/employee/:id?from=&to= | ⚠️ Different | Frontend expects path `/employee/:id` and query `from`, `to`. Module has GET /records?employeeId=&startDate=&endDate= (different path and param names). |
| GET /api/attendance/report?from=&to=&department= | ❌ No | Report with employee + department filter, **hours_worked** and **overtime** per row; used for report tab. |
| POST /api/attendance/check-in | ✅ Yes | Implemented. |
| POST /api/attendance/check-out | ✅ Yes | Implemented. |
| POST /api/attendance/manual | ✅ Yes | Implemented but broken (notes vs remarks, audit action). |
| PATCH /api/attendance/record/:id | ❌ No | Edit record from report; frontend sends checkInTime, checkOutTime, remarks. |
| DELETE /api/attendance/record/:id | ❌ No | Delete record from report. |
| GET /api/attendance/daily-summary?date= | ❌ No | Used by Dashboard for “today’s attendance” widget. |

So: **clock in/out** can work; **today**, **stats**, **my log**, **report**, **edit**, **delete**, and **daily-summary** either 404 or don’t match the frontend contract.

---

## 4. Frontend (Timesheets Page) — Summary

**File:** `client/src/pages/Timesheets.tsx`  
**Route:** `/timesheets`

### Features

- **Stats cards:** Present / Late / Absent / Total (from `/api/attendance/stats`).
- **My Attendance tab:** Clock card (today + elapsed timer), “My Attendance Log” table (from `/api/attendance/employee/:id?from=&to=`).
- **Attendance Report tab (HR/Admin):** Filters (from, to, department, search), summary (records, late, total hours, overtime), table with Edit/Delete (PATCH/DELETE `/api/attendance/record/:id`), CSV export.
- **Manual entry dialog:** Employee, date, check-in/out time, remarks → POST `/api/attendance/manual`.
- **Edit dialog:** Prefilled check-in/out, remarks → PATCH `/api/attendance/record/:id`.
- **Delete confirmation:** AlertDialog → DELETE `/api/attendance/record/:id`.

### Helpers

- **formatDate:** Handles YYYY-MM-DD and ISO strings; null/undefined → "—".
- **formatTime, formatHours, statusBadge, sourceBadge:** Display only.

### Data flow

- Queries: today, stats, employee records (from/to), report (from/to/department).
- Mutations: check-in, check-out, manual, update record, delete record.
- Invalidation: today, stats, report after mutations.

---

## 5. Other Integrations

### Leave module (`server/routes/leave.ts`)

- **syncLeaveToAttendance(leaveRequestId):** For approved leave days, inserts/updates `attendance_records` (source `manual`, created_by `leave_system`, remarks/status set). Uses column **remarks** and **status** correctly.
- **reverseAttendanceSync:** Deletes leave-system records (no check-in) when leave is cancelled/rejected.
- Leave requests store `attendance_sync_status` (pending \| synced \| failed).

### Dashboard

- Uses `GET /api/attendance/daily-summary?date=` for the attendance-by-date widget and links to `/timesheets`.

### Shifts page

- Uses module endpoints: GET /shifts, GET /employee-shifts, PATCH/POST /shifts, POST /employee-shifts, DELETE /shifts, DELETE /employee-shifts. These match the module and should work.

---

## 6. Gaps and Bugs Summary

| Item | Severity | Fix |
|------|----------|-----|
| Repository uses `notes` instead of `remarks` | High | Use `remarks` in all INSERT/UPDATE in `AttendanceRepository.manualUpsert`. |
| Audit action `manual_update` / `manual_create` not in enum | High | Use `update` / `create` (and optionally put "Manual update" in `reason`). |
| No GET /today | High | Add route + controller + service + repo (today’s record for req.user.employeeId + shift). |
| No GET /stats | High | Add route + service + repo (counts for today: present, late, absent, total active). |
| No GET /employee/:id (from/to) | High | Add route or adapt frontend to GET /records?employeeId=&startDate=&endDate=; ensure response shape matches (e.g. shift_name, shift_start, shift_end). |
| No GET /report (from/to/department, hours_worked, overtime) | High | Add route + service + repo (report query with joins, computed hours_worked/overtime). |
| No PATCH /record/:id | High | Add route + service + repo (update check_in_time, check_out_time, remarks; recompute status; audit). |
| No DELETE /record/:id | High | Add route + service + repo (delete record; optional audit log). |
| No GET /daily-summary | Medium | Add for Dashboard (all employees’ attendance for a date). |
| Manual body: frontend sends `remarks`, controller passes body; repo expects `notes`/`reason` | Medium | In service/repo, map `data.remarks` to DB `remarks` and to audit `reason` where appropriate. |

---

## 7. Recommended Order of Fixes

1. **Repository:** Fix `remarks` (replace `notes`) and audit action values (`create`/`update` with reason).
2. **Controller/Service:** Ensure manual payload uses `remarks` and optional `reason` for audit.
3. **Add missing endpoints** in module (today, stats, employee by id with from/to, report, record PATCH/DELETE, daily-summary) so the existing frontend works without changing URLs or response shapes.
4. **Optional:** Align GET /records with frontend (e.g. support from/to and role-based filtering) if you want a single list endpoint for both “my records” and “report”.

After these changes, the Timesheet module will be consistent end-to-end: DB (remarks, audit enum) → backend (all routes the UI needs) → frontend (no 404s, correct data and edit/delete).
