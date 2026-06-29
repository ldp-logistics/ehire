-- Enforce one balance per employee per leave type.
-- Step 1: Merge any duplicate (employee_id, leave_type_id) rows (keep one, sum balance/used, delete rest).
-- Step 2: Drop old index and create unique index.

-- 1a. For each duplicate group, update the "keeper" row (latest updated_at, then max id) with summed balance and used
WITH dupes AS (
  SELECT employee_id, leave_type_id
  FROM employee_leave_balances
  GROUP BY employee_id, leave_type_id
  HAVING COUNT(*) > 1
),
group_sums AS (
  SELECT elb.employee_id, elb.leave_type_id,
    SUM((elb.balance)::numeric) AS s_balance,
    SUM((elb.used)::numeric) AS s_used
  FROM employee_leave_balances elb
  INNER JOIN dupes d ON d.employee_id = elb.employee_id AND d.leave_type_id = elb.leave_type_id
  GROUP BY elb.employee_id, elb.leave_type_id
),
keepers AS (
  SELECT DISTINCT ON (elb.employee_id, elb.leave_type_id) elb.employee_id, elb.leave_type_id, elb.id AS keeper_id
  FROM employee_leave_balances elb
  INNER JOIN dupes d ON d.employee_id = elb.employee_id AND d.leave_type_id = elb.leave_type_id
  ORDER BY elb.employee_id, elb.leave_type_id, elb.updated_at DESC NULLS LAST, elb.id DESC
)
UPDATE employee_leave_balances elb
SET balance = gs.s_balance, used = gs.s_used, updated_at = NOW()
FROM keepers k, group_sums gs
WHERE elb.id = k.keeper_id AND k.employee_id = gs.employee_id AND k.leave_type_id = gs.leave_type_id;

-- 1b. Delete the non-keeper rows in duplicate groups
DELETE FROM employee_leave_balances
WHERE (employee_id, leave_type_id) IN (
  SELECT employee_id, leave_type_id
  FROM employee_leave_balances
  GROUP BY employee_id, leave_type_id
  HAVING COUNT(*) > 1
)
AND id NOT IN (
  SELECT DISTINCT ON (employee_id, leave_type_id) id
  FROM employee_leave_balances
  WHERE (employee_id, leave_type_id) IN (
    SELECT employee_id, leave_type_id
    FROM employee_leave_balances
    GROUP BY employee_id, leave_type_id
    HAVING COUNT(*) > 1
  )
  ORDER BY employee_id, leave_type_id, updated_at DESC NULLS LAST, id DESC
);

-- 2. Create unique index
DROP INDEX IF EXISTS leave_balances_unique_idx;

CREATE UNIQUE INDEX leave_balances_employee_leave_type_unique
  ON employee_leave_balances (employee_id, leave_type_id);
