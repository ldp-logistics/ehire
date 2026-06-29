# Onboarding Module — Full Flow Analysis

End-to-end flow: database, backend, frontend, and wiring after migrations **0058** (templates/sections) and **0059** (requires_assignment).

---

## 1. Database

### 1.1 Core tables (schema: `server/db/schema/onboarding.ts`)

| Table | Purpose |
|-------|--------|
| **onboarding_records** | One row per employee onboarding. `employee_id`, `owner_id` (user), `template_id` (optional, FK to template), `status` (`in_progress` \| `completed`), `completed_at`, timestamps. |
| **onboarding_tasks** | Checklist items. `onboarding_record_id`, `section_id` (optional, FK to record section), `task_name`, `category`, `completed` (boolean), `assignment_details`, `completed_at`, `sort_order`, `requires_assignment` (boolean, default true). |

### 1.2 Template system (migration 0058)

| Table | Purpose |
|-------|--------|
| **onboarding_templates** | Named templates (e.g. "Onboarding and Orientation (Basic)", "Finance - Employee Onboarding Due diligence"). `name`, `description`, `department`, `is_active`, `created_by_id`. |
| **onboarding_template_sections** | Sections within a template (e.g. "General Information", "System Access"). `template_id`, `name`, `description`, `sort_order`. |
| **onboarding_template_tasks** | Default tasks per template section. `section_id`, `task_name`, `sort_order`, `requires_assignment` (0059, default true). |
| **onboarding_record_sections** | Sections created for a specific onboarding (copied from template at initiation). `record_id`, `template_section_id` (optional), `name`, `description`, `sort_order`. |
| **onboarding_record_section_assignees** | Assignees per record section (who is responsible for that section). `section_id`, `employee_id`, UNIQUE(section_id, employee_id). |

### 1.3 Relations and constraints

- **onboarding_records**: FK to `employees`, `users`; optional FK to `onboarding_templates`.
- **onboarding_tasks**: FK to `onboarding_records` (CASCADE delete); optional FK to `onboarding_record_sections` (SET NULL).
- **onboarding_record_sections**: FK to `onboarding_records` (CASCADE delete); optional FK to `onboarding_template_sections`.
- **onboarding_record_section_assignees**: FK to `onboarding_record_sections` (CASCADE), `employees` (CASCADE).

### 1.4 Migrations

- **0003**: Create onboarding_records, onboarding_tasks.
- **0004**: Add `onboarding` to employment_status enum.
- **0058**: Template tables + record_sections + assignees; add `template_id` on records, `section_id` on tasks; seed 6 templates (Basic, Finance, Operations, Sales & Marketing, IT, HR).
- **0059**: Add `requires_assignment` (boolean, default true) on template_tasks and onboarding_tasks.

---

## 2. Backend

### 2.1 Routes

**Onboarding** (`server/modules/onboarding/onboarding.routes.ts`) — base path `/api/onboarding`:

| Method | Path | Auth | Handler | Purpose |
|--------|------|------|---------|---------|
| GET | `/` | requireAuth | list | List records (admin/hr: all; others: only where current user is section assignee). |
| GET | `/employee/:employeeId` | requireAuth, admin/hr | getByEmployee | Get onboarding record for one employee. |
| GET | `/:id` | requireAuth | getById | Get one record with tasks, sections, assignees (assignees can only open if they’re assignee of that record). |
| POST | `/` | requireAuth, admin/hr | create | **Legacy**: create record with no sections/tasks (body: `employeeId`). |
| POST | `/initiate` | requireAuth, admin/hr | initiate | **New**: create record + sections + assignees + tasks from template (body: `InitiateOnboardingDTO`). |
| PATCH | `/:id` | requireAuth, admin/hr | update | Update status, completedAt. |
| DELETE | `/:id` | requireAuth, admin/hr | remove | Delete record (tasks and record_sections cascade). |
| POST | `/:id/tasks` | requireAuth, admin/hr | addTask | Add task (body: taskName, sectionId?, requiresAssignment?). |
| PATCH | `/:id/tasks/:taskId` | requireAuth | updateTask | Toggle complete / set assignment details (admin/hr or section assignee for that task). |
| DELETE | `/:id/tasks/:taskId` | requireAuth, admin/hr | removeTask | Delete a task. |
| POST | `/:id/sections/:sectionId/assignees` | requireAuth, admin/hr | addAssignee | Add assignee to section (body: employeeId). |
| DELETE | `/:id/sections/:sectionId/assignees/:employeeId` | requireAuth, admin/hr | removeAssignee | Remove assignee. |

