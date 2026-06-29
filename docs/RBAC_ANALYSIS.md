# RBAC (Role-Based Access Control) – System Analysis

This document describes how roles, permissions, and authorization are organized across the LDP HRM system (server, client, and database).

---

## 1. Role model overview

### 1.1 System roles

| Role       | Description |
|-----------|-------------|
| **admin** | Full system access: user management, delete employees/jobs, run migrations, probation reminders, audit, system health, onboarding templates CRUD. |
| **hr**    | HR operations: employees CRUD (no delete), leave policies/balances, recruitment, onboarding/offboarding, change requests, compensation, departments, attendance, tentative hire flow. |
| **manager** | Team context: approve leave (as manager in chain), view team leave, recruitment (view + offer approve), onboarding view, succession, visitors, reports. |
| **employee** | Self-service: own profile, own leave requests, own documents, tasks, calendar; no bulk/HR actions. |
| **it**    | IT operations: assets (stock, systems, tickets, invoices, audit), compensation read for support; can access any employee profile (support context). |

Defined in:
- **Server:** `server/lib/rbac.ts` → `ALL_ROLES`, `SystemRole`
- **Schema:** `server/db/schema/users.ts` → `userRoleEnum`, `ALL_ROLES`
- **Client:** `client/src/hooks/useAuth.tsx` → `Role`, `ALL_ROLES`

### 1.2 Primary vs multiple roles

- **Primary role:** `users.role` (single enum: admin, hr, manager, employee, it).
- **Additional roles:** `users.roles` (JSONB array). Authorization checks use **either** primary role **or** any of `roles` via `hasAnyRole()` in middleware.
- **Effective role:** For **display and UI** (sidebar, route guards), the server can compute an **effective** role:
  - Used in `/api/auth/me` and after login.
  - Logic in `server/lib/rbac.ts` → `getEffectiveRole(user)`:
    1. If `user.role` is a valid system role → use it.
    2. Else if user has `employee_id` → infer from employee: HR department → `hr`, has direct reports → `manager`, IT department → `it`, else → `employee`.
    3. Else → `employee`.

So: **API authorization** uses `req.user.role` + `req.user.roles` (from JWT/DB). **UI/sidebar** uses `effectiveRole` when the server sends it (e.g. in `/api/auth/me`).

### 1.3 Module-level access (allowed modules)

- **Column:** `users.allowed_modules` (JSONB array of module keys, e.g. `["dashboard","recruitment","leave"]`).
- **Semantics:**  
  - **Empty array** → use **role-based** visibility (sidebar and route guards use `effectiveRole` + item `roles`).  
  - **Non-empty** → user sees **only** those modules (and always `dashboard` and `settings`). Role is ignored for visibility; API still enforces role on each endpoint.
- **Where used:** Settings (admin can set per user), sidebar filtering, client `RoleGuard` in `App.tsx`.

---

## 2. Where roles are stored and updated

| Location | What |
|----------|------|
| **DB** | `users.role`, `users.roles`, `users.allowed_modules`, `users.employee_id` |
| **Migrations** | `0010_add_user_roles.sql` (roles array), `0012_add_allowed_modules.sql`, `0013_rbac_harden.sql` (+ `it`, auth_provider, unique employee_id), `0057_add_roles_and_employee_role.sql` (roles table for FreshTeam + employees.role display) |
| **Auth responses** | Login and `/api/auth/me` return `role`, `effectiveRole`, `roles`, `employeeId`, `allowedModules` |
| **JWT** | Contains `userId`, `email`, `role`, `roles`, `employeeId` (not effectiveRole; that is recomputed on /me) |

---

## 3. Server-side authorization (API)

### 3.1 Middleware (`server/middleware/auth.ts`)

| Middleware | Purpose |
|------------|--------|
| **requireAuth** | Ensures `req.user` is set (JWT cookie or `X-User-Id` dev header). Returns 401 otherwise. |
| **requireRole(allowedRoles)** | After requireAuth, checks `hasAnyRole(userRow, allowedRoles)` (primary role or any of `roles`). Returns 403 if not allowed. |
| **canAccessEmployee** | Allows all authenticated users to “access” employee scope; **admin, hr, it** are treated as privileged. Used so that GET /employees/:id and related handlers can run; **data restriction** (limited fields) is done inside **EmployeeService.getById** by role. |
| **preventSelfAction(paramName)** | Optional helper: 403 if `req.user.employeeId` equals the target (e.g. prevent approving own leave). Defined but not currently used on any route (leave uses in-service check). |

Role is normalized with `normalizeRole()` (unknown → `employee`). On each request with JWT, role is re-read from DB so changes take effect without re-login.

### 3.2 Per-route usage (summary)

