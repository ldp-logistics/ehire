-- Remove old/custom leave policies and leave types; keep only "Standard Leave Policy" with Earned Leave, LWOP, Bereavement.
-- Run 0021 first (or this will create Standard Leave Policy if missing), then deletes all other policies and types and their data.

DO $$
DECLARE
  v_policy_id varchar(255);
  v_effective_from date := CURRENT_DATE;
BEGIN
  -- 1) Ensure "Standard Leave Policy" exists (same as 0021)
  SELECT id INTO v_policy_id FROM leave_policies WHERE name = 'Standard Leave Policy' LIMIT 1;
  IF v_policy_id IS NULL THEN
    INSERT INTO leave_policies (
      name, applicable_departments, applicable_employment_types, applicable_roles,
      effective_from, effective_to, is_active
    ) VALUES (
      'Standard Leave Policy',
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      v_effective_from,
      NULL,
      true
    )
    RETURNING id INTO v_policy_id;
  END IF;

  -- Ensure the three types exist under it
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE policy_id = v_policy_id AND LOWER(name) LIKE '%earned%') THEN
    INSERT INTO leave_types (policy_id, name, paid, accrual_type, accrual_rate, max_balance, carry_forward_allowed, max_carry_forward, requires_document, requires_approval, hr_approval_required, blocked_during_notice, color)
    VALUES (v_policy_id, 'Earned Leave', true, 'monthly', 1, 12, true, 6, false, true, false, false, '#22c55e');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE policy_id = v_policy_id AND LOWER(name) = 'lwop') THEN
    INSERT INTO leave_types (policy_id, name, paid, accrual_type, accrual_rate, max_balance, carry_forward_allowed, requires_document, requires_approval, hr_approval_required, blocked_during_notice, color)
    VALUES (v_policy_id, 'LWOP', false, 'none', NULL, 0, false, false, true, false, false, '#94a3b8');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE policy_id = v_policy_id AND LOWER(name) LIKE '%bereavement%') THEN
    INSERT INTO leave_types (policy_id, name, paid, accrual_type, accrual_rate, max_balance, carry_forward_allowed, requires_document, requires_approval, hr_approval_required, blocked_during_notice, color)
    VALUES (v_policy_id, 'Bereavement', true, 'none', NULL, 2, false, false, true, false, false, '#6366f1');
  END IF;

  -- 2) Remove attendance records created by leave system for requests that use OLD leave types (not under Standard Leave Policy)
  DELETE FROM attendance_records ar
  WHERE ar.created_by = 'leave_system'
    AND EXISTS (
      SELECT 1 FROM leave_requests lr
      INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ar.employee_id
        AND ar.date >= lr.start_date AND ar.date <= lr.end_date
        AND lt.policy_id != v_policy_id
    );

  -- 3) Delete leave approvals for requests that use old leave types
  DELETE FROM leave_approvals
  WHERE leave_request_id IN (
    SELECT lr.id FROM leave_requests lr
    INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lt.policy_id != v_policy_id
  );

  -- 4) Delete leave requests that use old leave types
  DELETE FROM leave_requests
  WHERE leave_type_id IN (SELECT id FROM leave_types WHERE policy_id != v_policy_id);

  -- 5) Delete employee leave balances for old leave types
  DELETE FROM employee_leave_balances
  WHERE leave_type_id IN (SELECT id FROM leave_types WHERE policy_id != v_policy_id);

  -- 6) Delete old leave types (not under Standard Leave Policy)
  DELETE FROM leave_types WHERE policy_id != v_policy_id;

  -- 7) Delete old policies (keep only Standard Leave Policy)
  DELETE FROM leave_policies WHERE id != v_policy_id;
END $$;
