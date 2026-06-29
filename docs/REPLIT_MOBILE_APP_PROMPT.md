# Replit Prompt: LDP HRM Mobile App – UI Only

Copy the prompt below and paste it into Replit when creating the mobile application project.

---

## PROMPT START

Build a **modern, enhanced, and user-friendly Android and iOS mobile application** for an HRM (Human Resource Management) system. The app is **UI/frontend only**: it consumes an existing REST API. Use **React Native (Expo)** or **Flutter** so one codebase runs on both platforms. Focus on a clean, professional UI with smooth navigation, role-based screens, and a polished experience.

---

### 1. API the App Will Use

- **Base URL:** From environment (e.g. `API_BASE_URL` = `https://your-backend.replit.app` or `http://localhost:5000`). All endpoints live under `/api`.
- **Auth:** Login with email/password; assume the API returns a **token** in the response and expects **`Authorization: Bearer <token>`** on authenticated requests. Store the token securely and send it with every API call; on 401, clear token and redirect to login.
- **User/roles:** After login you get a user object with `id`, `email`, `role`, `effectiveRole`, `employeeId`, and optional `allowedModules`. Use these to show/hide sections and tabs (roles: admin, hr, manager, employee, it).

**Endpoints to integrate (base URL + `/api`):**

| Area | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| Auth | POST | `/auth/login` | Login (body: email, password) |
| Auth | GET | `/auth/me` | Current user (auth required) |
| Auth | POST | `/auth/logout` | Logout |
| Dashboard | GET | `/dashboard` | Dashboard data |
| Employees | GET | `/employees` | List employees |
| Employees | GET | `/employees/:id` | Employee profile |
| Leave | GET | `/leave/my-requests` | My leave requests |
| Leave | POST | `/leave/request` | Submit leave request |
| Leave | GET | `/leave/balances/:employeeId` | Leave balances |
| Leave | GET | `/leave/calendar` | Leave calendar |
| Leave | GET | `/leave/pending-approvals` | Pending approvals (managers/hr) |
| Leave | POST | `/leave/approve/:approvalId` | Approve leave |
| Leave | POST | `/leave/reject/:approvalId` | Reject leave |
| Tasks | GET | `/tasks` | List tasks |
| Tasks | POST | `/tasks` | Create task |
| Tasks | PATCH | `/tasks/:id` | Update task |
| Notifications | GET | `/notifications` | List notifications |
| Recruitment | GET | `/recruitment/jobs` | Job postings |
| Recruitment | GET | `/recruitment/candidates` | Candidates |
| Recruitment | GET | `/recruitment/applications` | Applications |
| Recruitment | GET | `/recruitment/stats` | Recruitment stats |
| Attendance | GET | `/attendance/today` | Today's attendance |
| Attendance | POST | `/attendance/check-in` | Check in |
| Attendance | POST | `/attendance/check-out` | Check out |
| Compensation | GET | `/compensation/:employeeId/salary` | Salary info |
| Change requests | GET | `/change-requests` | List change requests |
| Change requests | POST | `/change-requests/employees/:employeeId/change-requests` | Submit change request |

---

### 2. Screens and UI Structure

**Login**
- Single screen: email and password fields, primary “Sign in” button.
- Loading state while request is in progress; clear error messages (invalid credentials, network error).
- Optional: “Remember me,” forgot password link if the API supports it.

**Main navigation (after login)**
- **Bottom tabs** or **drawer**: e.g. Home, Leave, Tasks, Notifications, Profile.
- Show only tabs the user is allowed (by role or `allowedModules`). Keep labels and icons clear.

**Home (Dashboard)**
- Summary cards or list: e.g. leave balance, pending tasks count, pending approvals (for managers/hr), recent notifications.
- Pull-to-refresh; loading and empty states.
- Tapping a card can navigate to the related module (e.g. Leave, Tasks).

**Profile**
- Display: name, email, role, employee id (if any).
- Logout button; optional links to “My leave,” “My documents,” etc., depending on API.

**Leave**
- List “My requests” with status, dates, type; filter or segment by status if useful.
- “New request” button opening a form (dates, type, reason, etc.) that calls the leave request API.
- Leave balances (by type if API provides).
- Calendar view if the calendar API returns useful data.
- For managers/hr: “Pending approvals” list with approve/reject actions.

**Tasks**
- List tasks (title, due date, status); optional filters.
- Create task (form); edit task (same or separate screen); mark complete (e.g. toggle or button).
- Empty state when there are no tasks.

**Notifications**
- List items with read/unread state if the API supports it.
- Tap to open related screen (e.g. task, leave request) when applicable.
- Empty state when there are no notifications.

**Optional modules (by role/time)**
- **Employees:** List and search; tap to open employee profile (read-only or editable per API).
- **Recruitment:** Jobs list, candidates, applications, simple stats (for hr/manager).
- **Attendance:** Today’s status; check-in / check-out buttons.
- **Change requests:** List and submit (form to the correct endpoint).

---

### 3. UX and Visual Design

- **Modern and clean:** Consistent spacing, typography, and hierarchy. Use a clear primary color for actions (buttons, links).
- **Light and dark theme:** Support both; respect system preference or add a toggle in Profile.
- **Platform feel:** Follow iOS and Android guidelines (navigation, gestures, list patterns) so the app feels native on each.
- **Loading and errors:** Spinner/skeleton on load; user-friendly messages for network errors, 401, 403, 5xx (e.g. “Something went wrong. Try again.”).
- **Forms:** Validate email and required fields before submit; show validation errors inline.
- **Empty states:** Dedicated copy and optional illustration for “No tasks,” “No notifications,” “No leave requests,” etc.
- **Accessibility:** Sufficient contrast, touch targets, and labels so the UI is usable for everyone.

---

### 4. Client-Side Technical Requirements

- **Auth state:** Global state or context for token and user; persist token in secure storage (e.g. SecureStore / Keychain / Keystore).
- **HTTP:** One client (fetch or axios); base URL from env; attach `Authorization: Bearer <token>` to all authenticated requests; on 401, clear token and redirect to login.
- **Config:** Single `API_BASE_URL` (env or Replit Secrets) for all environments.
- **No backend or server code:** Do not add or modify server routes, middleware, or database; only build the mobile UI that calls the existing API.

---

### 5. Deliverables

- One codebase that runs on **Android and iOS** (and optionally web if using Expo).
- **README:** How to set `API_BASE_URL`, how to run the app (e.g. `npx expo start` or `flutter run`), and any other env vars.
- **Polished UI:** Consistent layout, typography, and colors; role-based visibility; smooth navigation and transitions.

---

## PROMPT END
