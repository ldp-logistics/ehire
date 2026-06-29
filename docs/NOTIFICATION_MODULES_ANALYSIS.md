# Notification flow by module — deep analysis

Using **Onboarding** as the reference:
- **Step A:** HR assigns someone as assignee → **Assignee gets a notification** ✓  
- **Step B:** Assignee completes a task → **HR does not get a notification** ✗  

Below is the same style of check for every module: at each important step, does the right person get a notification?

---

## 1. Leave

| Step | Who does it | Who should see it | Notification today? |
|------|-------------|-------------------|---------------------|
| Employee applies for leave | Employee | Manager/HR (to approve) | **Yes** — Manager/HR get "Leave approval needed" |
| Manager/HR approves | Manager/HR | Employee | **Yes** — Employee gets "Leave approved" |
| Manager/HR rejects | Manager/HR | Employee | **Yes** — Employee gets "Leave rejected" |
| Employee cancels request | Employee | Manager/HR | **No** — Request just disappears from approver’s list; no "Leave request cancelled" for manager |

**Summary:** Leave is mostly carried forward. **Gap:** Manager/HR are not explicitly notified when an employee cancels a leave request.

---

## 2. Change requests (Profile)

| Step | Who does it | Who should see it | Notification today? |
|------|-------------|-------------------|---------------------|
| Employee submits change request | Employee | HR | **Yes** — HR see "X profile change request(s) pending" |
| HR approves | HR | Employee | **Yes** — Employee gets "Profile change approved" |
| HR rejects | HR | Employee | **No** — Only "pending" and "approved" are shown. **No "Profile change rejected"** for employee |

**Summary:** One-way flow is covered; the return path when HR rejects is missing. **Gap:** Employee does not get a notification when their change request is rejected.

---

## 3. Onboarding (reference)

| Step | Who does it | Who should see it | Notification today? |
|------|-------------|-------------------|---------------------|
| New hire has in-progress onboarding | System | New hire | **Yes** — "X onboarding task(s) remaining" |
| HR assigns someone as assignee | HR | Assignee | **Yes** — "Onboarding tasks assigned to you for [hire]" |
| Assignee completes a task | Assignee | HR | **No** — HR only see "Onboarding in progress" list; no "Task completed by [assignee]" |
| Onboarding marked complete | HR/Manager | HR / person who completed | **Partial** — Local toast for completer; no server-driven "Onboarding completed for X" in notification centre for HR |

**Summary:** Assignee is notified when assigned; **gaps:** HR is not notified when an assignee completes a task, and there is no clear "Onboarding completed for X" notification for HR in the centre.

---

## 4. Recruitment

| Step | Who does it | Who should see it | Notification today? |
|------|-------------|-------------------|---------------------|
| Candidate applies | Candidate | HR | **Yes** — HR get "New application" (applied/screening) |
| Offer sent | HR | HR (reminder) | **Yes** — "Offer sent to X for Y" |
| Tentative — docs pending | System | HR | **Yes** — "Tentative hire — documents pending" |
| Offer accepted by candidate | Candidate | HR | **No** — No "Offer accepted" notification |
| Offer rejected by candidate | Candidate | HR | **No** — No "Offer rejected" notification |
| Interview scheduled | HR/Recruiter | Hiring manager / HR | **No** — No "Interview scheduled for X" |
| Application moved to interview/shortlist | HR | Hiring manager | **No** — Only "new application" (applied/screening); no "Ready for interview" |

**Summary:** Early steps (apply, offer sent, tentative) are covered for HR. **Gaps:** No notifications for offer accepted/rejected, interview scheduled, or stage changes (e.g. moved to interview).

---

## 5. Offboarding

| Step | Who does it | Who should see it | Notification today? |
|------|-------------|-------------------|---------------------|
| HR initiates offboarding for employee | HR | HR | **Yes** — "Offboarding in progress" list |
| Offboarding in progress | — | **Employee** (person leaving) | **No** — No "Your offboarding checklist" or "You have offboarding tasks" for the employee |
| Assignee completes an offboarding task | Assignee/HR | HR | **No** — No "Task X completed" for HR |
| Offboarding fully completed | HR | HR | **No** — Record drops from list; no "Offboarding completed for X" |

**Summary:** Only HR’s "in progress" list exists. **Gaps:** The employee going through offboarding gets no notifications; HR gets no step-by-step or completion notifications.

---

## 6. People (Probation)

| Step | Who does it | Who should see it | Notification today? |
|------|-------------|-------------------|---------------------|
| Probation ending in 7 days | System | HR | **Yes** — "Probation ending soon for X" |
| Probation ending in 7 days | System | **Employee** (the person on probation) | **No** — Only HR is notified |

**Summary:** HR is notified. **Gap:** Employee does not get a "Your probation ends in X days" notification (may be intentional).

---

## Overall summary

| Module | Employee/assignee notified when something is *for them*? | Manager/HR notified when something *happens* (e.g. task done, cancelled, rejected)? |
|--------|----------------------------------------------------------|-------------------------------------------------------------------------------------|
| **Leave** | Yes (approved, rejected, pending) | Yes (approval needed). **Gap:** No "request cancelled" for manager |
| **Change requests** | Yes (pending, approved). **Gap:** No "rejected" | Yes (pending count) |
| **Onboarding** | Yes (my tasks, tasks assigned to me) | Yes (in progress list). **Gaps:** No "assignee completed task", no "onboarding completed" in centre |
| **Recruitment** | N/A (candidate is external) | Yes (new application, offer sent, tentative). **Gaps:** No offer accepted/rejected, no interview scheduled, no stage change |
| **Offboarding** | **No** — Employee gets nothing | Yes (in progress list). **Gaps:** No "task completed", no "offboarding completed" |
| **Probation** | **No** — Only HR | Yes (probation ending soon) |

So notifications are **not** fully carried forward in every module. The main missing pieces:

1. **Change requests:** Employee notified when **rejected**.  
2. **Leave:** Manager/HR notified when employee **cancels** a request.  
3. **Onboarding:** HR notified when **assignee completes a task** (and optionally "Onboarding completed for X" in centre).  
4. **Offboarding:** **Employee** notified (e.g. "Your offboarding checklist"); optionally HR for task completed / offboarding completed.  
5. **Recruitment:** HR notified for **offer accepted/rejected**, **interview scheduled**, and possibly **stage changes**.  
6. **Probation (optional):** Employee notified "Your probation ends in X days".

If you tell me which of these you want first, I can outline the exact code changes (repository + service + any new notification types) to add them.
