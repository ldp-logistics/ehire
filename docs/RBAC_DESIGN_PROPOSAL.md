# RBAC Design Proposal – Internal HRMS (Microsoft-Integrated)

Design-only document for a scalable Role-Based Access Control system for an HRMS integrated with Microsoft Teams, SharePoint, and Azure AD.

---

## 1. Recommended RBAC Structure

### 1.1 Hybrid model: role + module + action

Use a **three-layer** model:

| Layer | Purpose | Example |
|-------|--------|--------|
| **Role** | Who the user is (job function). | HR, Manager, Recruiter |
| **Module** | What area of the system. | Employee Management, Leave, Recruitment |
| **Permission (action)** | What they can do in that module. | create, read, update, delete, approve, reject |

**Why hybrid**

- **Role-based only:** Hard to scale when you need “HR except payroll” or “Manager + recruiter”.
- **Module-based only:** Doesn’t distinguish view vs approve vs delete.
- **Action-based only:** Too many flags; hard to manage and audit.
- **Role + module + action:** One role gets a set of (module, action) permissions; you can add custom roles or overrides later without changing code.

**Recommendation:**  
Store **permissions** as (module, action) pairs. Assign sets of these to **roles**. Users get one primary role (and optionally secondary roles or overrides). This gives you role-based by default, with the option to go module/action-granular where needed.

---

## 2. System Roles and Suggested Permissions

### 2.1 Role definitions

| Role | Purpose |
|------|--------|
| **Super Admin** | Full system control: all modules, all actions, user/role management, audit, integrations, system config. |
| **HR** | Core HR operations: employees, leave (config + approval), policies, attendance (config + override), recruitment (coordinate). Not system config or user/role management. |
| **Manager** | Team scope: view team employees, approve team leave, view team attendance; limited recruitment view. No HR config. |
| **Employee** | Self-service: own profile, own leave requests, own attendance, view policies. No approve, no bulk data. |
| **Recruiter** | Recruitment module: jobs, candidates, applications, offers. Optional read-only to employees for hiring context. No leave/asset/policy config. |
| **IT / Asset Manager** | Assets (full), optional IT-specific settings; read-only or limited employee view for support. No leave/recruitment HR config. |

### 2.2 Permission matrix (role × module × action)

**Actions used across modules:**  
`view` (read/list), `create`, `edit` (update), `delete`, `approve`, `reject`, `export`, `configure` (module-level settings).

**Scope note:**  
- *View* can be “own”, “team”, or “all” depending on role (enforced in business logic, not in the permission name if you keep permissions coarse).
- Permissions below are at role level; “team” vs “all” is implied by role name (e.g. Manager = team, HR = all).

| Module | Super Admin | HR | Manager | Employee | Recruiter | IT / Asset Manager |
|--------|-------------|----|---------|----------|-----------|---------------------|
| **Employee Management** | configure, CRUD, export | create, edit, view (all), export | view (team) | view (own), edit (own) | view (all or hiring only) * | view (all, limited fields) or none |
| **Leave Management** | configure, CRUD, approve, reject, export | configure policies, view all, approve, reject, export | view (team), approve (team), reject (team) | view (own), create (request), edit (own request) | — | — |
| **Recruitment** | configure, full CRUD, export | full access (create job, candidate, application, offer; approve offer) | view jobs/candidates, approve offer (optional) | — | full access (jobs, candidates, applications, offers) | — |
| **Asset Management** | configure, full CRUD, audit | view, create, edit, assign (no delete/audit if desired) | — | view (own assigned) | — | full (CRUD, assign, audit, configure) |
| **Policies** | configure, CRUD, publish | view (all), create, edit, publish (if applicable) | view (all) | view (applicable) | view (all or none) | view (all or none) |
| **Attendance** | configure, full, export | configure, view all, edit/override, export | view (team), export (team) | view (own), check-in/out | — | view (all, read-only) or none |
| **System / RBAC** | users, roles, permissions, audit, integrations | — | — | — | — | — |

\* Recruiter: often “view employees” for hiring context; can be restricted to “view candidates” only if no employee list is needed.

### 2.3 Example permission sets (summary)

**Role: HR**

