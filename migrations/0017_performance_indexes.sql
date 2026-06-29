-- ==========================================
-- Performance Indexes Migration
-- Adds missing indexes for frequently filtered, sorted, and joined columns
-- All statements are idempotent (IF NOT EXISTS)
-- ==========================================

-- ========== EMPLOYEES ==========
CREATE INDEX IF NOT EXISTS idx_employees_created_at ON employees(created_at);
CREATE INDEX IF NOT EXISTS idx_employees_join_date ON employees(join_date);
CREATE INDEX IF NOT EXISTS idx_employees_status_dept ON employees(employment_status, department);

-- ========== USERS ==========
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- ========== JOB POSTINGS ==========
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at ON job_postings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_hiring_manager ON job_postings(hiring_manager_id) WHERE hiring_manager_id IS NOT NULL;

-- ========== APPLICATIONS ==========
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_job_stage ON applications(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_applications_employee_id ON applications(employee_id) WHERE employee_id IS NOT NULL;

-- ========== APPLICATION STAGE HISTORY ==========
CREATE INDEX IF NOT EXISTS idx_stage_history_created_at ON application_stage_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_history_app_created ON application_stage_history(application_id, created_at DESC);

-- ========== CANDIDATES ==========
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at DESC);

-- ========== OFFERS ==========
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_status_sent ON offers(status, sent_at DESC) WHERE status = 'sent';

-- ========== LEAVE REQUESTS ==========
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id ON leave_requests(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_applied_at ON leave_requests(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp_status ON leave_requests(employee_id, status, applied_at DESC);

-- ========== LEAVE APPROVALS ==========
CREATE INDEX IF NOT EXISTS idx_leave_approvals_request_step ON leave_approvals(leave_request_id, step_order);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_approver_pending ON leave_approvals(approver_id, status) WHERE status = 'pending';

-- ========== LEAVE AUDIT LOG ==========
CREATE INDEX IF NOT EXISTS idx_leave_audit_created_at ON leave_audit_log(created_at DESC);

-- ========== LEAVE POLICIES ==========
CREATE INDEX IF NOT EXISTS idx_leave_policies_effective ON leave_policies(effective_from, effective_to);

-- ========== TASKS ==========
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_id, status) WHERE assignee_id IS NOT NULL;

-- ========== TASK COMMENTS ==========
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_created ON task_comments(task_id, created_at);

-- ========== ATTENDANCE RECORDS ==========
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date_status ON attendance_records(employee_id, date, status);

-- ========== ATTENDANCE AUDIT ==========
CREATE INDEX IF NOT EXISTS idx_attendance_audit_created_at ON attendance_audit(created_at DESC);

-- ========== TENTATIVE RECORDS ==========
CREATE INDEX IF NOT EXISTS idx_tentative_records_status ON tentative_records(status);
CREATE INDEX IF NOT EXISTS idx_tentative_records_created_at ON tentative_records(created_at DESC);

-- ========== TENTATIVE DOCUMENTS ==========
CREATE INDEX IF NOT EXISTS idx_tentative_docs_status ON tentative_documents(status);
CREATE INDEX IF NOT EXISTS idx_tentative_docs_record_status ON tentative_documents(tentative_record_id, status);

-- ========== ONBOARDING ==========
CREATE INDEX IF NOT EXISTS idx_onboarding_records_created_at ON onboarding_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_record_sort ON onboarding_tasks(onboarding_record_id, sort_order);

-- ========== OFFBOARDING ==========
CREATE INDEX IF NOT EXISTS idx_offboarding_initiated_at ON offboarding_records(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_offboarding_status ON offboarding_tasks(offboarding_id, status);

-- ========== CHANGE REQUESTS ==========
CREATE INDEX IF NOT EXISTS idx_change_requests_created_at ON change_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_status_created ON change_requests(status, created_at DESC) WHERE status = 'pending';

-- ========== ASSETS ==========
CREATE INDEX IF NOT EXISTS idx_stock_items_created_at ON stock_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assigned_systems_assigned_date ON assigned_systems(assigned_date DESC) WHERE assigned_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assigned_systems_user_status ON assigned_systems(user_id, status) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_items_created_at ON procurement_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_received_items_created_at ON received_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created ON support_tickets(status, created_at DESC);

-- ========== EMPLOYEE DOCUMENTS ==========
CREATE INDEX IF NOT EXISTS idx_employee_docs_document_type ON employee_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_employee_docs_tentative_doc ON employee_documents(tentative_document_id) WHERE tentative_document_id IS NOT NULL;

-- ========== COMPENSATION ==========
CREATE INDEX IF NOT EXISTS idx_salary_details_start_date ON salary_details(employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_banking_details_employee_primary ON banking_details(employee_id, is_primary DESC);
CREATE INDEX IF NOT EXISTS idx_bonuses_employee_date ON bonuses(employee_id, bonus_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_grants_employee_date ON stock_grants(employee_id, grant_date DESC);
