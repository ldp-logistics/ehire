# Leave & Absence Management — Full Flow

This document describes the end-to-end flow of the leave management module: data model, setup, request lifecycle, approval chain, visibility rules, and UI behaviour.

---

## 1. Data Model (Schema)

### Core tables

| Table | Purpose |
|-------|--------|
| **leave_policies** | Defines who a policy applies to (departments, employment types, roles). Effective date range, active flag. |
| **leave_types** | Belongs to a policy. One type per category (Annual, Sick, Casual, Unpaid, etc.). Rules: paid/unpaid, accrual, max balance, requires approval, auto-approve rules, HR approval required, min/max days, blocked during notice. |
| **employee_leave_balances** | Per employee, per leave type: balance, used, last_accrual_at. |
| **leave_requests** | One row per application: employee, leave type, dates, day type (full/half), total_days, reason, status (pending/approved/rejected/cancelled), decided_at, decided_by, rejection_reason. |
| **leave_approvals** | One row per approval step: leave_request_id, approver_id (FK → employees.id), approver_role (manager/hr), status (pending/approved/rejected), step_order, actioned_at, remarks. |
| **leave_audit_log** | Append-only log: entity_type, entity_id, action, performed_by, metadata (JSON). |

### Important constraints

- `leave_approvals.approver_id` → `employees.id`. So every approver must be an **employee** (user with linked `users.employee_id`).
- Request status is the single source of truth; approval rows record who approved/rejected at each step.

---

## 2. Setup Flow (HR/Admin)

1. **Create a policy**  
   - Name, effective from/to, applicable departments (optional), applicable employment types (optional), applicable roles (optional).  
   - Stored in `leave_policies`.

2. **Add leave types to the policy**  
   - For each type: name, paid/unpaid, accrual (yearly/monthly/none), max balance, carry forward, requires document, **requires approval**, **auto_approve_rules** (e.g. `{ "maxDays": 1 }`), **hr_approval_required**, min/max days per request, blocked during notice, color.  
   - Stored in `leave_types`.

3. **Policy assignment (automatic)**  
   - When an employee (or their role) needs leave types, the system finds the **best-matching policy** by:  
     - Active, within effective date range.  
     - `applicable_roles` (if set) includes the user’s role.  
     - `applicable_departments` and `applicable_employment_types` match the employee (empty = all).  
   - Leave types for that policy are returned; **employee leave balances** are auto-initialized per leave type (e.g. yearly = max_balance, monthly = 0) if not already present.

4. **Accrual (optional)**  
   - Monthly accrual can be run on demand (e.g. cron or admin action). It updates `employee_leave_balances` for types with `accrual_type = 'monthly'` and bumps balance by `accrual_rate` up to `max_balance`, and sets `last_accrual_at`.

---

## 3. Leave Request Creation Flow (Employee)

When an employee submits a leave request (`POST /api/leave/request`):

### 3.1 Validations (all must pass)

- User has `employeeId` (linked to `employees`).
- `leaveTypeId`, `startDate`, `endDate` present; `endDate >= startDate`.
- Employee exists, not offboarded; leave not before join_date or after exit_date.
- Leave type exists; if it’s blocked during notice and employee is in notice period → 400.
- If type requires document, `attachmentUrl` must be provided.
- **Total days** = business days (Mon–Fri) in range, half-day = 0.5 per day; must be &gt; 0.
- Within leave type’s min_days / max_days_per_request.
- For **paid** types: balance ≥ total days.
- No overlapping **approved** or **pending** request for same employee and dates.

### 3.2 Auto-approve vs pending

- **Auto-approve** is allowed only if **all** of:
  - Employee is **not** in notice period, and  
  - Either `leave_type.requires_approval === false`, or  
  - `auto_approve_rules.maxDays` is set and `requestedDays <= maxDays`.

If auto-approve is allowed:

- Insert `leave_requests` with `status = 'approved'`, `decided_at = NOW()`, `decided_by = 'auto'`.
- If paid: deduct `total_days` from `employee_leave_balances`, increase `used`.
- Call **attendance sync** (see below).
- Audit log: `auto_approve` with rule reference.
- Return 201 with `autoApproved: true`.

