# Onboarding Module — UI/UX & System Architecture Recommendations

**Role:** Senior Product Designer & System Architect  
**Scope:** Onboarding workflow analysis, optimized UI/UX flow, system structure, and scalability.  
**No implementation** — design and architecture only.

---

## 1. Current System Flow (Summary)

### 1.1 Entry points (as-is)

| Trigger | Location | Result |
|--------|----------|--------|
| **Send Checklist** | Employees list (employee card, status = Onboarding) | Navigate to `/onboarding?employeeId=...` → if no record: template picker → section/assignee/task editor → initiate. |
| **Start onboarding** | Employee Profile | POST legacy create (empty record) → redirect to `/onboarding`. |
| **Direct** | Sidebar → Onboarding | List view (cards left, detail right); assignees see only records where they are section assignees. |

### 1.2 Current UI structure (as-is)

- **Single page** `/onboarding`: list (left column) + detail (right 2 columns).
- **List:** Two groups — "Incoming Hires" (in_progress cards with progress bar) and "Completed" (green-tinted cards). No table, no filters, no search, no sort.
- **Initiate flow:** Inline in the same page when `?employeeId=` and no record: Step 1 = template dropdown + Next; Step 2 = expandable sections with assignee search and task list; Initiate button.
- **Detail:** Either sectioned view (expand/collapse sections, assignees per section, tasks with complete/Assign/Edit) or legacy flat task list. Progress bar, Complete Onboarding button, Delete (admin/hr), Resend Welcome (placeholder).
- **Templates:** Separate route `/onboarding-templates` (admin); not part of the main onboarding flow except as a dropdown source.

### 1.3 Current logic (checklist)

- Tasks live under **sections** (from template) or unsectioned (legacy).
- **Section assignees** = employees responsible for that section; only they (and admin/hr) can complete tasks in that section.
- **requires_assignment** = task cannot be marked complete until assignment details are saved.
- **Complete onboarding** = all tasks done → PATCH status completed → employee status set to Active.
- Side effects: work-email task completion → sync to employee; laptop task with stock id → assign from stock.

---

## 2. Usability Problems, Bottlenecks, Missing UI

### 2.1 Discoverability & entry

- **Two ways to start onboarding** (Send Checklist vs Start onboarding) with different outcomes (template-based vs empty) cause confusion; no single “Create onboarding” path.
- **Send Checklist** is only visible on Employees when status is already “Onboarding”; no clear path to “add checklist for a new hire” from Onboarding itself.
- **Templates** live on a separate nav item; HR may not associate “Onboarding Templates” with “send a checklist” when on the Onboarding page.
- **No onboarding dashboard** (counts, overdue, due this week, my tasks); users land on a list with no context.

### 2.2 List & overview

- **No search** (by name, department, role).
- **No filters** (status, department, template, date range, assignee).
- **No sort** (start date, progress, name).
- **Card-only list** doesn’t scale (10+ hires); no compact table view.
- **No bulk actions** (e.g. send reminder, export).
- **Assignees** see a filtered list but get no “My tasks” or “Due for me” emphasis.
- **No due dates** on onboarding (only “Starts …”); no “due by” or “overdue” indication.

### 2.3 Initiate flow

- **Step 2** is dense: all sections expanded, assignee search inline, task add/remove; no clear “required vs optional” and easy to miss assignees.
- **No validation** before Initiate (e.g. “Section X has no assignee”).
- **No preview** of what the new hire (or assignees) will see.
- **No option to schedule** start date or send email notification from this flow.
- **Back** from Step 2 loses step state if user navigates away; no draft save.

### 2.4 Detail / checklist

- **Sections and legacy tasks** on one page; two different UIs (sectioned vs flat) for different records increase cognitive load.
- **Progress** is global; no per-section progress or “blocked” state (e.g. section 1 must be 100% before section 2).
- **Assignment details** live in a modal; no inline edit for simple text; “Assign” vs “Edit” badge is easy to miss.
- **Resend Welcome** is non-functional (placeholder).
- **No timeline** (when tasks were completed, by whom).
- **No comments/notes** on tasks or record.
- **Delete** is easy to hit (no “Archive” or soft delete); no confirmation that explains impact (e.g. “Employee will remain in Onboarding status”).

