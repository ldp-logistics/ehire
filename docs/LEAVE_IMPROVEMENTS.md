# Leave Management — Structural Improvements (Internal HRMS)

This document suggests **targeted improvements** to the existing leave system without rewriting it or introducing SaaS/multi-tenant complexity. Focus: HR flexibility, data safety, concurrency, and maintainability.

---

## 1. Policy Editing & Mid-Year Changes

### Problem
HR cannot safely edit an active policy; unclear whether to allow edits or version.

### Recommendation: **Edit with guardrails (no full versioning yet)**

- **Allow editing** of the **current** policy and leave types, with these rules:
  - **Never change or delete** `leave_types.id`. Only UPDATE columns (name, max_balance, requires_approval, etc.). Historical `leave_requests` and `employee_leave_balances` stay valid because they reference the same `leave_type_id`.
  - **Policy:** Allow UPDATE of `effective_from`, `effective_to`, `applicable_*`, `is_active`, `name`. Do **not** allow deleting a policy that has `leave_requests` or active balances (soft-deactivate with `is_active = false` and set `effective_to` instead).
- **Mid-year change:** When HR needs different rules for the **next** period (e.g. next year):
  - **Option A (simplest):** Extend current policy: set `effective_to = NULL` or push `effective_to` to end of next year. Edit leave types in place for the new period. New requests use new rules; historical requests already store `leave_type_id` and dates.
  - **Option B (when you need a clear cut):** Add a “Clone policy for next year” action: create a new policy (new id) with `effective_from = first day of next year`, copy leave types (new ids), then run year-end that attaches balances to the **new** leave type ids (see Section 2). Old policy gets `effective_to = last day of current year`. No change to historical `leave_requests` — they still point to old leave_type_id.

**Implementation:**  
- Add a simple “Edit policy” / “Edit leave type” UI that PATCHes existing rows; forbid changing IDs and forbid policy delete when it has requests.  
- Optional: add `leave_policies.updated_at` and show “Last updated” in UI so HR sees when rules changed.

---

## 2. Year-End Process (Structured)

### Problem
Year-end is ad hoc; need options: continue same policy, modify for next year, or new policy version, without breaking history.

### Recommendation: **Explicit year-end flow with optional “next year policy”**

**Keep existing behaviour, make it explicit:**

1. **Year-end reset (existing endpoint)**  
   - For **Earned Leave:** set balance to 0, set `last_reset_at` to the reset date (idempotent per year).  
   - For **Bereavement:** set balance to 2, same idempotency.  
   - Do **not** delete or alter historical `leave_requests` or old balances; only update current balances.

2. **Three HR-facing options (UI + one optional table):**

   - **Continue same policy next year**  
     - Ensure current policy has `effective_to = NULL` or `effective_to >= end of next year`.  
     - Run year-end reset as today.  
     - Carry forward / encash: continue using existing HR “Adjust balance” and “Add days” for Earned Leave only. No schema change.

   - **Modify policy for next year**  
     - HR edits current policy and leave types (effective dates, max_balance, etc.) as in Section 1.  
     - Set policy `effective_to = NULL` (or end of next year).  
     - Run year-end reset.  
     - New requests from Jan 1 use updated rules. Historical data unchanged.

   - **New policy version for next year**  
     - Add a table (optional but recommended for clarity):

```sql
-- Optional: only if you want a clear “year” attachment for balances
-- leave_balance_years (id, employee_id, leave_type_id, policy_year, balance_snapshot, used_snapshot, reset_at)
-- Filled at year-end for audit; balances still live in employee_leave_balances.
```

     - Simpler approach without new table:  
       - Create **new policy** “Leave Policy 2026” with `effective_from = 2026-01-01`.  
       - Copy leave types from current policy (new ids) into this policy.  
       - Run year-end: for each employee, for each **new** leave type, insert `employee_leave_balances` with balance 0 (Earned) or 2 (Bereavement) and optional carry-forward logic (e.g. HR runs “Add days” for carry-forward).  
       - Set **old** policy `effective_to = 2025-12-31`.  
     - Historical `leave_requests` still reference **old** `leave_type_id`; reports join to `leave_types` and show old type name. No FK change.