- **Employee:** create, edit, view (all), export  
- **Leave:** configure (policies/balances), view (all), approve, reject, export  
- **Recruitment:** full access  
- **Asset:** view, create, edit, assign (no delete/audit if you want that for IT only)  
- **Policies:** view, create, edit, publish  
- **Attendance:** configure, view (all), edit/override, export  

**Role: Manager**

- **Employee:** view (team only)  
- **Leave:** view (team), approve (team), reject (team)  
- **Recruitment:** view (jobs, candidates, applications), approve (offer) if desired  
- **Policies:** view (all)  
- **Attendance:** view (team), export (team)  

**Role: Employee**

- **Employee:** view (own), edit (own)  
- **Leave:** view (own), create (request), edit (own request, e.g. cancel)  
- **Policies:** view (applicable)  
- **Attendance:** view (own), check-in, check-out  

**Role: Recruiter**

- **Recruitment:** full access (jobs, candidates, applications, offers)  
- **Employee:** view (all) or view (none) – for hiring context only  

**Role: IT / Asset Manager**

- **Asset:** full (CRUD, assign, audit, configure)  
- **Employee:** view (all, limited fields) for support if needed  

---

## 3. Role vs module vs action

### 3.1 Recommendation

- **Role-based:** Primary way users get access (each user has one primary role, optionally more).  
- **Module-based:** Permissions are defined **per module** (each permission belongs to one module).  
- **Action-based:** Within each module, permissions are **actions** (create, read, update, delete, approve, reject, configure, export).  

So: **roles** get a set of **(module, action)** permissions. One table could store “role_permissions (role_id, permission_id)” where each permission is (module_id, action_code).

### 3.2 Granularity

- **Coarse (recommended for v1):** One permission per (module, action), e.g. `leave.approve`, `employee.edit`.  
- **Finer (later):** Sub-resources, e.g. `leave.policy.configure`, `leave.request.approve`.  

Start coarse; split only when you have a real need (e.g. “approve leave but not configure policies”).

### 3.3 Scope (own / team / all)

- Store **scope** either:  
  - In the **role** (e.g. Manager = team, HR = all), or  
  - As part of **permission** (e.g. `employee.view_team` vs `employee.view_all`).  
- Enforce scope in **business logic** (services): when loading data, filter by current user’s scope.  
- Don’t try to encode “team” in the DB as millions of rows; keep permissions small and resolve “team” in code (org hierarchy, manager_id).

---

## 4. Database Schema (conceptual)

### 4.1 Core tables

**roles**

- id (PK)  
- code (unique, e.g. super_admin, hr, manager, employee, recruiter, it_asset_manager)  
- name (display)  
- description (optional)  
- is_system (boolean: true = cannot delete, only disable)  
- created_at, updated_at  

**modules**

- id (PK)  
- code (unique, e.g. employees, leave, recruitment, assets, policies, attendance, system)  
- name (display)  
- sort_order (for UI)  

**actions**

- id (PK)  
- code (e.g. view, create, edit, delete, approve, reject, export, configure)  
- name (display)  
- Optional: applies_to (e.g. request, policy) for future sub-resources  

**permissions**

- id (PK)  
- module_id (FK → modules)  
- action_id (FK → actions)  
- code (unique, e.g. leave.approve, employee.edit) — derived or stored  
- name (display, optional)  

So each permission = one (module, action) pair.

**role_permissions**

- role_id (FK → roles)  
- permission_id (FK → permissions)  
- PK (role_id, permission_id)  

**users** (existing, extend)

- … existing fields …  
- role_id (FK → roles) — primary role  
- Optional: secondary_roles (JSONB array of role_id) or user_roles (user_id, role_id) for multiple roles  

**user_permission_overrides** (optional, for exceptions)

- user_id (FK → users)  
- permission_id (FK → permissions)  
- granted (boolean: true = add, false = revoke)  
- PK (user_id, permission_id)  

Resolve effective permissions at runtime: base permissions from role(s) ± overrides.

### 4.2 Approval and delegation (see section 6)

- approval_workflows  
- approval_workflow_steps  
- delegations (e.g. who can approve when manager absent)  

(Detailed in section 6.)

### 4.3 Indexes and constraints