### 2.5 Roles & communication

- **New hire view** is not defined: can the new hire see their own checklist (read-only or self-service)? Currently only assignees and admin/hr have a clear path.
- **No notifications** to assignees when a checklist is sent or when a task is assigned to them.
- **No reminder** (e.g. “3 tasks pending for 5+ days”).
- **Manager** role can open Onboarding but “Send Checklist” is only from Employees; no manager-specific dashboard (e.g. “My team’s onboarding”).

### 2.6 Templates

- **Template management** is a separate screen; no “Create from template” or “Edit template” from within an onboarding record.
- **No template preview** (view-only) before choosing in Step 1.
- **Department/template** match (e.g. suggest “Finance” template for Finance hire) is not surfaced in UI.
- **Clone/customize** template for one hire is not explicit (user edits in Step 2 but may not realize it only affects this record, not the template).

---

## 3. Improved UI Flow (Best Practices: Freshteam, BambooHR, Workday)

### 3.1 Principles applied

- **Single primary path** to create onboarding (one CTA, one wizard).
- **Dashboard first** for HR/Admin (overview, then drill down).
- **Role-based home:** Admin/HR = all onboardings + templates; Manager = team onboardings + my assignee tasks; Employee = my assigned tasks only.
- **Table + filters + search** for list; cards/kanban as optional view.
- **Clear phases:** Setup (create + assign) → Track (checklist execution) → Complete (sign-off, archive).
- **Audit and timeline** visible (who did what, when).
- **Templates** discoverable from the create flow and manageable in one place.

### 3.2 Recommended high-level flow

1. **Onboarding home (dashboard)**  
   - Tabs or sections: **All onboarding** | **My tasks** | **Completed** (optional: **Templates** for admin).  
   - Summary cards: e.g. In progress, Overdue / Due this week, Completed this month.  
   - Primary CTA: **Add onboarding** (or **Send checklist**).

2. **Add onboarding (wizard)**  
   - Step 1: **Select employee** (search; filter by department/status). If already has onboarding, show message and link to it.  
   - Step 2: **Choose template** (list with name, department, description; optional “Preview”). Suggest by employee department. Allow “Start from scratch” for custom.  
   - Step 3: **Customize checklist** (sections, assignees per section, add/remove tasks). Show warnings (e.g. “No assignee in section X”).  
   - Step 4: **Review & send** (summary, optional start date, “Notify assignees” checkbox).  
   - Submit → create record + optional notifications → redirect to new onboarding detail or list.

3. **List (All onboarding)**  
   - **Table** by default: columns e.g. New hire, Department, Template, Progress, Assignees, Start / Due, Status, Actions.  
   - **Filters:** Status, Department, Template, Date range, Assignee (for admin).  
   - **Search:** By new hire name or ID.  
   - **Sort:** Start date, progress, name.  
   - **Row actions:** Open, Send reminder, (Admin) Edit / Delete / Complete.  
   - **View toggle:** Table | Cards (current-style cards for those who prefer).

4. **My tasks (assignee view)**  
   - List or cards of **onboarding records** where I am assignee, with **my** pending tasks highlighted (count, due if applicable).  
   - Click → go to onboarding detail with focus on “My sections” or “My tasks”.

5. **Onboarding detail (record view)**  
   - **Header:** New hire name, department, template name, status, progress, primary actions (Complete onboarding, Delete/Archive, Resend welcome when implemented).  
   - **Tabs:** e.g. **Checklist** | **Timeline** | **Notes** (future).  
   - **Checklist tab:** Sections (expand/collapse), assignees per section, tasks with complete + assignment details; inline or modal for details; add task (admin/hr) per section.  
   - **Timeline tab:** Chronological log (created, section/task completed, by whom, when).  
   - **Notes:** Optional free-form notes on the record (future).

6. **Templates (admin)**  
   - **List:** Name, department, sections/tasks count, last updated.  
   - **Create / Edit:** Section and task CRUD; set default assignees by role/department (future).  
   - Accessible from **Onboarding** (e.g. “Manage templates”) and from sidebar.

