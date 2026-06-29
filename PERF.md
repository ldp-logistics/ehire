# Performance Improvements

Summary of backend and database performance optimizations. RBAC and backward compatibility are preserved.

## 1. N+1 query fixes

- **Recruitment – GET /api/recruitment/jobs**  
  Hiring manager names were resolved with one DB call per job. Now all unique hiring-manager IDs are collected and resolved in a single batch query; a `Map` is used to attach names to each job. A helper `batchResolveEmployeeNames(ids)` returns `Map<id, displayName>` and is used by the jobs list.

## 2. Pagination

Unbounded list endpoints now support `limit` and `offset` with sensible defaults and caps:

| Endpoint | Default limit | Max |
|----------|----------------|-----|
| GET /api/recruitment/jobs | 100 | 500 |
| GET /api/employees | 500 | 2000 |
| GET /api/change-requests | 100 | 500 |
| GET /api/assets/stock | 100 | 500 |
| GET /api/leave/requests | 200 | 500 |

Existing endpoints that already had pagination (e.g. GET /api/recruitment/candidates, /applications, GET /api/tasks, GET /api/leave/my-requests) were left as-is or only adjusted for consistency (e.g. leave /requests now supports `offset` and configurable `limit`).

## 3. Caching

- **In-memory TTL cache** (`server/lib/perf.ts` – `memCache`): used for stable or expensive data.
  - **Employees list** (GET /api/employees): 10s TTL when no `limit`/`offset` (dropdown usage).
  - **Leave policies** (GET /api/leave/policies): 30s TTL; cache invalidated on policy create/update.
- Cache keys can be invalidated by prefix via `memCache.invalidate(keyPrefix)`.

## 4. Performance logging

- **Slow-request warning** (`server/lib/perf.ts` – `perfLogger`): any API request that takes ≥300ms is logged with `[PERF] SLOW method path status took Xms`.
- Existing request-duration logging in `app.ts` (e.g. on `res.finish`) remains in place.

## 5. Database indexes

Migration **`migrations/0017_performance_indexes.sql`** adds idempotent indexes for:

- **Employees**: `created_at`, `join_date`, `(employment_status, department)`
- **Users**: `role`, `is_active`
- **Job postings**: `created_at DESC`, `hiring_manager_id`
- **Applications**: `applied_at DESC`, `(job_id, stage)`, `employee_id`
- **Application stage history**, **candidates**, **offers**
- **Leave**: requests (e.g. `employee_id`, `status`, `applied_at`), approvals, audit, policies
- **Tasks**: `priority`, `created_at`, `(assignee_id, status)`; task_comments
- **Attendance**: status, `(employee_id, date, status)`; audit
- **Tentative**: records and documents (status, created_at, record_id)
- **Onboarding / offboarding**: created_at, initiated_at, task ordering
- **Change requests**: created_at, status
- **Assets**: stock_items, assigned_systems, procurement, invoices, support_tickets
- **Employee documents**, **compensation** (salary_details, banking_details, bonuses, stock_grants)

All index statements use `CREATE INDEX IF NOT EXISTS` so the migration is safe to run repeatedly.

## 6. Async / parallelization

- Leave request validation (employee + leave type) uses `Promise.all` for the two lookups.
- Dashboard and other routes that already used `Promise.all` for independent queries were not changed.

## 7. Backward compatibility and RBAC

- All list endpoints remain backward compatible: default `limit`/`offset` yield the same first-page behavior as before where applicable.
- No RBAC rules were relaxed; access control is unchanged.
- Migrations are additive (indexes only); no destructive schema changes.

## Applying the index migration

Run your usual migration path, e.g.:

```bash
psql $DATABASE_URL -f migrations/0017_performance_indexes.sql
```

Or use your project’s migration runner if it executes SQL files in order.
