# Voyager HRIS – Modules Update (All Modules to Date)

This document summarizes **all modules** in the application, their routes, backend support, role access, and recent enhancements.

---

## Architecture Overview

- **Frontend:** React (Vite), TypeScript, Wouter (routing), TanStack Query, Zustand, shadcn/ui.
- **Backend:** Express, Neon (PostgreSQL), JWT auth (HTTP-only cookie), role-based access (admin, hr, manager, employee).
- **Data:** DB-backed modules use Drizzle schema and server routes; some modules are UI-only (placeholder or local state).

---

## Authentication & Public

| Module        | Route(s)                    | Backend        | Roles   | Notes                                      |
|---------------|-----------------------------|----------------|---------|--------------------------------------------|
| **Login**     | `/login`                     | `auth.ts`      | Public  | JWT cookie; single `role` column (no `roles`). |
| **Signup**    | `/signup`                    | `auth.ts`      | Public  | User registration.                          |
| **Career Site** | `/careers`                 | —              | Public  | Job applications; submit to recruitment.    |
| **Tentative Portal** | `/tentative-portal/:token` | `tentative.ts` | Public | Document upload for tentative hires.       |
| **Offer Response** | `/offer-response/:token`  | (recruitment)  | Public  | Accept/decline offer by candidate.         |

---

## Overview

| Module        | Route       | Backend         | Sidebar Roles | Notes |
|---------------|-------------|-----------------|---------------|-------|
| **Dashboard** | `/dashboard`| `dashboard.ts`  | All           | **Role-aware:** Employee / Manager / HR / Admin dashboards; stats, actions, activity feed; check-in/out. |
| **Company Feed** | `/news`  | —               | All           | News feed UI.                              |
| **Tasks**     | `/tasks`    | —               | All           | Task list UI.                              |
| **Documents** | `/documents`| —              | All           | Documents UI.                              |

---

## People

| Module          | Route(s)                    | Backend           | Sidebar Roles      | Notes |
|-----------------|-----------------------------|-------------------|--------------------|-------|
| **Employees**   | `/employees`, `/employees/:id` | `employees.ts`  | All                | List, create, edit, delete; suggested employee ID; profile with Timeoff (leave balances/requests), onboarding status; "Start Onboarding" only when status ≠ Active and no completed onboarding. |
| **Org Chart**   | `/org-chart`                | (employees)       | All                | Org tree from employees.                   |
| **Recruitment** | `/recruitment`, `/recruitment/candidates/:id` | `recruitment.ts`, `tentative.ts` | admin, hr, manager | Jobs, applications pipeline, offers; **Hire** pre-fills from candidate + offer (incl. location from job); tentative flow with document verification; confirm hire. |
| **Job Generator** | `/jobs-ai`                | —                 | admin, hr          | AI job description generator UI.           |
| **Onboarding**  | `/onboarding`               | `onboarding.ts`   | admin, hr          | Records and tasks; complete onboarding pushes notification; assignment details, checklist. |
| **Offboarding** | `/offboarding`              | `offboarding.ts`  | admin, hr          | Initiate, checklist, exit date, complete/cancel. |

---

## Operations

| Module           | Route          | Backend          | Sidebar Roles              | Notes |
|------------------|----------------|------------------|----------------------------|-------|
| **Shifts**       | `/shifts`      | —                | All                        | Shifts and assignments UI. |
| **Timesheets**   | `/timesheets`  | `attendance.ts`  | All                        | Check-in/out, attendance records. |
| **Leave Calendar** | `/leave`     | `leave.ts`       | All                        | **Leave:** Request, balances, policies; **Calendar** tab (approved leave); **Approvals** tab for approvers (manager/HR or assigned approver); auto-init balances for paid leave when missing. |
| **Service Desk** | `/service-desk`| —                | All                        | Service requests UI.      |
| **IT Support**   | `/it-support`  | (assets/tickets) | All                        | My systems, my tickets; create ticket (adds notification). |
| **Rooms**        | `/rooms`       | —                | All                        | Room booking UI.          |
| **Asset Management** | `/assets`, `/assets/:id` | `assets.ts` | admin only       | Stock, systems, assignments, procurement, tickets. |
| **Visitors**     | `/visitors`    | —                | admin, hr, manager         | Visitors UI.               |
| **Timezones**    | `/timezones`  | —                | All                        | Timezone UI.               |
| **Emergency**    | `/emergency`  | —                | All                        | Emergency info UI.        |

---

## Finance & Legal

| Module        | Route       | Backend | Sidebar Roles | Notes |
|---------------|-------------|---------|---------------|-------|
| **Payroll**   | `/payroll`   | —       | admin, hr      | Payroll UI. |
| **Payslips**  | `/payslips` | —       | All           | Payslips UI. |
| **Loans & Advances** | `/loans` | —    | All           | Loans UI.    |
| **Expenses**  | `/expenses` | —       | All           | Expenses UI. |
| **Benefits**  | `/benefits` | —       | All           | Benefits UI. |
| **Salary Benchmark** | `/salary` | —   | admin, hr     | Salary UI.  |
| **Compliance**| `/compliance`| —      | admin, hr     | Compliance UI. |
| **Whistleblower** | `/whistleblower` | — | All     | Whistleblower UI. |
| **Audit Logs** | `/audit`    | —       | admin         | Audit UI.    |

