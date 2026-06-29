-- Set Bereavement balance to 2 for all employees who currently have 0 (or NULL).
-- Leave type is "Bereavement" with max_balance 2; initialization was previously giving 0 for accrual_type 'none'.
UPDATE employee_leave_balances elb
SET balance = 2, updated_at = NOW()
FROM leave_types lt
WHERE elb.leave_type_id = lt.id
  AND LOWER(lt.name) LIKE '%bereavement%'
  AND (elb.balance IS NULL OR elb.balance::numeric = 0);
