# Leave Management – User Guide

Step-by-step guide for **Employees** and **HR/Admins** to use Leave Management efficiently.

---

## For Employees

### 1. Open Leave (Employee view)

- Go to **Leave** in the main navigation (or **Employee View** from Leave Admin).
- You’ll see: **Overview**, **My Requests**, and **Team Calendar** in the sidebar.

---

### 2. Check your balance (Overview)

- On **Overview**, your leave balances are shown as cards (e.g. Earned Leave, LWOP).
- Balance is shown in **half-day steps** (e.g. 1.5, 2). The same value is used when you apply (no mismatch).
- Use this to see how many days you can take before applying.

---

### 3. Apply for leave

1. Click **Apply Leave** in the sidebar.
2. **Leave type**  
   - Choose the type (e.g. Earned Leave, LWOP).  
   - The label shows your balance (e.g. `Bal: 1.5 / 21`).  
   - If the type needs a document (e.g. medical), you must attach one before submitting.
3. **Start date** and **End date**  
   - Pick the first and last day of leave.
4. **Day type**  
   - **Full day** – whole day off.  
   - **1st half** or **2nd half** – half day (counts as 0.5 days).
5. **Total days**  
   - Shown automatically. Check that it’s correct and that you have enough balance (for paid leave).
6. **Add a note**  
   - Enter reason (optional but recommended).
7. **Attach supporting document** (if required)  
   - For types that require proof (e.g. medical), click **Upload file**.  
   - PDF or images, max 5MB. File is stored securely (e.g. SharePoint); only the link is saved.
8. **Notify others** (optional)  
   - Select colleagues to notify when you apply; they’ll see it in notifications.
9. Click **Apply time off**.  
   - If the leave is auto-approved, you’ll see that. Otherwise it goes to your manager/HR for approval.

**Tip:** If a leave type shows “requires a supporting document”, you must attach a file before the **Apply time off** button works.

---

### 4. My Requests

- Open **My Requests** to see all your leave requests (pending, approved, rejected, cancelled).
- **Filter** by status (All, Pending, Approved, Rejected, Cancelled) if needed.
- **Click a row** (or **View**) to open the **Time Off Request** detail:
  - Type, days, dates, comments.
  - **Applied on** – date and time you submitted.
  - **Approved by … on** / **Rejected by … on** – who decided and when (if decided).
- **Cancel**  
  - For **pending** requests only, use the **Cancel** button in the row to withdraw the request.

---

### 5. Team Calendar

- Open **Team Calendar** to see **approved** leave for the team (by month).
- **Click any leave block** (e.g. “John D. — Earned Leave”) to open the same **Time Off Request** detail (type, days, dates, applied/approved date and time).
- Use the arrows to change month.

---

### 6. Viewing leave on your profile

- In **Profile → Timeoff**, you see your balances and **Recent Leave History**.
- **Click a row** in Recent Leave History to open the request detail (applied/approved dates and times).
- Use **Apply time off** to submit a new request (same flow as above).

---

**Summary for employees**

| Action              | Where                    | Step |
|---------------------|--------------------------|------|
| See balance         | Leave → Overview         | Check cards before applying. |
| Apply leave         | Leave → Apply Leave      | Type, dates, half/full, reason, attachment if required, notify, then Submit. |
| See request detail  | My Requests / Calendar / Profile Timeoff | Click row or calendar block. |
| Cancel request      | My Requests              | Cancel button on a **pending** row only. |

---

## For HR / Admins

### 1. Open Leave Admin

- Go to **Leave** and then **Admin View** (or open **Leave Admin** from the app).
- Sidebar: **Overview**, **Approvals**, **Requests**, **Balances**, **Holidays**, **Year-End**, **Leave Types**, **FreshTeam** (HR-only sections visible to HR/Admin).

---

### 2. Approvals

- Open **Approvals** to see **pending** leave requests that need your action (manager or HR step).
- For each request you’ll see employee, type, dates, days, reason.
- **Order of approval:** The chain is built from the employee’s **reporting manager** (`manager_id` in the employee record), then **HR** when required (leave type needs HR, notice period, more than five days, or no manager). Step **1** is always the manager when present; HR is a later step. The system will not finalize a request until **all** steps are approved.
- **Reject** always applies to the **current** step (nothing earlier still pending). HR/Admin rows for a later step cannot be rejected until the manager step is decided.
- Use **Approve** or **Reject**. You can add remarks; for rejections, a reason is recommended.
- **HR override** (checkbox in Leave Admin): use when (a) acting **for** the assigned approver, or (b) **skipping** an earlier pending step (e.g. manager unavailable). With override on approve, earlier pending steps are auto-approved with an audit remark. Use only when appropriate; all actions are auditable.
- HR users also see **manager** steps for requests that include an HR step, so they can reject or override-approve at the manager step when needed.

---

### 3. All Requests / Team Requests

- **Requests** shows all (or your team’s) leave requests. Use search and status filter to find specific requests.
- **Click a row** to open **Time Off Request** detail:
  - Employee, type, days, dates, comments.
  - **Applied on** and **Approved/Rejected by … on** with date and time.
- **Delete**  
  - Use **Delete** in the detail modal to **permanently remove** a request (e.g. duplicate or test data).  
  - Confirm when prompted. For approved paid leave, balance and attendance are corrected before deletion.  
  - Use this only when necessary; prefer **Cancel** for employees’ own pending requests.

---

### 4. Apply on behalf of an employee

Use this when an employee **forgot to apply** but already took the days (e.g. backfill).