---

## Growth & Culture

| Module        | Route            | Backend | Sidebar Roles        | Notes |
|---------------|------------------|---------|----------------------|-------|
| **Performance** | `/performance` | —       | All                  | Performance UI. |
| **Goals & OKRs** | `/goals`       | —       | All                  | Goals UI. |
| **Surveys**   | `/surveys`      | —       | All                  | Surveys UI. |
| **Kudos**     | `/kudos`        | —       | All                  | Kudos UI. |
| **Training LMS** | `/training`   | —       | All                  | Training UI. |
| **Diversity** | `/diversity`   | —       | admin, hr            | Diversity UI. |
| **Succession** | `/succession`   | —       | admin, hr, manager   | Succession UI. |

---

## System & Settings

| Module            | Route               | Backend | Sidebar Roles | Notes |
|-------------------|---------------------|---------|---------------|-------|
| **System Health** | `/health`           | `GET /api/health` | admin | Health check. |
| **Project Tracking** | `/project-tracking` | —    | All           | Project tracking UI. |
| **Settings**      | `/settings`         | —       | All           | User/settings UI.    |
| **Help Center**   | `/help-center`, `/help-center/article/:slug` | — | All | Knowledge base, articles. |

---

## Notifications (Global)

| Feature | Backend | Notes |
|---------|---------|--------|
| **Notification dropdown** | `GET /api/notifications` (`notifications.ts`) | **Role-synced:** Employee (my leave, change requests, onboarding); Manager (leave approvals assigned to me); HR/Admin (leave approvals, change requests, onboarding, tentative, offboarding, new applications, offers). Each item has **module** label (Leave, Recruitment, Onboarding, etc.). Read state persisted in client store. Local notifications (e.g. onboarding complete, IT ticket) merged from store. |

---

## Backend API Summary

| Route prefix              | Purpose |
|---------------------------|---------|
| `/api/auth`               | Login, logout, me (JWT, role). |
| `/api/employees`         | CRUD, suggested-id, profile. |
| `/api/change-requests`   | Create, list, approve/reject (HR). |
| `/api/assets`            | Stock, systems, assignments, tickets, procurement. |
| `/api/onboarding`         | Records, tasks, complete. |
| `/api/recruitment`        | Candidates, jobs, applications, offers, hire. |
| `/api/attendance`         | Check-in/out, records. |
| `/api/tentative`          | Tentative records, documents, confirm-hire. |
| `/api/offboarding`        | Initiate, update, complete. |
| `/api/leave`              | Policies, types, balances, request, approve/reject, calendar, pending-approvals, employee requests. |
| `/api/dashboard`         | Role-specific dashboard payload. |
| `/api/notifications`      | Role-specific notifications from all modules. |
| `/api/health`             | Health check. |

---

## Recent Enhancements (Summary)

1. **Recruitment → Employee:** Hire and Confirm Hire create employee from candidate + offer; location from job posting; suggested employee ID from API.
2. **Leave:** Calendar tab (approved leave); approvals tab visible to assigned approvers; leave balances/requests on Employee Profile (Timeoff tab); auto-initialize balances for paid leave when missing.
3. **Onboarding:** "Start Onboarding" only when employee not Active and no completed onboarding; onboarding completed badge on profile.
4. **Dashboard:** Role-aware (Employee / Manager / HR / Admin) with real data; activity feed.
5. **Notifications:** Central API per role from leave, recruitment, onboarding, offboarding, change requests, tentative; module labels; dropdown refetches from API.
6. **Data freshness:** Default React Query `refetchOnMount: "always"`, `refetchOnWindowFocus: true`, `staleTime: 30_000` so opening a module shows updated data without manual refresh.
7. **Auth:** Single `role` column (no `roles`); login/me fixed for current schema.

---

## Role-Based Sidebar Visibility

- **All:** Dashboard, Company Feed, Tasks, Documents, Employees, Org Chart, Shifts, Timesheets, Leave Calendar, Service Desk, IT Support, Rooms, Timezones, Emergency, Loans, Expenses, Benefits, Whistleblower, Performance, Goals, Surveys, Kudos, Training, Project Tracking, Settings, Help Center, Payslips.
- **admin, hr, manager:** Recruitment, Visitors; **admin, hr:** Job Generator, Onboarding, Offboarding, Payroll, Salary, Compliance, Diversity; **admin, hr, manager:** Succession; **admin only:** Asset Management, Audit Logs, System Health.

---

*Last updated: Feb 2025 – reflects all modules and backend routes as implemented.*