3. **Must not break historical leave records**  
   - All queries that display past requests must use `leave_requests.leave_type_id` → `leave_types` (current row). If you clone a policy and leave types, **keep old leave_types rows** (do not delete); only mark old policy inactive or set `effective_to`. So past requests always resolve to a valid type name and policy.

**Migration:**  
- No mandatory migration. Optional: add `leave_policies.policy_year` (integer, nullable) for display (“Policy for 2025”) and set it when creating a “next year” policy.

---

## 3. HR Acting on Behalf of Manager (Delegation / Override)

### Problem
If manager is unavailable, HR should be able to approve or reject on their behalf. No delegated approver or formal HR override today.

### Recommendation: **Two minimal mechanisms**

**A) HR can act on any pending approval step (not only “HR” steps)**

- You already allow HR/Admin to act on **HR-level** steps. Extend: **HR/Admin can act on any pending step** (including manager step) for any request they can see (e.g. all requests or team scope).
- Rule: when HR acts on a **manager** step, record it explicitly so audit shows “approved by HR on behalf of manager”:
  - In `leave_approvals`: keep `approver_id` as the **original** manager (so chain is unchanged). Add one column: `acted_by_id` (nullable, FK to employees or users). If HR acted on behalf, set `acted_by_id = HR’s employee_id`, and in UI show “Approved by [HR name] on behalf of [Manager name]”.
- **Schema change:**  
  - `leave_approvals`: add `acted_by_id varchar(255) NULL` (references employees.id).  
  - When the assigned approver acts: `acted_by_id = NULL`.  
  - When HR/Admin acts on a step that is not their own: set `acted_by_id = current user’s employee_id`.  
- **Authorization:**  
  - Allow approve/reject if `current_user.employee_id = approval.approver_id` OR `(current_user is HR/Admin and request is in scope)`.  
  - No new “delegation” table needed for this.

**B) Explicit “HR override” for force-approve / force-reject**

- **Force-approve:** New endpoint or same approve endpoint with a flag, e.g. `POST /api/leave/approve/:approvalId` with body `{ "remarks": "...", "hrOverride": true }`.  
  - Only HR/Admin.  
  - If `hrOverride === true`: do not check `approval.approver_id`; allow approving any pending step. Set `acted_by_id = HR’s employee_id`, and in audit log write `action: "approve"` with `metadata: { hrOverride: true, originalApproverId: approval.approver_id }`.  
  - Then run same “final approval” logic (deduct balance, sync attendance) when last step is done.  
- **Force-reject:** Same idea: `POST /api/leave/reject/:approvalId` with `{ "remarks": "...", "hrOverride": true }`. Mark that step and remaining steps rejected, set request rejected, audit with `hrOverride: true`.  
- **UI:** In Approvals list, show an “Approve on behalf” / “Reject” button for HR when the step is assigned to someone else; optional “Reason (required for override)” text.

**Delegated approver (optional, later)**  
- If you later want “Manager A delegates to Manager B for date range”: add a small table `leave_approval_delegations (id, delegator_employee_id, delegate_employee_id, valid_from, valid_to)` and in `buildApprovalChain` / approval check: if current date is within a delegation for the manager, treat `delegate_employee_id` as allowed to act for that step (and set `acted_by_id = delegate`). Start without this unless you need it.

---

## 4. Concurrency & Race Conditions

### Problem
Double approval and balance deduction races are possible.

### Recommendation: **Single transaction + status check + balance guard**

**A) Wrap approve path in a transaction**