**Templates** (`server/modules/onboarding/templates/onboarding-templates.routes.ts`) — base path `/api/onboarding-templates`:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | requireAuth, admin/hr | List templates. |
| GET | `/:id` | requireAuth, admin/hr | Get template with sections and tasks. |
| POST | `/` | requireAuth, admin | Create template. |
| PUT | `/:id` | requireAuth, admin | Update template. |
| DELETE | `/:id` | requireAuth, admin | Soft-delete template. |
| POST/PUT/DELETE | `/:id/sections/...` and `.../tasks/...` | requireAuth, admin | Section and task CRUD. |

### 2.2 Service behaviour (summary)

- **listAll(actor)**  
  - Admin/HR: all records.  
  - Other: only records where the current user’s employee is in `onboarding_record_section_assignees` for that record.

- **getRecord(id, actor)**  
  - Loads record, tasks, sections, assignees.  
  - Non–admin/hr: must be assignee of the record (via any section) or 403.

- **createRecord(employeeId, ownerId)** (legacy)  
  - Validates employee (not offboarded/terminated), no existing onboarding.  
  - Inserts one row in `onboarding_records` (no template, no sections, no tasks).  
  - Returns DTO with empty `tasks` and `sections`.

- **initiateOnboarding(dto, ownerId)** (new)  
  - Validates employee, no existing onboarding.  
  - Calls `repo.initiateWithSections(employeeId, ownerId, templateId, sections)`:  
    - Insert `onboarding_records` (with optional `template_id`).  
    - For each section: insert `onboarding_record_sections`, then assignees, then `onboarding_tasks` (with `section_id`, `requires_assignment` from template or default true).  
  - Returns full record (getRecord) with tasks and sections.

- **updateTask(recordId, taskId, completed?, assignmentDetails?, actor?)**  
  - Non–admin/hr: must be assignee of the task’s section.  
  - If task has `requires_assignment` and `completed === true`, assignment details must be non-empty.  
  - On complete: if task looks like “Microsoft/work email” and details look like email → `setEmployeeWorkEmail`; if “laptop” and details contain `(stockId)` → `assetService.assignFromStock(stockItemId, employeeId)`.

- **updateRecord(id, status, completedAt)**  
  - If `status === "completed"` → set employee `employment_status = 'active'`.

### 2.3 Controller → API envelope

All success responses use `ApiResponse.ok` / `ApiResponse.created`, i.e. body shape `{ success: true, data: T }`. Frontend must use `json?.data ?? json` when reading list or single record.

---

## 3. Frontend

### 3.1 Entry points

| Source | Action | What happens |
|--------|--------|--------------|
| **Employees** | “Send Checklist” on an employee with status Onboarding | Navigate to `/onboarding?employeeId=<id>`. |
| **Onboarding page** with `?employeeId=xxx` | No existing record for that employee | Show “Send checklist for [name]” flow (template picker → section/assignee/task editor → POST `/initiate`). |
| **Onboarding page** with `?employeeId=xxx` | Employee already has a record | Select that record and clear URL to `/onboarding`. |
| **Employee Profile** | “Start onboarding” (no record yet) | POST `/api/onboarding` with `{ employeeId }` (legacy create), then redirect to `/onboarding`. Record has no sections/tasks until admin adds them or uses “Send Checklist” from elsewhere. |
| **Onboarding page** with `?recordId=xxx` | After initiate or redirect | Select that record and show its checklist. |

### 3.2 “Send checklist” flow (new, with templates)

1. **URL** `/onboarding?employeeId=<id>`, and GET `/api/onboarding/employee/<id>` returns 404 → show “Send checklist for [employee name]”.
2. **Step 1**: GET `/api/onboarding-templates` → list templates. User picks one, clicks Next.
3. **Step 2**: GET `/api/onboarding-templates/<templateId>` → full template with sections and tasks.  
   - UI shows sections; per section: assignees (search/add employees), tasks (from template, optional “Required” badge if `requiresAssignment`), add/remove tasks.  
   - Builds `initiateSections`: `{ templateSectionId, name, description, sortOrder, assignees, tasks }`.
4. **Submit**: POST `/api/onboarding/initiate` with:
   - `employeeId`, `templateId`,  
   - `sections`: each with `templateSectionId`, `name`, `description`, `sortOrder`, `assigneeIds` (employee ids), `tasks` (array of `{ taskName, requiresAssignment? }`).
5. On success: invalidate list, set `selectedRecordId`, replace URL with `/onboarding?recordId=<newRecordId>`.

### 3.3 Main onboarding view (list + detail)

- **List**: GET `/api/onboarding` → unwrap `data` → show records (admin/hr: all; others: only assignee records).  
  - Left column: “Incoming Hires” (in_progress) and “Completed”.  
  - Clicking a record sets `selectedRecordId`.
- **Detail**: GET `/api/onboarding/<id>`.  
  - Response includes `tasks` (unsectioned) and `sections` (each with `assignees` and `tasks`).  
  - If `sections.length > 0`: sections-based UI (expandable sections, assignees, tasks with complete/details).  
  - If no sections: legacy flat list of tasks.  
  - Progress = completed / total over all tasks (sectioned + unsectioned).

