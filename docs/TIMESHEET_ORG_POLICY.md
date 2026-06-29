# Org timesheet policy (Settings)

Admin/HR configure **Settings → Timesheet policy**. **These values are the single source of truth** for attendance status math and expected hours on reports.

| Field | Purpose |
|--------|--------|
| **Policy timezone** | Optional IANA name for future HQ reporting; “today” and clock events still use user/request timezone where implemented. |
| **Work day start / end** | Expected window for **everyone**: late vs present, half-day length, overtime vs policy day length. |
| **Grace (minutes)** | After work day start, check-ins within this buffer stay **present**; after that → **late** (unless classified half-day by short hours). |
| **Half-day threshold (%)** | If time worked is **below** this share of the policy day length → **half_day**. |

**Shifts (`employee_shifts` / shift templates):** Still stored and shown (e.g. shift name on records) for scheduling and reporting. **They do not override** policy start/end/grace for status or timesheet expected hours.

**API:** `GET /api/attendance/timesheet-policy` (authenticated), `PATCH /api/attendance/timesheet-policy` (admin/hr).

**DB:** `org_timesheet_policy` single row (`id = 1`), migration `0065_org_timesheet_policy.sql`.
