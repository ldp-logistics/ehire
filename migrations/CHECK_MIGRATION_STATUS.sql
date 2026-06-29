-- ============================================================
-- Run this in pgAdmin to see which migrations are applied.
-- Each row shows a migration and whether its key object exists.
-- ============================================================

SELECT '0000_base' AS migration, CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employees') THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT '0001_ticket_comments', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ticket_comments') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0003_onboarding', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'onboarding_records') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0004_employment_onboarding', CASE WHEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'employment_status' AND e.enumlabel = 'onboarding') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0005_archived_job', CASE WHEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'job_posting_status' AND e.enumlabel = 'archived') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0006_attendance', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'attendance_records') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0007_tentative', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tentative_records') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0008_leave_roles', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leave_policies' AND column_name = 'applicable_roles') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0009_offer_token', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'response_token') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0010_user_roles', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'roles') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0011_ticket_attachment', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'attachment_url') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0012_allowed_modules', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'allowed_modules') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0013_rbac', CASE WHEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'user_role' AND e.enumlabel = 'it') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0014_tasks', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tasks') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0015_compensation', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'salary_details') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0016_employee_documents', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employee_documents') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0017_perf_indexes', CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_applications_applied_at') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0018_probation_reminders', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'probation_reminders') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0019_recruitment_workflow', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'recruitment_audit_log') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0028_applications_list_indexes', CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_applications_job_id_applied_at') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0020_leave_year_end', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employee_leave_balances' AND column_name = 'last_reset_at') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0021_standard_leave', CASE WHEN EXISTS (SELECT 1 FROM leave_policies WHERE name = 'Standard Leave Policy') AND (SELECT COUNT(*) FROM leave_types lt JOIN leave_policies lp ON lt.policy_id = lp.id WHERE lp.name = 'Standard Leave Policy') >= 3 THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0022_earned_monthly', CASE WHEN EXISTS (SELECT 1 FROM leave_types WHERE (LOWER(name) LIKE '%earned%' OR LOWER(name) LIKE '%annual%') AND accrual_type = 'monthly' AND accrual_rate = 1) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT '0023_cleanup_old_leave', CASE WHEN (SELECT COUNT(*) FROM leave_policies) <= 1 AND (SELECT COUNT(*) FROM leave_types lt JOIN leave_policies lp ON lt.policy_id = lp.id WHERE lp.name = 'Standard Leave Policy') = 3 THEN 'OK' ELSE 'RUN_0023_OR_MORE_POLICIES' END
ORDER BY 1;