### 3.4 Task actions (detail)

- **Toggle complete**: PATCH `/api/onboarding/:recordId/tasks/:taskId` with `{ completed }`.  
  - Backend enforces assignment details when `requires_assignment` and `completed === true`.
- **Save assignment details**: Same PATCH with `{ assignmentDetails }`.
- **Add task**: POST `/api/onboarding/:recordId/tasks` with `taskName`, optional `sectionId`, `requiresAssignment`.
- **Delete task**: DELETE `/api/onboarding/:recordId/tasks/:taskId`.
- **Add/remove section assignee**: POST/DELETE `.../sections/:sectionId/assignees` with body or path `employeeId`.

### 3.5 Complete onboarding

- Button enabled when all tasks are completed (progress 100%).  
- PATCH `/api/onboarding/:id` with `status: "completed"`, `completedAt: now`.  
- Backend sets employee `employment_status = 'active'`.  
- Frontend: notification, invalidate list/detail, optional asset/employee cache invalidation.

### 3.6 Delete onboarding

- Admin/HR only: DELETE `/api/onboarding/:id`.  
- Repo deletes tasks then record; DB CASCADE removes `onboarding_record_sections` and assignees.

---

## 4. Wiring summary

### 4.1 API ↔ Frontend

- **List**: GET `/api/onboarding` → `{ success, data: array }` → use `data` for list.  
- **Single record**: GET `/api/onboarding/:id` → `{ success, data: record }` → `record` has `tasks`, `sections` (each with `assignees`, `tasks`).  
- **Templates**: GET `/api/onboarding-templates` and GET `/api/onboarding-templates/:id` → same envelope.  
- **Initiate**: POST `/api/onboarding/initiate` with `InitiateOnboardingDTO` → 201 with full record in `data`.  
- **Legacy create**: POST `/api/onboarding` with `{ employeeId }` → 201 with record (empty tasks/sections).

### 4.2 Role and assignee rules

- **Admin/HR**: Can list all records, create, initiate, update, delete, add/remove tasks and assignees.  
- **Other users**: Can list only records where they are section assignees; can open only those records; can update only tasks in sections they’re assigned to.

### 4.3 Task completion side effects

- **Work email task**: Completing with valid email in assignment details → `employees.work_email` updated.  
- **Laptop task**: Completing with text like `...(stockItemId)` → `AssetService.assignFromStock(stockItemId, employeeId)` (if stock exists).  
- **Mark record completed**: Employee `employment_status` set to `active`.

---

## 5. New flow (recommended) vs legacy

| Aspect | New flow | Legacy |
|--------|----------|--------|
| **Start** | Employees: “Send Checklist” → `/onboarding?employeeId=...` → choose template → edit sections/assignees/tasks → POST `/initiate`. | Employee Profile: “Start onboarding” → POST `/api/onboarding` with `employeeId` only. |
| **Record content** | Record + sections + assignees + tasks from template (and edits). | Record only; no sections, no tasks. |
| **Who can work** | Section assignees (and admin/hr) can complete tasks in their sections. | Only admin/hr can add tasks and complete (no section assignees). |
| **Templates** | Uses `/api/onboarding-templates` and template-driven structure. | No template; empty checklist. |

Legacy create is still available for quick “create empty onboarding” (e.g. from Employee Profile); admins can then add tasks manually or the same employee can be sent a checklist via Employees → “Send Checklist” (which uses the new initiate flow; note: duplicate record would be blocked by “employee already has onboarding” validation).

---

## 6. File reference

| Layer | Path |
|-------|------|
| Schema | `server/db/schema/onboarding.ts` |
| Migrations | `0003_add_onboarding.sql`, `0004_...`, `0058_onboarding_checklist_templates.sql`, `0059_onboarding_requires_assignment.sql` |
| Routes | `server/modules/onboarding/onboarding.routes.ts`, `server/modules/onboarding/templates/onboarding-templates.routes.ts` |
| Registration | `server/routes.ts`: `/api/onboarding`, `/api/onboarding-templates` |
| Controller | `OnboardingController.ts`, `OnboardingTemplateController.ts` |
| Service | `OnboardingService.ts`, `OnboardingTemplateService.ts` |
| Repository | `OnboardingRepository.ts`, `OnboardingTemplateRepository.ts` |
| DTO | `Onboarding.dto.ts`, `OnboardingTemplate.dto.ts` |
| Frontend | `client/src/pages/Onboarding.tsx` |
| Entry from app | `client/src/App.tsx` (route `/onboarding`), `Employees.tsx` (“Send Checklist”), `EmployeeProfile.tsx` (“Start onboarding”) |