If **not** auto-approved:

- **Build approval chain** (see below). If chain is empty → **400** (no approvers), **do not** create the request.
- Insert `leave_requests` with `status = 'pending'` (no decided_at/decided_by).
- Insert one row per step in `leave_approvals` (leave_request_id, approver_id, approver_role, status = 'pending', step_order).
- Audit log: `create` with chain summary.
- Return 201 with the new request (pending).

So: **by default requests are pending**; they become approved only via the explicit auto-approve rule or after the full approval chain completes.

---

## 4. Approval Chain (buildApprovalChain)

Used only when the request is **not** auto-approved. Builds an ordered list of approvers (each must be an `employees.id`).

### 4.1 Step 1 — Manager

- Read `employees.manager_id` for the applicant.
- Resolve to `employees.id`: if `manager_id` is already an employee id, use it; else treat as user id and take `users.employee_id`.
- **Hard rule:** if resolved manager id equals applicant `employee_id`, skip (no self-approval).
- Append one step: approver_role = `manager`, step_order = 1.

### 4.2 Step 2 — HR (optional)

- HR step is added if **any** of:  
  - `leave_type.hr_approval_required`, or  
  - Employee is in notice period, or  
  - `totalDays > 5`, or  
  - **No manager was found** (HR as fallback).
- Find an active HR/admin **user** whose `users.employee_id` exists in `employees` and ≠ applicant.
- If none, fallback: match HR user by email to `employees.work_email` / `personal_email` and link `users.employee_id`; or as last resort auto-create a minimal employee for that user and link.
- Avoid duplicate: if that employee is already in the chain (e.g. manager is also HR), do not add again.
- Append one step: approver_role = `hr`, step_order = 2 (or next).

### 4.3 Final check

- Every step’s `approver_id` is checked to exist in `employees`; invalid ones are dropped (and logged).  
- Return the filtered list; this is what gets written to `leave_approvals`.

---

## 5. Approval / Reject Actions

### 5.1 Who can act

- **Approve / Reject** is allowed only if:
  - The current user is the **assigned approver** for that step (`approver_id = current user’s employee_id`), or
  - The current user is **HR/Admin** (can act on HR-level steps).
- **Hard rule:** if the leave request’s `employee_id` equals the current user’s `employee_id`, the API returns **403** (no self-approval).

### 5.2 Approve (`POST /api/leave/approve/:approvalId`)

1. Mark that approval row: `status = 'approved'`, `actioned_at = NOW()`, optional remarks.
2. Count remaining **pending** approval steps for that leave request.
3. If **no pending steps left**:
   - Set `leave_requests.status = 'approved'`, `decided_at = NOW()`, `decided_by = <current user>`.
   - If paid: deduct balance, increase used in `employee_leave_balances`.
   - Call **syncLeaveToAttendance(requestId)**.
   - Audit: request approved, final approver.
4. Else: audit only (step approved, remaining count).
5. Return `{ success: true, fullyApproved: boolean }`.

### 5.3 Reject (`POST /api/leave/reject/:approvalId`)

1. Mark that approval row: `status = 'rejected'`, `actioned_at = NOW()`, remarks.
2. Mark **all other pending** approval rows for that request as rejected (e.g. remarks “Auto-rejected (prior step rejected)”).
3. Set `leave_requests.status = 'rejected'`, `decided_at = NOW()`, `decided_by = <current user>`, `rejection_reason = remarks`.
4. Audit: request rejected.
5. **No** balance deduction and **no** attendance sync.

So: **attendance is updated only when the request is finally approved**, not on partial approval or reject.

---

## 6. Attendance Sync (after final approval)

- **syncLeaveToAttendance(requestId)** runs only when a request becomes **approved** (either auto-approved or last approval step).
- For each **business day** in the request’s date range:
  - If an attendance row already exists for that employee+date: update `remarks` and `status` (e.g. full-day → `absent`, half-day → `half_day`).
  - Else: insert an attendance record with `source = 'manual'`, `created_by = 'leave_system'`, same status/remarks.