- Unique on (modules.code), (roles.code), (permissions.module_id, permissions.action_id).  
- Index role_permissions.role_id, role_permissions.permission_id; user_permission_overrides.user_id.  

---

## 5. Approval Flows (e.g. leave when manager is absent)

### 5.1 Principles

- Approval **path** is defined by **workflow** (e.g. leave: manager → HR).  
- **Who** can approve at each step is determined by **role + scope** (e.g. “manager of this employee” or “any HR”).  
- When the designated approver is absent, use **delegation** or **substitute** so the system can route to another person without changing the workflow definition.

### 5.2 Workflow model (conceptual)

- **Approval workflow:** e.g. “Leave request”, “Change request”.  
- **Steps:** ordered (step 1: manager, step 2: HR).  
- Each step has: **type** (e.g. manager, role_based, specific_user) and **config** (e.g. role_id = HR, or “manager of requester”).  

So for leave:

- Step 1: type = manager_of_requester (resolve at runtime from org data).  
- Step 2: type = role_based, role = HR (any user with HR role can approve).  

### 5.3 Handling absent manager

**Option A – Delegation table**

- delegations: user_id (delegator), delegate_user_id, start_at, end_at, scope (e.g. leave_approval, all).  
- When resolving “manager of requester”, first check if that manager has an active delegation; if yes, use delegate_user_id as approver for that step.  
- Notifications and “pending approvals” go to delegate when delegated.

**Option B – Substitute / acting manager**

- Same idea: an “acting manager” or “substitute” is assigned for a period (e.g. in org structure or a separate substitutes table).  
- Resolution: “manager of requester” → if substitute exists in date range, use substitute; else manager.  

**Option C – Escalation**

- Step has timeout; if not approved in X days, escalate to next step (e.g. manager → HR) or to a fallback approver.  
- Can combine with A/B: first try manager → if delegated, delegate; if timeout, escalate to HR.  

**Recommendation:** Implement **delegation** (Option A) plus optional **escalation** (Option C). Keep workflow definitions generic (manager, role_based); resolve actual approver in a service that checks delegation and org hierarchy.

---

## 6. RBAC and Microsoft Azure AD Integration

### 6.1 Two main use cases

1. **Authentication:** User signs in with Azure AD; HRMS gets identity (object id, email).  
2. **Authorization:** Either use only HRMS roles, or optionally take into account Azure AD roles/groups.

### 6.2 Recommended approach: HRMS as source of truth for app permissions

- **Authentication:** Azure AD only (SSO).  
- **Authorization (who can do what in HRMS):** Stored in **HRMS DB** (roles, role_permissions, user → role).  
- **Why:** Azure AD groups are good for “who has access to which app” and for M365/Teams/SharePoint; they are less ideal for fine-grained “leave.approve” vs “leave.configure”. Keeping RBAC in HRMS gives you one place to manage and audit.

### 6.3 Optional: sync from Azure AD

- **Role mapping:** When user first logs in (or on sync job), map an **Azure AD group** to an **HRMS role** and assign that role in HRMS.  
  - Example: AD group “HRMS-HR” → HRMS role “HR”.  
- **Provisioning:** If user is in “HRMS-HR”, create/update user in HRMS with role_id = HR.  
- **Deprovisioning:** If user is removed from all HRMS-related AD groups, disable or downgrade in HRMS (per your policy).  

So: Azure AD drives **who gets which HRMS role**; HRMS stores **what that role can do** (role_permissions).

### 6.4 Optional: use AD groups for “visibility” or “feature flags”

- Use AD group membership to show/hide high-level features (e.g. “Recruitment” app link) while detailed permissions remain in HRMS.  
- Or use a single AD group “HRMS-Users” for “can access HRMS at all”; everything else (roles, permissions) in HRMS.

### 6.5 Best practice summary

- Authenticate with Azure AD; store in HRMS: user id, email, (optional) AD group memberships or mapped role.  
- Authorize in HRMS using roles and permissions.  
- Optionally sync role from AD group → HRMS role for easier lifecycle (hire/transfer/leave in AD → role updated in HRMS).  
- Avoid duplicating fine-grained permission logic in both AD and HRMS.

---

## 7. UI for Permission Management

