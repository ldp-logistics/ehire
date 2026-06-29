-- Leave policies: unit (days/hours), workweek, holiday calendar, period start, default flag
ALTER TABLE leave_policies
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unit varchar(10) NOT NULL DEFAULT 'days',
  ADD COLUMN IF NOT EXISTS workweek jsonb NOT NULL DEFAULT '[1,2,3,4,5]',
  ADD COLUMN IF NOT EXISTS holiday_calendar_name text,
  ADD COLUMN IF NOT EXISTS period_start_month integer NOT NULL DEFAULT 1;

-- Leave types: proration, negative balance, carryover expiry,
--   backdating limit, min notice, conditional doc, on-behalf doc, waiting period
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS proration_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_negative_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carryover_expiry_days integer,
  ADD COLUMN IF NOT EXISTS backdating_limit_days integer,
  ADD COLUMN IF NOT EXISTS min_notice_days integer,
  ADD COLUMN IF NOT EXISTS mandatory_attachment_above_days integer,
  ADD COLUMN IF NOT EXISTS mandatory_attachment_on_behalf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiting_period_days integer;
