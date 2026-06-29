# Employee Profile Timeline

## Overview

The **Timeline** tab on the employee profile shows a chronological list of milestones and events (join date, confirmation, probation, compensation changes, onboarding/offboarding, documents). It is built from existing data—there is no separate timeline table or sync job.

## How It Is Synced

The timeline is **not** a stored feed. It is **computed on demand** when you open the tab or when the API is called:

- **GET /api/employees/:id/timeline** aggregates:
  - **Employee record**: `join_date`, `confirmation_date`, `probation_start_date`, `probation_end_date`, `resignation_date`, `exit_date`
  - **Salary history**: `salary_details` for this employee (each row → “Compensation update” with date, reason, amount)
  - **Onboarding**: `onboarding_records` → “Onboarding started” (created_at), “Onboarding completed” (completed_at)
  - **Offboarding**: `offboarding_records` → “Offboarding initiated” (initiated_at), “Offboarding completed” (completed_at)
  - **Documents**: up to 5 most recent `employee_documents` with `uploaded_at` → “Document uploaded”
  - **Benefits**: `benefit_card_assignments` joined with `benefit_cards` → “Benefit assigned: {title}” (date = `assigned_at`, category, provider, card number, assigned by)

Events are merged, sorted by date descending, and returned as `{ events: [...] }`.

So:

- **No separate sync** is required. When you add/update employee data, compensation, onboarding, offboarding, or documents, the next time the timeline is loaded it will reflect those changes.
- **Source of truth** remains the existing tables (`employees`, `salary_details`, `onboarding_records`, `offboarding_records`, `employee_documents`). The timeline is a read-only view over them.

## When to Invalidate

The frontend invalidates the timeline when:

- The global `employee-updated` event fires for this employee (e.g. after onboarding completion or profile updates).

You can also invalidate when:

- A new salary revision is added or updated.
- An offboarding is initiated or completed.
- A document is uploaded.
- A benefit is assigned to the employee (Benefits module).

That way the timeline refetches and stays in sync with the rest of the app.

## Optional: Dedicated Timeline Table

If you later need:

- Events that don’t map to existing tables (e.g. “Manager change”, “Transfer”, “Promotion” as first-class events),
- Or a single place to query “all employee events” for reporting or feeds,

you can introduce an **employee_timeline_events** table (e.g. `employee_id`, `event_type`, `occurred_at`, `title`, `description`, `metadata`). Then:

- **Option A – Dual write**: When something significant happens (join, confirmation, salary change, onboarding/offboarding, etc.), also insert a row into `employee_timeline_events`. The timeline API would read from this table (and optionally still merge in document uploads from `employee_documents`).
- **Option B – Backfill job**: Keep the current “computed from existing data” API and add a nightly (or on-demand) job that writes the same events into `employee_timeline_events` for reporting. The profile Timeline tab can keep using the current API.

For most cases, the current **computed-on-demand** approach is enough and avoids duplicate data and sync logic.