### 7.1 Who can manage

- **Super Admin** (or a dedicated “RBAC Admin” role): full access to roles and permissions.  
- **HR** (optional): allow viewing roles and **which users have which role**; no edit of role–permission mapping if you want strict control.

### 7.2 Screens to provide

**1. Roles list**

- Table: Role name, code, description, # permissions, # users, system role (yes/no), actions (Edit, Duplicate, Disable).  
- “Create role” → wizard or form.

**2. Role detail / Edit role**

- **Basic info:** Name, code, description.  
- **Permissions:** Matrix or list by module.  
  - Rows = modules (expandable or tabs).  
  - Columns = actions (View, Create, Edit, Delete, Approve, Reject, Configure, Export).  
  - Checkboxes: grant permission for this (module, action) to this role.  
- Save → updates role_permissions.

**3. User assignment**

- **Option A – from Users screen:** Per user, dropdown or multi-select “Role” (and optional “Additional roles”).  
- **Option B – from Role detail:** “Users with this role” list; “Add user”, “Remove”.  
- Both: show effective role(s) and, if you have overrides, “Custom permissions” badge linking to user override screen.

**4. User permission overrides (optional)**

- On user detail: “Permission overrides” section.  
- List base permissions (from role) and any overrides (granted/revoked).  
- Add override: pick permission from list, Grant / Revoke.  
- Use sparingly; prefer creating a new role if many users need the same exception.

**5. Audit log (read-only)**

- Filter by: date, user, role, action (e.g. “role updated”, “permission granted to user”).  
- Helps compliance and “who changed what”.

### 7.3 UX best practices

- **Default roles:** Ship with system roles (Super Admin, HR, Manager, etc.) and a “Clone role” to create variants (e.g. “HR – Read only”).  
- **Clear labels:** Permission names like “Leave – Approve requests” not just “leave.approve”.  
- **Warning:** Before removing a permission from a role, show “X users will lose this access”.  
- **Prevent lockout:** Super Admin cannot remove last Super Admin; or require at least one user with “manage roles” permission.  
- **Scopes:** If you show “team” vs “all”, display it in role detail (e.g. “Manager: team scope for Employees and Leave”).

---

## 8. Enterprise HR Best Practices (summary)

- **Least privilege:** Grant minimum needed; use roles like “Recruiter” and “IT” instead of giving everyone HR.  
- **Segregation:** Approvers ≠ requesters (no self-approval); separate config (e.g. leave policy) from operational approve.  
- **Audit:** Log role/permission changes and who approved what (e.g. leave, offers).  
- **Consistent model:** Same (role → permissions) for API and UI; API checks permission before performing action.  
- **Scope in code:** “Team” vs “all” enforced in services (filter by manager_id or org), not by creating thousands of permissions.  
- **Delegation:** Support out-of-office approval via delegation or substitute so workflows don’t depend on a single person.  
- **SSO + single source of truth:** Authenticate with Azure AD; keep authorization (roles, permissions) in HRMS and optionally sync role from AD groups.  
- **Friendly UI:** Matrix or grouped list for role–permission editing; clear impact when changing roles.  
- **System roles:** Mark built-in roles as non-deletable (disable only); allow custom roles for local variations.

---

## 9. Summary

| Topic | Recommendation |
|-------|----------------|
| **Structure** | Hybrid: roles get (module, action) permissions; scope (own/team/all) in role or logic. |
| **Roles** | Super Admin, HR, Manager, Employee, Recruiter, IT/Asset Manager with clear boundaries. |
| **Permissions** | Module + action (view, create, edit, delete, approve, reject, configure, export). |
| **Schema** | roles, modules, actions, permissions (module_id + action_id), role_permissions; users.role_id; optional user overrides. |
| **Approval** | Workflow with steps (e.g. manager → HR); delegation table for absent manager; optional escalation. |
| **Azure AD** | Auth via Azure AD; RBAC in HRMS; optional sync AD group → HRMS role. |
| **UI** | Roles list, role detail with permission matrix, user–role assignment, optional overrides, audit log. |

This gives you a scalable, auditable RBAC design that fits an internal HRMS integrated with Microsoft services and leaves room to add more modules or actions later without changing the core model.
