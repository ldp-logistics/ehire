-- Standard leave: one policy with exactly three types — Earned Leave (12, carry 6), LWOP (unpaid), Bereavement (2).
-- Idempotent: creates policy and types only if missing.

DO $$
DECLARE
  v_policy_id varchar(255);
  v_effective_from date := CURRENT_DATE;
BEGIN
  -- Ensure one "Standard Leave Policy" exists
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

  -- Earned Leave (annual): 1 per month = 12/year, pro-rated in join month (15 days = 0.5, 30 = 1), carry 6, encash rest
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE policy_id = v_policy_id AND LOWER(name) LIKE '%earned%') THEN
    INSERT INTO leave_types (
      policy_id, name, paid, accrual_type, accrual_rate, max_balance,
      carry_forward_allowed, max_carry_forward, requires_document, requires_approval,
      hr_approval_required, blocked_during_notice, color
    ) VALUES (
      v_policy_id, 'Earned Leave', true, 'monthly', 1, 12,
      true, 6, false, true,
      false, false, '#22c55e'
    );
  END IF;

  -- LWOP: unpaid, no accrual, no balance limit
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE policy_id = v_policy_id AND LOWER(name) = 'lwop') THEN
    INSERT INTO leave_types (
      policy_id, name, paid, accrual_type, accrual_rate, max_balance,
      carry_forward_allowed, requires_document, requires_approval,
      hr_approval_required, blocked_during_notice, color
    ) VALUES (
      v_policy_id, 'LWOP', false, 'none', NULL, 0,
      false, false, true,
      false, false, '#94a3b8'
    );
  END IF;

  -- Bereavement: 2 days only, paid, no accrual
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE policy_id = v_policy_id AND LOWER(name) LIKE '%bereavement%') THEN
    INSERT INTO leave_types (
      policy_id, name, paid, accrual_type, accrual_rate, max_balance,
      carry_forward_allowed, requires_document, requires_approval,
      hr_approval_required, blocked_during_notice, color
    ) VALUES (
      v_policy_id, 'Bereavement', true, 'none', NULL, 2,
      false, false, true,
      false, false, '#6366f1'
    );
  END IF;
END $$;