7. **Completion**  
   - **Complete onboarding** CTA when 100%; confirmation modal (e.g. “Employee will be set to Active. Continue?”).  
   - Post-complete: record moves to “Completed”; optional success message and link to employee profile.

---

## 4. Screen Hierarchy, Navigation, Role-Based Access

### 4.1 Screen hierarchy

```
Onboarding (module root)
├── Dashboard / Home
│   ├── Summary cards (in progress, overdue, completed, my tasks count)
│   ├── Primary CTA: Add onboarding
│   └── Tabs: All | My tasks | Completed [| Templates]
│
├── All onboarding (list)
│   ├── Toolbar: search, filters, sort, view toggle (table | cards)
│   ├── Table (or cards)
│   └── Row/card actions → Detail or quick actions
│
├── My tasks (list for assignees)
│   └── Same as All but filtered + “my pending tasks” emphasis
│
├── Add onboarding (wizard, modal or full page)
│   ├── Step 1: Employee
│   ├── Step 2: Template
│   ├── Step 3: Customize (sections, assignees, tasks)
│   └── Step 4: Review & send
│
├── Onboarding detail (single record)
│   ├── Header (name, status, progress, actions)
│   ├── Tabs: Checklist | Timeline [| Notes]
│   └── Checklist: sections → tasks; Timeline: audit log
│
└── Templates (admin)
    ├── Template list
    └── Template create/edit (sections + tasks)
```

### 4.2 Navigation structure

- **Sidebar (People):**  
  - **Onboarding** → lands on **Onboarding dashboard** (not directly list).  
  - **Onboarding templates** → stays; ensure label is clear (e.g. “Checklist templates”) and that from Onboarding there is a link “Manage templates”.

- **Within Onboarding:**  
  - **Breadcrumb:** Onboarding > All onboarding | Onboarding > [New hire name] | Onboarding > Add onboarding.  
  - **Tabs on dashboard:** All | My tasks | Completed (and Templates for admin).  
  - **Detail:** Tabs Checklist | Timeline (and Notes if added).  
  - No nested sidebar; keep all under one module.

- **Entry from other modules:**  
  - **Employees:** “Send checklist” (or “Start onboarding”) → open **Add onboarding** wizard with employee pre-selected (Step 1 done).  
  - **Employee profile:** “Start onboarding” → same wizard, employee pre-selected.  
  - **Recruitment (after hire):** “Send onboarding checklist” → wizard, employee pre-selected.  
  - **Dashboard:** Widget “Onboarding” with count + link to Onboarding dashboard or list.

### 4.3 Role-based access (recommended)

| Role    | Dashboard | List view      | Add onboarding | Detail        | Complete/Delete | Templates |
|---------|-----------|----------------|----------------|---------------|-----------------|-----------|
| Admin   | Full      | All            | Yes            | Full edit     | Yes             | Full CRUD |
| HR      | Full      | All            | Yes            | Full edit     | Yes             | View, use (create/edit if desired) |
| Manager | Team only*| Team records   | Yes (team)     | View + assignee tasks | No (or configurable) | View, use |
| Employee| My tasks  | Assignee only  | No             | Assignee sections only | No        | No |

*Manager “team” = direct reports or configurable scope.

- **List:** Admin/HR see all; Manager sees team; Employee sees records where they are section assignee.  
- **Detail:** Admin/HR see and edit everything; Manager sees full record but may only complete tasks in sections they’re assigned to; Employee sees only “My tasks” (sections they’re assignee for).  
- **Add onboarding:** Restrict to Admin/HR (and optionally Manager for their team).  
- **Templates:** Admin full CRUD; HR at least view and use in wizard; Manager/Employee no access (or view-only for Manager if needed).

---

## 5. UI Components Recommendation

### 5.1 Dashboard

- **Summary cards:** Small cards with number + label (e.g. “12 In progress”, “2 Overdue”, “5 My tasks”); clickable to filtered list.  
- **Primary button:** “Add onboarding” (or “Send checklist”) prominent.  
- **Tabs:** Tab list (All | My tasks | Completed | Templates) for content below.  
- **Optional:** Mini table “Recent” or “Due soon” (5–10 rows).