- In `POST /api/leave/approve/:approvalId`:  
  - Start transaction.  
  - `SELECT leave_approvals WHERE id = approvalId FOR UPDATE` (lock row).  
  - If `status != 'pending'` → rollback, return 400 “Already actioned”.  
  - Load `leave_request` for that approval; if `status != 'pending'` → rollback, return 400 “Request already decided”.  
  - Update approval to approved; count remaining pending steps; if 0, update request to approved, then deduct balance (see below), then sync attendance (can stay outside transaction if you prefer), then audit.  
  - Commit.  
- Use the same pattern for reject: lock approval row, check status, then update approval + request + other steps.

**B) Balance deduction with guard**

- Today: `UPDATE employee_leave_balances SET balance = balance - X, used = used + X WHERE employee_id = ? AND leave_type_id = ?`.  
- Change to:  
  - `UPDATE employee_leave_balances SET balance = balance::numeric - ${totalDays}, used = used::numeric + ${totalDays}, updated_at = NOW() WHERE employee_id = ? AND leave_type_id = ? AND balance::numeric >= ${totalDays}`  
  - Then check `rowCount` (or equivalent). If 0, rollback and return 400 “Insufficient balance (possible concurrent update). Please retry.”  
- This prevents balance going negative if two approvals are processed concurrently (one will succeed, one will fail and can retry).

**C) Idempotency of “final” approval**

- After you’ve updated the approval row and see “no pending left”, do a single atomic update on the request:  
  - `UPDATE leave_requests SET status = 'approved', decided_at = NOW(), decided_by = ? WHERE id = ? AND status = 'pending'`  
  - If rowCount = 0, do **not** deduct balance (request was already approved by another request); rollback and return 200 with `fullyApproved: true` or a message “Already approved.”  
- This prevents double balance deduction.

**Implementation note:** Your stack uses Neon serverless; ensure you use a single connection/session for the transaction (e.g. `BEGIN` / `COMMIT` / `ROLLBACK` in one flow). If the driver does not support transactions, use a single “approve” SQL that does: update approval, then conditional update of request and balance in one round-trip (e.g. a small stored procedure or a single transaction block in raw SQL).

---

## 5. Policy Snapshot on Leave Request (Historical Integrity)

### Problem
Policy/leave type updates might make it unclear what rules applied to a past request.

### Recommendation: **Store minimal snapshot on leave_requests**

- Add to `leave_requests` (nullable for backward compatibility):
  - `policy_snapshot jsonb NULL` — e.g. `{ "policyName": "...", "leaveTypeName": "...", "maxBalance": 21, "paid": true }` at apply time.  
- On `POST /api/leave/request`, when creating the row, set `policy_snapshot = { policyName, leaveTypeName, ... }` from current policy and leave type.  
- **Do not** use this for any business logic (balance, approval); keep using `leave_type_id` and FKs. Use only for **display and reports** (“This request was under Policy X, Leave type Y with max balance Z”).  
- Migration: add column, backfill from current `leave_types`/`leave_policies` for existing rows (one-time), then make it required for new inserts if you like.

---

## 6. Holiday Calendar (Business Days)

### Problem
Business-day calculation is Mon–Fri only; no holiday calendar.

### Recommendation: **Optional holiday table + use in count only**

- Add table:  
  - `leave_holidays (id, date UNIQUE, name, optional country/region if you ever need it)`.  
- When calculating `total_days` for a request (and when syncing attendance), use: “business day = weekday Mon–Fri **and** date not in `leave_holidays`”.  
- HR (or admin) can maintain holidays via a simple list UI; no need for multi-tenant or region engine.  
- Migration: create table; leave it empty so behaviour stays “Mon–Fri” until you add holidays.

---

## 7. Approval Chain (Keep Simple)

### Problem
Chain is fixed (manager → HR). Unclear if it should be configurable.

### Recommendation: **Keep fixed chain, document it**

