-- Earned Leave and LWOP: require approval from both manager and HR.
-- Bereavement unchanged (manager-only unless other rules apply).

UPDATE leave_types
SET hr_approval_required = true
WHERE policy_id = (SELECT id FROM leave_policies WHERE name = 'Standard Leave Policy' LIMIT 1)
  AND (
    LOWER(name) LIKE '%earned%'
    OR LOWER(name) = 'lwop'
  );
