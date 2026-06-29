# Department Transition / Transfer: Flow and Logs

## Current flow (today)

When someone **switches department** (internal transfer), the only supported flow is:

1. **HR/Admin** opens the **employee profile**.
2. Clicks **Edit** (Edit Profile).
3. In the **Overview** or **Job & Pay** section, changes:
   - **Department** (dropdown from GET /api/employees/departments)
   - Optionally: **Sub department**, **Business unit**, **Primary team**, **Location**
   - **Manager** (reporting manager in the new department)
   - **Job title**, **Grade**, **Job category** if the role changes
4. Clicks **Save** → **PATCH /api/employees/:id** updates the `employees` row.

So: **department transition = direct edit by Admin/HR**. There is no:

- Employee-initiated “request to transfer”
- Approval workflow (HR/Admin change is effective immediately)
- Dedicated “transfer” or “transition” audit log

---

## What gets updated

| Field | Updated via | Notes |
|-------|-------------|--------|
| `department` | PATCH /api/employees/:id | Main department |
| `sub_department` | Same | Optional |
| `business_unit` | Same | Optional |
| `primary_team` | Same | Optional |
| `location` | Same | Often changes with department |
| `manager_id` / `manager_email` | Same | New reporting manager |
| `job_title`, `grade`, `job_category` | Same | If role changes in the move |

All of these are in the allowed-fields list for PATCH; one save can change all of them.

---

## Logs today

- **No audit trail** for department (or job/manager) changes. Only the **current** values are stored in `employees`; there is no history of “was in Dept A, moved to Dept B on date X by user Y”.
- **Change requests** (`change_requests` table) are only for categories: personal_details, address, contact, dependents, emergency_contacts, bank_details. There is **no** category for department, job, or transfer, so employees cannot submit a “request to change department” through that flow, and HR cannot use it to log approvals for transfers.

So: **transition flow exists only as “HR edits the profile”; there are no logs of the transition.**

---

## Suggested improvements (optional)

If you want a clearer **transition flow** and **logs**:

### Option A: Add a transfer audit log (no new workflow)

- Add a table, e.g. **`employee_transfers`** or **`employee_field_history`**:
  - `employee_id`, `field_name` (e.g. `department`, `manager_id`, `job_title`), `old_value`, `new_value`, `changed_at`, `changed_by` (user id).
- In **PATCH /api/employees/:id**, when `department`, `manager_id`, `job_title`, `location`, etc. change, **insert** a row per changed field (before applying the update).
- Gives you a **history of moves** and who made them; no change to the current “HR edits profile” flow.

### Option B: Add “department / job change” to change requests

- Extend **change_requests** with a category, e.g. **`job_department`** (or `transfer`).
- Allow **employees** to submit a request with `changeData` = e.g. `{ department, job_title, manager_id }` (new values).
- HR/Admin **approve** or **reject**; on approve, apply those fields to the employee and (optionally) write to an audit table.
- Flow becomes: **Employee requests → HR approves → department/job updated**; `change_requests` table is the log of requests and approvals.

### Option C: Dedicated “Transfer” action (HR-initiated, with audit)

- Add an **“Initiate transfer”** (or “Department change”) form in the UI: effective date, new department, new manager, new job title/grade, optional notes.
- Backend: **POST /api/employees/:id/transfer** (or similar) that:
  - Updates `employees` (department, manager_id, job_title, etc.).
  - Inserts into **`employee_transfers`** (or similar): employee_id, from_department, to_department, from_manager_id, to_manager_id, effective_date, initiated_by, notes.
- No employee request step; HR still drives the change, but you get a **clear log of every transfer** (who, when, from/to what).

---

## Summary

| Question | Answer today |
|----------|----------------|
| How does someone switch department? | HR/Admin edits the employee profile (department, manager, job, etc.) and saves. |
| Is there an approval or request flow? | No. Only direct edit by Admin/HR. |
| Are transitions logged? | No. Only current state in `employees`; no history of department/manager/job changes. |
| Can an employee request a transfer? | Not via the app. Change requests do not support department/job. |

To get **logs** and/or **request-based flow**, add either an audit table (Option A), change-request support for job/department (Option B), or a dedicated transfer API + table (Option C) as above.