- For an internal HRMS, a fixed “manager first, then HR if needed” is maintainable and predictable.  
- Avoid a generic “workflow engine” or configurable N-step chain for now.  
- If you need one extra variant (e.g. “some departments skip manager”), add a **single** flag on policy or leave_type, e.g. `skip_manager_approval boolean default false`, and in `buildApprovalChain` skip manager step when true; HR step can still be added.  
- Document the rule in code and in `LEAVE_MANAGEMENT_FLOW.md`: “Approval chain: Step 1 Manager (unless skip_manager_approval), Step 2 HR (if required or no manager).”

---

## 8. Schema Changes Summary

| Change | Purpose |
|--------|--------|
| `leave_approvals.acted_by_id` (varchar 255, nullable, FK employees) | Record who actually acted when HR acts on behalf of manager. |
| `leave_requests.policy_snapshot` (jsonb, nullable) | Display/report what policy/type looked like at apply time. |
| `leave_holidays` (id, date, name) | Optional holidays for business-day calculation. |
| Optional: `leave_policies.policy_year` (int, nullable) | Display “Policy for 2025” for year-end flows. |
| Optional: `leave_balance_years` | Only if you want explicit year-wise balance audit; otherwise skip. |

**No change** to: `leave_requests.leave_type_id` (keep FK to leave_types). No multi-tenant or tenant_id.

---

## 9. Safe Migration Order

1. **Add columns only (no data logic change)**  
   - `leave_approvals.acted_by_id` (nullable).  
   - `leave_requests.policy_snapshot` (nullable).  
   - Deploy; existing code unchanged.

2. **Backfill**  
   - One-time: set `policy_snapshot` for existing `leave_requests` from current `leave_types`/`leave_policies` (by leave_type_id).  
   - Leave `acted_by_id` NULL for past approvals.

3. **Behaviour changes in same or next release**  
   - In apply flow: set `policy_snapshot` on insert.  
   - In approve/reject: use transaction + status check + balance guard; set `acted_by_id` when HR acts on behalf; add HR override flag and audit.  
   - Optional: add `leave_holidays` and use in `countDays` and attendance sync.

4. **Year-end options**  
   - Implement “Clone policy for next year” and optional `policy_year` if you chose Option B for next-year policy.

---

## 10. Blind Spots to Watch

- **Leave type rename:** If HR renames a leave type, historical requests show the new name (same id). If you need “name as at request date”, that’s what `policy_snapshot.leaveTypeName` is for in UI/reports.  
- **Manager change mid-request:** If employee’s manager changes while request is pending, the approval rows still point to the old manager. Accept this (old manager can still approve or HR can override). Optional: when loading pending-approvals, show a warning if approver’s manager_id no longer matches the applicant’s manager_id.  
- **Accrual and balance init:** Ensure accrual and year-end run in a way that doesn’t double-apply (idempotent by month/year). You already have `last_accrual_at` / `last_reset_at`; keep using them.  
- **Attendance sync failure:** If `syncLeaveToAttendance` fails after balance is deducted, you have inconsistent state. Consider: run attendance sync inside the same transaction as balance deduction where possible, or add a small “sync status” on the request and a nightly job that re-runs sync for approved requests with status “pending_sync”.  
- **Audit:** Ensure every approve/reject/override and balance change logs to `leave_audit_log` with performed_by and metadata (including hrOverride / acted_by_id) so you have a clear trail.

---

## 11. Implementation Priority

| Priority | Item | Effort |
|----------|------|--------|
| P0 | Transaction + status check + balance guard on approve (Section 4) | Low |
| P0 | HR can act on any step + `acted_by_id` (Section 3A) | Low |
| P1 | Policy snapshot on request (Section 5) | Low |
| P1 | HR override flag + audit (Section 3B) | Low |
| P2 | Policy edit guardrails (Section 1) | Low (mostly UI + validation) |
| P2 | Year-end options doc + optional “clone policy” (Section 2) | Medium |
| P3 | Holiday table + use in countDays (Section 6) | Medium |
| P3 | Optional delegation table (Section 3, last para) | Low (only if needed) |

This keeps the current architecture, avoids over-engineering, and improves safety, flexibility, and auditability in a way that fits an internal HRMS.