### 5.2 List (All onboarding / My tasks / Completed)

- **Toolbar:**  
  - Search (text input, search by new hire name or ID).  
  - Filters: Status (in progress, completed), Department, Template, Assignee (admin), Date range (start or due).  
  - Sort dropdown (e.g. Start date, Progress, Name, Department).  
  - View toggle: Table | Cards.  
  - Optional: Bulk actions (e.g. Send reminder) when rows selected.

- **Table (default):**  
  - Columns: New hire (avatar + name), Department, Template, Progress (bar + %), Assignees (avatars or count), Start date, Due (if added), Status, Actions (Open, ⋮ menu).  
  - Row hover: highlight; click row or “Open” → detail.  
  - Pagination or infinite scroll if list is large.

- **Cards (optional):**  
  - Current-style cards for “In progress” and “Completed”; keep compact (avatar, name, role, department, progress bar, primary action).

### 5.3 Add onboarding (wizard)

- **Container:** Full-page wizard or large modal (steps clearly numbered).  
- **Step 1:** Employee select (typeahead/search, recent or department filter). Validation: “Already has onboarding” → message + link.  
- **Step 2:** Template grid or list (card per template: name, department, short description); “Preview” opens read-only modal; “Start from scratch” option.  
- **Step 3:** Sections as accordions or cards; per section: assignee multi-select (search), task list (add/remove, requires-assignment badge); validation messages (e.g. “Add at least one assignee to Section X”).  
- **Step 4:** Summary (employee, template, section count, assignee count); optional “Start date” and “Notify assignees”; Submit.  
- **Navigation:** Back / Next; step indicator (1–4); Cancel with confirm if data entered.

### 5.4 Onboarding detail

- **Header:**  
  - Title: “[New hire name] – Onboarding”.  
  - Meta: Department, template name, status badge, progress (e.g. “8/12 tasks”).  
  - Actions: Complete onboarding (primary), Resend welcome, Delete/Archive (danger, with confirm).

- **Tabs:**  
  - **Checklist:** Sections (accordion or cards); per section: assignee chips, task rows (checkbox, title, assignment details link/button, optional “Required” badge). Inline add task (admin/hr).  
  - **Timeline:** Vertical timeline of events (created, task completed, by whom, when).

- **Task row:**  
  - Checkbox (or icon) for complete; task title; assignment details (inline short text or “Edit” opening modal); “Required” badge if applicable; for admin/hr: delete task.  
  - Modal for assignment details when field is long or structured (e.g. email, stock ID).

- **Section:**  
  - Header: section name, description (optional), progress (e.g. 3/5), assignee avatars; expand/collapse.  
  - Body: assignee list (with add/remove for admin/hr), task list, add task (admin/hr).

### 5.5 Templates (admin)

- **List:** Table: Name, Department, # Sections, # Tasks, Last updated, Actions (Edit, Duplicate, Delete).  
- **Create/Edit:** Form: name, description, department; then section list (add section, reorder); per section: name, description, task list (add/remove/reorder, requires_assignment).  
- **Preview:** Read-only view of template structure (sections + tasks) before use in wizard.

### 5.6 Modals and dialogs

- **Confirm Complete onboarding:** “Mark this onboarding as complete? The employee’s status will be set to Active.” [Cancel] [Complete].  
- **Confirm Delete:** “Delete this onboarding? Progress will be lost. The employee will remain in Onboarding status.” [Cancel] [Delete].  
- **Assignment details:** Modal with label, input (or dropdown for laptop/stock), Save/Cancel.  
- **Add assignee:** Search/dropdown (employees), multi-select, Add.  
- **Add task:** Name, “Requires assignment” checkbox, optional section (if multiple), Add.

---

## 6. Approval Flow (Recommendations)

### 6.1 Current state

- There is **no approval workflow** today: tasks are completed by section assignees (or admin/hr); “Complete onboarding” is a single action when all tasks are done; employee status is updated automatically.

### 6.2 Optional approval flow (for future)

If you want to align with systems like Workday/BambooHR:

