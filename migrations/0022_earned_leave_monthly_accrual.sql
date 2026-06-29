-- Earned Leave = annual leave: 1 day per month (12 per year), pro-rated in join month (15 days = 0.5, 30 = 1).
-- Carry forward max 6; encash rest at year-end. Jan 1 balance = 0 + carry.

-- Set Earned Leave to monthly accrual, 1 day per month (existing or created by 0021).
UPDATE leave_types
SET accrual_type = 'monthly',
    accrual_rate = 1,
    updated_at = NOW()
WHERE LOWER(name) LIKE '%earned%' OR LOWER(name) LIKE '%annual%' OR LOWER(TRIM(name)) = 'el';
