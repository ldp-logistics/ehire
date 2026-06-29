-- Bereavement: no approval required (auto-approved).

UPDATE leave_types
SET requires_approval = false
WHERE policy_id = (SELECT id FROM leave_policies WHERE name = 'Standard Leave Policy' LIMIT 1)
  AND LOWER(name) LIKE '%bereavement%';
