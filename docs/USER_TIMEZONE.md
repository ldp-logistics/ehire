# Per-User Timezone (Settings)

Each user can set their own timezone in **Settings → General → Your timezone**. This is used for "today", attendance, and leave dates.

## Setup

1. **Run migration** – `0043_add_user_timezone.sql` adds `users.time_zone` (optional IANA name).
2. **Optional env** – `DEFAULT_TIMEZONE` in `.env` is used when the user has not set a timezone (e.g. `Asia/Karachi` or `UTC`).

## Where it’s used

- **Attendance** – Check-in/out "today", shift late/on-time, GET /today, stats, daily-summary default date.
- **Leave** – Apply "today", policy effective date, types-for-employee, calendar default range, stats.

All of these use the **logged-in user’s** timezone (from Settings). If not set, the server uses `DEFAULT_TIMEZONE` or `UTC`.

## IANA names (examples)

- Pakistan: `Asia/Karachi`
- US Eastern: `America/New_York`
- India: `Asia/Kolkata`
- UK: `Europe/London`
- UAE: `Asia/Dubai`