- **Auth**  
  - `PATCH /api/auth/me` → requireAuth  
  - `POST /api/auth/register`, `GET/PATCH/DELETE /api/auth/users/*` → requireAuth + **admin**

- **Employees**  
  - List, get by id, avatar, document file, timeline, documents list → requireAuth; get by id + timeline + documents also **canAccessEmployee**  
  - Create, update, delete document, migrate/import, suggested-id → requireAuth + **admin or hr**  
  - Delete employee → requireAuth + **admin**  
  - Upload document, sync tentative docs → requireAuth + admin/hr + canAccessEmployee  

- **Departments**  
  - Read (list, business units, levels, branches, teams, roles, shifts, job categories, by id) → requireAuth  
  - Create, update, delete, migrate-from-freshteam → requireAuth + **admin or hr**

- **Leave**  
  - All routes requireAuth.  
  - Policies CRUD, types, balances (all-balances, init, adjust, add, accrue, year-end), holidays, migrate/sync FreshTeam → **admin or hr**  
  - Self-service: my-requests, submit, cancel; approvals: pending-approvals, approve, reject → any authenticated (approval **who** can approve is determined in **LeaveService** by approval chain + role).

- **Leave approval logic (in LeaveService)**  
  - Pending approvals: managers see approvals where they are in chain; **hr/admin** also see HR-step approvals.  
  - Approve/reject: user cannot act on own request; only the current step approver (manager or HR) can approve/reject (enforced in service).

- **Recruitment**  
  - Migrate FreshTeam jobs/candidates → requireAuth + **admin**  
  - Candidates: list, get, resume → requireAuth; create → public (rate-limited); update/delete → **admin or hr**  
  - Jobs: list, filter, get, create, update → requireAuth (create/update **admin or hr**); delete job → **admin**  
  - Applications: list, get, create (public rate-limited), stage/rating/delete, emails, hire → requireAuth (mutations **admin or hr**)  
  - Offers: list, get, create, update, get link → **admin or hr**; approve/reject/upload letter/get letter → **admin or hr or manager**

- **Onboarding**  
  - List, get by id, update task → requireAuth  
  - Get by employee, create, initiate, update, delete, add/remove tasks, assignees → **admin or hr**

- **Onboarding templates**  
  - List, get by id → **admin or hr**  
  - Create, update, delete, section/task CRUD → **admin only**

- **Offboarding**  
  - All endpoints → requireAuth + **admin or hr**

- **Change requests**  
  - List, submit (self), submit bulk → requireAuth  
  - Pending count, bulk approve, approve, reject, delete → **admin or hr**

- **Assets**  
  - Stats, my-tickets, my-systems, stock list, stock by id, QR, systems list, get by id, tickets list/get/create/update comments, ticket status (update) → requireAuth (some require **admin or hr or it** for write)  
  - Stock create/patch, systems assign/create/patch, ticket status patch, invoices create/patch → **admin or hr or it**  
  - Stock/system/ticket/invoice delete, audit → **admin or it**

- **Compensation**  
  - Emergency contacts (all) → **admin or hr**  
  - Per-employee: emergency contacts, dependents, salary, banking, bonuses, stock grants: read → requireAuth; create/update/delete → **admin or hr**

- **Attendance**  
  - Shifts CRUD: read requireAuth; create/update → **admin or hr**; delete → **admin**  
  - Employee-shifts: list, assign, remove → requireAuth (assign/remove **admin or hr**)  
  - Check-in/out, today, stats, employee records, records list → requireAuth  
  - Report → **admin or hr or manager**  
  - Manual upsert, update/delete record, daily summary, audit → **admin or hr**

- **Dashboard**  
  - Get, probation-alerts → requireAuth  
  - Run probation reminders → **admin**

- **Tasks**  
  - All → requireAuth (no role guard).

- **Notifications, timezone, tentative**  
  - Notifications: list → requireAuth  
  - Timezone: all → requireAuth  
  - Tentative: all → **admin or hr**

---

## 4. Data-level restrictions (by role)

- **Employee profile GET** (`EmployeeService.getById(id, role, currentEmployeeId)`):  
  - If viewer is **not** (admin or hr) **and** not the employee themselves → return **limited fields** (id, employee_id, first_name, last_name, work_email, job_title, department, location, avatar, manager_id, manager_email, hr_email).  
  - Admin/HR (or viewing self) → full profile.

- **Employee document file** (`EmployeeService.getDocumentFile`): only **admin/hr** or the document owner (same employee_id) can get the file.

- **Leave**  
  - `listRequests`: **employee** role → empty list; others get filtered list.  
  - `getRequestDetail`: **employee** only for own request.  
  - `getEmployeeRequests`: allowed for admin, hr, self, or **manager** who is manager of that employee.  
  - Cancel: only own request unless admin/hr.

