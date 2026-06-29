-- Branch-level date display (Freshteam-style); used with branch time_zone for regional UX.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS date_format varchar(32) DEFAULT 'dd/MM/yyyy';
COMMENT ON COLUMN branches.date_format IS 'Display pattern for dates in UI, e.g. dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd';