**Option A – From Leave Admin**

1. In **Leave Admin → Requests**, click **Apply on behalf of employee**.
2. In the dialog, select the **Employee** from the dropdown.
3. Click **Continue**.
4. The standard **Apply for Leave** form opens for that employee. Fill:
   - Leave type, start/end date, day type, reason.
   - Attach a document if the leave type requires it.
   - Add “Notify others” if needed.
5. Click **Apply time off**. The request is created for the selected employee and follows the same approval/auto-approval rules.

**Option B – From Employee Profile**

1. Open **Employees** and select the employee.
2. Go to the **Timeoff** tab.
3. Click **Apply time off on behalf**.
4. Complete the same **Apply for Leave** form (type, dates, reason, attachment if required).
5. Submit. The request is created for that employee.

---

### 5. Balances (HR)

- Open **Balances** to see **all employees’** leave balances (by leave type).
- **Set balance** – Set a new balance for Earned Leave (e.g. after carry-forward or correction). Provide a reason.
- **Add days** – Add days to an employee’s Earned Leave balance. Provide a reason.
- **Initialize** – If an employee has no balance row yet, use **Initialize** (per policy) so they appear in the list; then use Set/Add as needed.

---

### 6. Holidays

- Open **Holidays** to see and manage company holidays (used for business-day and balance calculations).
- Add holidays so that leave and accruals exclude these dates.

---

### 7. Year-End

- Open **Year-End** when running the annual reset (e.g. Earned Leave reset, Bereavement top-up).
- Follow the wizard: choose policy approach (continue / modify / new), set dates and leave types if needed, then run the reset.
- After reset, you can add carry-forward or adjustments in **Balances** if your policy allows.

---

### 8. Leave Types

- Open **Leave Types** to view and edit leave types (Earned Leave, LWOP, Bereavement, etc.).
- You can edit rules: accrual, max balance, require document, require approval, auto-approve rules, min/max days, blocked during notice, etc.
- Changes apply to new requests and policies as configured.

---

### 9. Automatic accrual on the server (production)

FreshTeam accrual runs on **their** servers. On **your** server, balances only increase when accrual runs.

- **Manual:** Settings → Leave → Leave types → **Run leave accrual now**, or `POST /api/leave/accrue` (HR/admin).
- **Automatic (deploy):** set in `.env`:
  - `ENABLE_LEAVE_ACCRUAL_CRON=true`
  - `DEFAULT_TIMEZONE=Asia/Karachi` (or your IANA zone — same as “today” for the app)
  - Optional: `LEAVE_ACCRUAL_CRON=0 0 1 * *` (default = **00:00 on the 1st** of each month in that timezone; set e.g. `0 2 1 * *` for 02:00 on the 1st only, or `0 2 * * *` for daily)

Until `ENABLE_LEAVE_ACCRUAL_CRON=true`, no background job runs (safe for local dev).

---

### 10. FreshTeam (if configured) — **temporary migration aid**

- FreshTeam **sync** and **migrate requests** exist only to **pull current data into LDP** while you move off FreshTeam. They are **not** the long-term source of truth.
- After cutover, leave should run entirely on **LDP policies, balances, approvals, and year-end**—use FreshTeam actions only as needed until historical data and balances are aligned, then rely on the app.
- **Sync balances** — align HRMS with FreshTeam during transition.
- **Migrate requests** — imports FreshTeam time-offs from **2026-01-01** onward (through 2030-12-31).

---

### 11. Employee Profile – Timeoff tab

- When viewing any **Employee → Timeoff**:
  - You see their balances and **Recent Leave History**.
  - **Click a row** to open request detail (applied/approved date and time).
  - Use **Delete** in the detail modal to remove an irrelevant or duplicate request (with confirmation).
  - Use **Apply time off on behalf** to submit a new request for that employee (same as “Apply on behalf” from Leave Admin).

---

**Summary for HR/Admins**

| Action                | Where                    | Step |
|-----------------------|--------------------------|------|
| Approve/Reject        | Leave Admin → Approvals  | Open each request, Approve or Reject with remarks/reason. |
| View all requests     | Leave Admin → Requests   | Use search/filter; click row for detail (dates/times). |
| Delete a request      | Request detail modal     | Open any request (Admin/Requests or Profile/Timeoff), click Delete, confirm. |
| Apply on behalf       | Leave Admin → Requests or Employee → Timeoff | “Apply on behalf of employee” or “Apply time off on behalf”, pick employee, fill form, submit. |
| Adjust balances       | Leave Admin → Balances   | Set balance, Add days, or Initialize as needed. |
| Configure holidays    | Leave Admin → Holidays   | Add/edit company holidays. |
| Year-end reset        | Leave Admin → Year-End   | Run wizard; then adjust carry-forward in Balances if needed. |
| Configure leave types | Leave Admin → Leave Types| Edit rules (document, approval, accrual, etc.). |

---

## Quick reference

| Role      | Apply leave        | Cancel request     | Delete request | Apply on behalf | View detail (date/time)     |
|-----------|--------------------|--------------------|----------------|------------------|-----------------------------|
| Employee  | Leave → Apply Leave| My Requests (pending only) | No  | No               | My Requests, Calendar, Profile |
| HR/Admin  | Same + on behalf   | No (employee cancels own)  | Yes (detail modal) | Requests or Profile | Requests, Profile, Calendar |

---

*Keep this guide handy so employees and HR/Admins follow the same steps and use Leave Management consistently.*