- **reverseAttendanceSync(requestId)** is used when an **approved** leave is **cancelled**: it removes or reverts only rows created by the leave system (e.g. `created_by = 'leave_system'` and no check-in).

---

## 7. Cancel Request

- **Who:** Applicant or HR/Admin.
- **Effect:** Set `leave_requests.status = 'cancelled'`. All **pending** approval steps for that request are set to `rejected` with a “Request cancelled” remark.
- If the request was **already approved** and paid: restore balance (balance += total_days, used -= total_days) and call **reverseAttendanceSync**.
- Audit: cancel, with `wasApproved` in metadata.

---

## 8. Visibility & API Access (role-based)

| Endpoint | Employee | Manager | HR/Admin |
|----------|----------|---------|----------|
| **GET /my-requests** | Own requests only (no approval details) | Own only | Own only |
| **GET /pending-approvals** | Empty [] | Only rows where they are approver and request is pending; never own requests | Same + all pending HR-level steps (any HR can act); never own requests |
| **GET /requests** | Empty [] | Only direct reports (`employees.manager_id = me`) | All requests |
| **GET /request/:id** | Own only; no approvals in response | Full request + approvals (if they can see it) | Full request + approvals |
| **GET /stats** | Personal (own pending, on leave today, etc.) | Team (e.g. pending approvals count, team on leave) | Org-wide |
| **GET /balances/:employeeId** | Own only | Can view team | Can view any |

All list/detail queries enforce ownership or role at the SQL/API layer so that employees never see approval UI or other employees’ requests except as allowed above.

---

## 9. Frontend Behaviour (Leave Calendar page)

### 9.1 Employee

- **Tabs:** “My Requests” only.
- **Actions:** Apply Leave (opens dialog); cancel own **pending** requests.
- **Data:** Own balances, own requests (status only). No approval controls, no team list.

### 9.2 Manager

- **Tabs:** “My Requests”, “Approvals” (with badge count), “Team Requests”.
- **Approvals:** List from `GET /pending-approvals` — only requests where they are the approver; Approve/Reject with optional remarks.
- **Team Requests:** List from `GET /requests` — direct reports only; read-only (no approve/reject on this list; they use Approvals tab for that).

### 9.3 HR/Admin

- **Tabs:** “My Requests”, “Approvals”, “All Requests”, “Policies”.
- **Policies:** Create policy, add leave types, view/edit policy and types.
- **All Requests:** Full list from `GET /requests` with search/filters.
- **Approvals:** Same as manager plus any HR-level pending step (override capability; actions are audited).

---

## 10. Audit

All of the following are written to **leave_audit_log** (append-only):

- Policy create/update, leave type create/update.
- Balance initialize, adjust, accrue.
- Request **create** (with chain summary), **auto_approve** (with rule reference), **approve** (final step), **reject** (with step and remarks), **cancel** (with wasApproved).
- Approval step **approve** (when not the final step).

This gives a full trail for who did what and when, and supports “policy explicitly allows” and “no status change without approval records”.

---

## 11. Summary Diagram (request lifecycle)

```
[Employee applies]
       │
       ▼
Validations (employee, type, dates, balance, overlap)
       │
       ▼
shouldAutoApprove? ──Yes──► Create request status=approved
       │                    Deduct balance, sync attendance, audit
       │                    Return 201 { autoApproved: true }
       No
       │
       ▼
buildApprovalChain (manager, then HR if needed; no self-approval)
       │
       ├── Chain empty ──► 400, do not create request
       │
       ▼
Create request status=pending
Create leave_approvals rows (one per step, status=pending)
Audit "create"
Return 201
       │
       ▼
[Manager/HR sees in Approvals tab]
       │
       ├── Approve step ──► If last step: approve request, deduct balance, sync attendance
       │                    Else: just audit
       │
       └── Reject step ──► Reject request, reject remaining steps, no balance/attendance
```

This is the full flow of the leave management module from setup to approval and attendance sync.