---

## 5. Client-side RBAC (UI)

### 5.1 Auth context (`useAuth`)

- Exposes: `user`, `effectiveRole`, `isAdmin`, `isHR`, `isManager`, `isEmployee`, `isIT`, `canEditEmployee(employeeId)`.
- **effectiveRole** = `user.effectiveRole ?? user.role ?? "employee"` (server sends effectiveRole in /me).
- **canEditEmployee(employeeId):** true if admin or hr or current user’s employeeId === employeeId.

### 5.2 Sidebar (`Layout.tsx`)

- **Visibility:**  
  1. If `user.allowedModules` is non-empty → show only items whose `moduleKey` (href without leading `/`) is in `allowedModules` or is `dashboard` or `settings`.  
  2. Else → show item if it has no `roles` or if `effectiveRole` is in item’s `roles`.
- Sidebar items can have optional **roles** (e.g. Recruitment: admin, hr, manager; Onboarding Templates: admin; Asset Management: admin, it; Payroll: admin, hr). Items without `roles` are visible to all authenticated users.

### 5.3 Route guards (`App.tsx`)

- **ProtectedRoute:** redirect to login if not authenticated.
- **RoleGuard(moduleKey, roles):**  
  1. If `user.allowedModules` is non-empty → allow only if `moduleKey` is in allowedModules or is `dashboard` or `settings`; else redirect to dashboard.  
  2. Else → allow if `effectiveRole` is in `roles`; else redirect to dashboard.

Routes wrapped with RoleGuard use the same module keys and role lists as the sidebar where applicable (e.g. recruitment: admin, hr, manager; assets: admin, it; onboarding-templates: admin with moduleKey `onboarding` — see note below).

### 5.4 Page-level use of role

- **Recruitment:** `effectiveRole === "admin"` used to show migration and certain admin-only UI.
- **Settings:** Admin can edit users’ role, employeeId, isActive, allowedModules.
- **Employee profile:** Edit capabilities and visibility follow `canEditEmployee` and API data restriction (limited fields for non-privileged viewers).

---

## 6. Role inference and FreshTeam

- **Inference:** `getEffectiveRole()` in `server/lib/rbac.ts` can infer role from linked employee: HR department → hr, has direct reports → manager, IT department → it.
- **FreshTeam:**  
  - `mapFreshteamsRoleToSystemRole()` maps FreshTeam role labels to system roles (admin never auto-mapped).  
  - `autoLinkUserForEmployee()` creates or links user to employee and sets role from FreshTeam when creating; existing users only get employee link.

---

## 7. Consistency and edge cases

- **Onboarding Templates route:** In `App.tsx`, the route for `/onboarding-templates` uses `RoleGuard` with `moduleKey="onboarding"` and `roles={["admin"]}`. So when using **allowedModules**, a user with only `"onboarding"` can access both `/onboarding` and `/onboarding-templates`, whereas the sidebar shows “Onboarding Templates” only to **admin** (by role). For strict admin-only templates, the route could use a dedicated `moduleKey` (e.g. `"onboarding-templates"`) and keep `roles={["admin"]}` so that allowedModules and role-based behavior align.
- **IT and employee profile:** Middleware `canAccessEmployee` treats admin, hr, **it** as privileged (can access any employee); EmployeeService.getById restricts **data** by role and does not treat **it** as full-profile viewer — it returns limited fields for non–admin/hr. So IT can “access” the endpoint but gets the same limited view as other employees when not self. If IT should see full profile for support, getById would need to include `it` in the privileged list.
- **preventSelfAction:** Implemented in auth middleware but not used on any route; leave self-action is enforced in LeaveService instead.

---

## 8. File reference

| Area | Files |
|------|--------|
| Role constants & effective role | `server/lib/rbac.ts` |
| Auth middleware (requireAuth, requireRole, canAccessEmployee) | `server/middleware/auth.ts` |
| User schema (role, roles, allowed_modules) | `server/db/schema/users.ts` |
| Auth API (login, me, register, users CRUD) | `server/modules/auth/*` |
| Route-level guards | Each `server/modules/*/ *.routes.ts` |
| Client auth & role | `client/src/hooks/useAuth.tsx` |
| Sidebar visibility | `client/src/components/layout/Layout.tsx` |
| Route guards | `client/src/App.tsx` |
| RBAC migrations | `migrations/0010_*.sql`, `0012_*.sql`, `0013_*.sql`, `0057_*.sql` |

---

This is the full picture of how RBAC is organized: five system roles, optional multiple roles and allowed modules, server middleware and service-level checks, and client-side sidebar and route guards aligned with the same model.
