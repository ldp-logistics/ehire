-- Backfill policy_snapshot for existing leave_requests (historical integrity).
-- Idempotent: only updates rows where policy_snapshot IS NULL.

UPDATE leave_requests lr
SET policy_snapshot = jsonb_build_object(
  'policyName', lp.name,
  'leaveTypeName', lt.name,
  'maxBalance', lt.max_balance,
  'paid', lt.paid,
  'requiresApproval', lt.requires_approval
)
FROM leave_types lt
JOIN leave_policies lp ON lp.id = lt.policy_id
WHERE lr.leave_type_id = lt.id
  AND lr.policy_snapshot IS NULL;
