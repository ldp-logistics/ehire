-- ============================================================
-- 0130: Fix benefit_cards wrongly tagged IN-N (Pakistan-only data)
--
-- Cards were created while super admin had India North selected
-- in the nav, but all assignees are PK employees.
-- Idempotent.
-- ============================================================

-- Cards tagged IN-N where every active assignee is on a PK branch → PK
UPDATE benefit_cards bc
SET region_code = 'PK',
    updated_at  = NOW()
WHERE bc.region_code = 'IN-N'
  AND EXISTS (
    SELECT 1
    FROM benefit_card_assignments bca
    WHERE bca.benefit_card_id = bc.id
      AND bca.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM benefit_card_assignments bca
    JOIN employees e ON e.id = bca.employee_id
    JOIN branches b ON b.id = e.branch_id
    WHERE bca.benefit_card_id = bc.id
      AND bca.status = 'active'
      AND COALESCE(b.region_code, '') <> 'PK'
  );

-- IN-N cards with no assignments: re-tag from creator's branch region
UPDATE benefit_cards bc
SET region_code = b.region_code,
    updated_at  = NOW()
FROM users u
LEFT JOIN employees e ON e.id = u.employee_id
LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
WHERE bc.created_by = u.id
  AND bc.region_code = 'IN-N'
  AND b.region_code IS NOT NULL
  AND b.region_code <> 'IN-N'
  AND NOT EXISTS (
    SELECT 1 FROM benefit_card_assignments bca
    WHERE bca.benefit_card_id = bc.id AND bca.status = 'active'
  );
