# Recruitment tables – indexes for GET /applications

GET `/api/recruitment/applications` runs a query like:

```sql
FROM applications a
INNER JOIN candidates c ON c.id = a.candidate_id
INNER JOIN job_postings j ON j.id = a.job_id
LEFT JOIN offers o ON o.application_id = a.id
LEFT JOIN tentative_records tr ON tr.application_id = a.id
WHERE a.job_id = $1  -- optional
ORDER BY a.applied_at DESC
LIMIT $2 OFFSET $3
```

Heavy joins without the right indexes will slow this down. Below is what should exist and how to check.

---

## 1. `applications`

| Purpose | Index | Used by |
|--------|--------|--------|
| Primary key | `applications_pkey` (id) | JOINs by id |
| Filter by job | `applications_job_id_idx` (job_id) | Drizzle schema |
| Filter by candidate | `applications_candidate_id_idx` (candidate_id) | Drizzle schema |
| **Sort** | `idx_applications_applied_at` (applied_at DESC) | **0017** |
| Filter + sort by job | `idx_applications_job_id_applied_at` (job_id, applied_at DESC) | **0028** |
| Filter + sort by candidate | `idx_applications_candidate_id_applied_at` (candidate_id, applied_at DESC) | **0028** |

Run migration **0017_performance_indexes.sql** (adds `idx_applications_applied_at`) and **0028_applications_list_indexes.sql** (adds the two composite indexes) if you haven’t.

---

## 2. `application_stage_history`

Not used in the **list** endpoint; only in GET `/applications/:id`. For that route you want:

| Index | Purpose |
|-------|--------|
| `stage_history_application_id_idx` (application_id) | Drizzle schema – JOIN by application |
| `idx_stage_history_app_created` (application_id, created_at DESC) | **0017** – history in order |

---

## 3. `candidates`

| Index | Purpose |
|-------|--------|
| `candidates_pkey` (id) | JOIN `c.id = a.candidate_id` |
| `candidates_email_unique` | Uniqueness |
| `candidates_name_idx` (first_name, last_name) | Search/display |

No extra index needed for the list query (join is on `candidates.id` PK).

---

## 4. `job_postings`

| Index | Purpose |
|-------|--------|
| `job_postings_pkey` (id) | JOIN `j.id = a.job_id` |
| `job_postings_status_idx`, `job_postings_department_idx` | Filters elsewhere |

No extra index needed for the list query (join is on `job_postings.id` PK).

---

## 5. `offers` (LEFT JOIN)

| Index | Purpose |
|-------|--------|
| `offers_application_id_unique` (application_id) | Drizzle – JOIN `o.application_id = a.id` |

---

## 6. `tentative_records` (LEFT JOIN)

| Index | Purpose |
|-------|--------|
| `idx_tentative_application` (application_id) | **0007** – JOIN `tr.application_id = a.id` |

---

## How to check in PostgreSQL

```sql
-- List indexes on these tables
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('applications', 'application_stage_history', 'candidates', 'job_postings', 'offers', 'tentative_records')
ORDER BY tablename, indexname;
```

Or describe each table (as with `\d`):

```sql
\d applications
\d application_stage_history
\d candidates
\d job_postings
\d offers
\d tentative_records
```

---

## If GET /applications is still slow

1. **Confirm migrations 0017 and 0028 are applied**  
   Run `migrations/CHECK_MIGRATION_STATUS.sql` and ensure `0017_perf_indexes` and (if you add it) 0028 show as applied.

2. **Update statistics**  
   `ANALYZE applications;` (and optionally other tables above) so the planner can choose indexes correctly.

3. **Inspect the plan**  
   Run the same SELECT (with your real `job_id`/`candidate_id` or no filter) with `EXPLAIN (ANALYZE, BUFFERS)` to see if it uses the indexes above or does sequential scans.
