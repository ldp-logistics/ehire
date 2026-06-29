# Promotion and Increment: Flow and Logs

## How it works

Promotions and salary increments are handled through **compensation (salary revisions)**. There is no separate “promotion” or “increment” entity; both are recorded as **new rows in `salary_details`** with a **reason** (e.g. "Promotion", "Annual Appraisal").

---

## 1. Salary increment (no role change)

**Flow**

1. **HR/Admin** opens the employee profile → **Compensation** tab.
2. Clicks **Add New** (or equivalent) to add a new salary record.
3. Fills:
   - **Annual salary** (new amount)
   - **Start date** (effective date of the revision)
   - **Reason**: e.g. **"Annual Appraisal"**, **"Salary Correction"**, **"Probation Completion"**, or **"Other"**
   - Optional: pay rate, payout frequency, pay group, notes, etc.
4. Submits the form.

**Backend**

- **POST /api/compensation/:employeeId/salary**
- Marks the previous “current” salary row as `is_current = 'false'`.
- **Inserts** a new row in `salary_details` with:
  - `annual_salary`, `currency`, `start_date`, `reason`, etc.
  - `is_current = 'true'`
  - `updated_by = req.user.id` (the user who created the revision)
  - `created_at` / `updated_at` (set by the DB).

**Logs**

- **History = `salary_details` table.** Each row is one revision. You get a full history of salary changes by querying `salary_details` for that `employee_id` ordered by `start_date` (or `created_at`).
- **Who did it:** `updated_by` stores the user ID of the person who added/updated that record. There is no separate compensation_audit table; the table itself is the log. The Compensation tab currently shows “Updated on &lt;date&gt;” but not “Updated by”; you can add a lookup from `updated_by` to the user’s name/email if you want to show it in the UI.

---

## 2. Promotion (role change + salary change)

A promotion usually has two parts:

1. **New salary** (as above) with **Reason = "Promotion"**.
2. **Job/role change** (new title, grade, department, etc.) on the **employee** record.

**Flow**

1. **Add new salary (Promotion)**  
   - Compensation tab → Add New → set **Reason = "Promotion"**, new salary and start date → Save.  
   - This is the same as increment; only the reason differs.

2. **Update job/role (optional but usual)**  
   - Profile → **Edit** (Admin/HR) → change **Job title**, **Grade**, **Department**, etc. → Save.  
   - **PATCH /api/employees/:id** updates the employee row.

**Logs**

- **Salary side:** Again, the **`salary_details`** rows are the log. The row with reason `"Promotion"` and its `start_date`, `created_at`, `updated_by` is the record of the promotion’s compensation.
- **Job/role side:** Only the **current** employee fields are stored. There is **no built-in audit log** for changes to job_title, grade, department, etc. So you can see “current title/grade” but not “title changed on X by Y”.

---

## 3. Where the “logs” are

| What | Where it’s logged |
|------|--------------------|
| **Salary revisions** (increment, promotion salary) | **`salary_details`** – one row per revision; `reason`, `start_date`, `created_at`, `updated_at`, `updated_by`. |
| **Who added/updated a salary row** | **`salary_details.updated_by`** (user ID). |
| **Job/role changes** (title, grade, department) | **Not logged.** Only current state in `employees`. |

So: **increments and promotion-related salary changes are fully logged in `salary_details`**; **promotion-related job/role changes are not** unless you add an audit or change-request flow.

---

## 4. UI quick reference

**Compensation tab (employee profile)**

- **Add New** → new salary revision (increment or promotion salary).  
- **Reason** dropdown: New Inductee, **Annual Appraisal**, **Promotion**, Salary Correction, Probation Completion, Other.  
- List shows current salary and **history** of past revisions (with reason and date).  
- **Timeline** tab also shows “Compensation update” events from `salary_details` (date, reason, amount).

**Profile edit (Admin/HR)**

- **Edit** → change job title, grade, department, etc. for role changes.  
- No history of these edits in the app today.

---

## 5. Optional: better “promotion” and audit

If you want:

- **Single “promotion” action** that does both salary + job/role in one step, or  
- **Audit trail for job/role changes** (who changed title/grade when),

you could:

1. **Add an employee audit table** (e.g. `employee_field_audit`: employee_id, field_name, old_value, new_value, changed_at, changed_by) and write to it from **PATCH /api/employees/:id** for selected fields (job_title, grade, department, etc.).
2. **Add a “Promotion” workflow** in the UI: one form that (a) creates a salary revision with reason "Promotion" and (b) updates employee job_title/grade/department and (c) optionally writes to the audit table above.

Until then, **promotion/increment flow = add a salary revision (with the right reason) + optionally edit the employee record**, and **logs = `salary_details` (and `updated_by`) only for salary**.