- **Option A – Section sign-off**  
  - When all tasks in a section are done, section is “Ready for sign-off”.  
  - A designated “section approver” (could be manager or HR) must **approve section** before the next section is “active” or before the whole onboarding can be completed.  
  - UI: Section header shows “Pending approval” and an “Approve section” action for approver.

- **Option B – Final HR approval**  
  - When all tasks are 100%, status becomes “Pending HR approval”.  
  - HR (or admin) must click **Approve & complete onboarding**; then employee is set to Active.  
  - UI: “Complete onboarding” becomes “Submit for approval” for owner; HR sees “Pending approval” list and “Approve” on detail.

- **Option C – No formal approval**  
  - Keep current behaviour: any admin/hr can click “Complete onboarding” when checklist is 100%.  
  - Rely on assignee completion as implicit “approval” of their section.

**Recommendation:** Start with **Option C** for simplicity. Introduce **Option B** if compliance or policy requires explicit HR sign-off; add **Option A** only if you need section-level gates (e.g. IT must sign off before Facilities).

### 6.3 Audit (already partially there)

- **Timeline tab** on detail = audit of “created”, “task X completed by Y at Z”, “onboarding completed”.  
- Backend already has section/task/record data; ensure **audit events** (who completed which task, when) are stored and exposed for the Timeline tab.

---

## 7. Database / System Improvements (If Needed)

### 7.1 Optional schema additions

- **onboarding_records:**  
  - **due_date** (date, nullable): optional “due by” for the whole onboarding.  
  - **start_date** (date): formal start (default created_at or employee join_date).  
  - **completed_by** (user or employee id): who clicked “Complete onboarding”.  
  - **notes** (text): free-form record notes (if you add Notes tab).

- **onboarding_tasks:**  
  - **completed_by** (user/employee id): who marked the task complete.  
  - **completed_at** already exists; **completed_by** enables Timeline “by whom”.

- **Approval (if you add Option B):**  
  - **onboarding_records.status:** add value e.g. `pending_approval`.  
  - **onboarding_approvals** (optional table): record_id, requested_at, requested_by, approved_at, approved_by, comments.

- **Notifications:**  
  - Table or use existing notifications: “Onboarding assigned to you”, “Task X completed”, “Onboarding completed for [name]”.  
  - Prefer event-driven: on initiate → notify assignees; on task complete → notify record owner or next assignee (if you define “next”).

### 7.2 System / non-DB

- **Single “create” path:** Deprecate or hide legacy “Start onboarding” (empty record) from Employee Profile; make **Add onboarding** wizard the only path, with employee pre-selected when coming from profile/employees/recruitment.  
- **Template suggestion:** In wizard Step 2, suggest template by employee department (template.department = employee.department).  
- **Draft:** If wizard is long, consider “Save as draft” (record created with status draft, no assignee notifications until “Send”).  
- **Reminders:** Scheduled job or manual “Send reminder” to assignees with pending tasks (e.g. list assignees + pending count, trigger email/in-app).

---

## 8. Step-by-Step UI Structure (Onboarding with Checklist)

### 8.1 For HR/Admin – Sending a checklist

1. **Start**  
   - From **Onboarding** dashboard: click **Add onboarding**.  
   - Or from **Employees** or **Employee profile**: click **Send checklist** (or **Start onboarding**) → wizard opens with employee pre-selected.

2. **Step 1 – Select employee**  
   - Search/select employee (if not pre-selected).  
   - If employee already has an active onboarding: show message and link “View existing onboarding”.  
   - Next.

3. **Step 2 – Choose template**  
   - List/grid of templates (name, department, short description).  
   - Optional: “Suggested for [Department]” for matching template.  
   - Optional: “Preview” to see sections and tasks.  
   - Option: “Start from scratch” (no template, add sections in Step 3).  
   - Next.

4. **Step 3 – Customize checklist**  
   - One block per section (from template or empty).  
   - Per section:  
     - Section name (editable).  
     - Assignees: search and add employees (at least one required, or show warning).  
     - Tasks: list from template; add/remove tasks; mark “Requires assignment” per task.  
   - Validation: e.g. “Section ‘IT Access’ has no assignee.”  
   - Back / Next.

5. **Step 4 – Review & send**  
   - Summary: Employee name, template name, N sections, total M tasks, assignees list.  
   - Optional: Start date, “Notify assignees” checkbox.  
   - **Initiate** → create record + optional notifications → success message + redirect to new onboarding detail or list.

6. **After create**  
   - User lands on onboarding detail (or list with new record selected).  
   - Assignees (if notified) see the record under “My tasks” and can open to complete their sections.

### 8.2 For HR/Admin – Managing and completing

1. **List**  
   - Open **Onboarding** → **All** tab.  
   - Use search/filters to find record; click row or **Open**.

2. **Detail – Checklist tab**  
   - See sections; expand section.  
   - See assignees per section; add/remove assignees (admin/hr).  
   - See tasks; click **Assign**/Edit to add assignment details; toggle complete (or assignee does).  
   - Add task to section (admin/hr).  
   - When progress = 100%, **Complete onboarding** is enabled.

3. **Complete**  
   - Click **Complete onboarding** → confirmation modal → confirm → status = completed, employee = Active.  
   - Record moves to Completed list/tab; optional success message.

### 8.3 For assignee (e.g. IT, manager)

1. **My tasks**  
   - Open **Onboarding** → **My tasks** tab.  
   - See onboarding records where I am assignee; see my pending task count per record.

2. **Open record**  
   - Click record → detail opens.  
   - See only sections I’m assignee for (or full checklist with “My sections” highlighted).  
   - In my sections: open task → add assignment details if required → mark complete.

3. **No access**  
   - Cannot add/remove assignees or tasks; cannot complete the whole onboarding (only admin/hr).

### 8.4 For new hire (future)

- If you add a **new hire view** (read-only or self-service):  
  - **Onboarding** → “My onboarding” (single record for current user as employee).  
  - Show checklist read-only (or allow self-service tasks like “Upload documents”, “Acknowledge policy”).  
  - No assignee management, no “Complete onboarding” button.

---

## 9. Scalability and Ease for HR/Admin/Managers

- **Dashboard first:** One place to see counts and “what needs attention” (overdue, my tasks).  
- **Table + filters + search:** Handles 50+ onboardings without clutter.  
- **Single wizard:** One path to create; no “empty” vs “template” split.  
- **Templates:** Reuse and suggest by department; admin maintains in one place.  
- **Role-based views:** Managers see team; assignees see “My tasks”; admin/hr see all and manage.  
- **Timeline:** Clear audit of who did what, when (support and compliance).  
- **Optional due dates and reminders:** Keeps onboarding from stalling.  
- **Optional approval:** Add when policy requires (e.g. HR sign-off before Active).  
- **Notifications:** Notify assignees on assign; optional reminder for pending tasks.  
- **No duplicate flows:** One “Add onboarding” from Onboarding, Employees, Profile, or Recruitment, with context (employee) pre-filled where possible.

---

## 10. Summary

| Area | Current | Recommended |
|------|---------|-------------|
| **Entry** | Two paths (Send Checklist, Start onboarding), templates separate | Single “Add onboarding” wizard; employee pre-filled from context; templates in wizard |
| **List** | Cards only, no search/filter/sort | Dashboard with tabs; table (default) + filters + search + sort; optional cards |
| **Detail** | List + detail on one page; sectioned vs flat | Dedicated detail with header + tabs (Checklist, Timeline); one sectioned UX |
| **Roles** | Admin/hr vs assignee list filter | Dashboard “My tasks” for assignees; manager team scope; clear permissions |
| **Approval** | None | Keep as-is; optional “Pending HR approval” + Approve later |
| **Templates** | Separate nav, used in dropdown | Same nav + “Manage templates”; suggest by department in wizard; preview |
| **Audit** | Not in UI | Timeline tab (who completed what, when) |
| **DB** | Sufficient for current | Optional: due_date, start_date, completed_by, notes; approval table if needed |

This document is the **product and system design baseline** for an optimized onboarding experience; implementation can follow it in phases (e.g. dashboard + list first, then wizard, then Timeline and optional approval).
