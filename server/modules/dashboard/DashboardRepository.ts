import { BaseRepository } from "../../core/base/BaseRepository.js";

export class DashboardRepository extends BaseRepository {
  /** When `users.employee_id` is null, match login email to employee work/personal email. */
  async findEmployeeIdByLoginEmail(email: string): Promise<string | null> {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    const r = await this.sql`SELECT id FROM employees WHERE LOWER(TRIM(work_email))=${e} OR LOWER(TRIM(COALESCE(personal_email,'')))=${e} LIMIT 1` as { id: string }[];
    return r[0]?.id ?? null;
  }

  async employeePanel(employeeId: string, t: string) {
    return Promise.all([
      this.sql`SELECT id,first_name,last_name,nickname,employment_status,employee_id,job_title,department,avatar,join_date FROM employees WHERE id=${employeeId}` as Promise<any[]>,
      this.sql`SELECT id,check_in_time,check_out_time,status FROM attendance_records WHERE employee_id=${employeeId} AND date=${t}` as Promise<any[]>,
      this.sql`SELECT elb.balance,elb.used,lt.name as type_name,lt.max_balance,lt.color FROM employee_leave_balances elb INNER JOIN leave_types lt ON lt.id=elb.leave_type_id WHERE elb.employee_id=${employeeId} ORDER BY lt.name` as Promise<any[]>,
      this.sql`SELECT lr.id,lr.start_date,lr.end_date,lr.total_days,lr.status,lt.name as type_name,lt.color FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lr.employee_id=${employeeId} AND lr.status='pending' ORDER BY lr.applied_at DESC LIMIT 5` as Promise<any[]>,
      this.sql`SELECT lr.id,lr.start_date,lr.end_date,lr.total_days,lt.name as type_name,lt.color FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lr.employee_id=${employeeId} AND lr.status='approved' AND lr.start_date>=${t} ORDER BY lr.start_date ASC LIMIT 5` as Promise<any[]>,
      this.sql`SELECT s.id,s.asset_id as serial_number,(SELECT st.name FROM stock_items st WHERE st.id=s.asset_id OR s.asset_id LIKE st.id||'-%' LIMIT 1) as system_name,(SELECT st.product_type FROM stock_items st WHERE st.id=s.asset_id OR s.asset_id LIKE st.id||'-%' LIMIT 1) as system_type FROM assigned_systems s WHERE s.user_id=${employeeId} ORDER BY s.created_at DESC LIMIT 5` as Promise<any[]>,
      this.sql`SELECT r.id,r.status,r.created_at,(SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id=r.id) as task_count,(SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id=r.id AND t.completed=true) as completed_count FROM onboarding_records r WHERE r.employee_id=${employeeId} AND r.status='in_progress' LIMIT 1` as Promise<any[]>,
    ]);
  }

  async managerPanel(employeeId: string, t: string) {
    return Promise.all([
      this.sql`SELECT COUNT(*)::int as team_size FROM employees WHERE manager_id=${employeeId} AND employment_status IN('active','onboarding','on_leave')` as Promise<any[]>,
      this.sql`SELECT e.id,e.first_name,e.last_name,e.nickname,e.avatar,lt.name as type_name,lt.color FROM leave_requests lr INNER JOIN employees e ON e.id=lr.employee_id INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE e.manager_id=${employeeId} AND lr.status='approved' AND lr.start_date<=${t} AND lr.end_date>=${t}` as Promise<any[]>,
      this.sql`SELECT la.id,la.leave_request_id,la.approver_role,la.step_order,lr.start_date,lr.end_date,lr.total_days,lr.day_type,lr.reason,lt.name as type_name,lt.color,e.first_name,e.last_name,e.nickname,e.avatar,e.department FROM leave_approvals la INNER JOIN leave_requests lr ON lr.id=la.leave_request_id INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id WHERE la.approver_id=${employeeId} AND la.status='pending' AND lr.status='pending' ORDER BY lr.applied_at ASC LIMIT 10` as Promise<any[]>,
      this.sql`SELECT e.id,e.first_name,e.last_name,e.nickname,e.avatar,e.department FROM employees e WHERE e.manager_id=${employeeId} AND e.employment_status='active' AND e.id NOT IN(SELECT employee_id FROM attendance_records WHERE date=${t}) AND e.id NOT IN(SELECT lr.employee_id FROM leave_requests lr WHERE lr.status='approved' AND lr.start_date<=${t} AND lr.end_date>=${t})` as Promise<any[]>,
      this.sql`SELECT e.id,e.first_name,e.last_name,e.nickname,e.avatar,o.offboarding_type,o.exit_date as last_working_date FROM offboarding_records o INNER JOIN employees e ON e.id=o.employee_id WHERE e.manager_id=${employeeId} AND o.status IN('initiated','in_notice') ORDER BY o.exit_date ASC` as Promise<any[]>,
    ]);
  }

  async hrPanel(t: string, regions?: string[] | null) {
    // Region scope: null = no filter; [] = none (ANY('{}') is false → fail-closed).
    const noR = regions == null;
    const rArr = regions ?? [];
    return Promise.all([
      this.sql`SELECT COUNT(*)::int as total FROM employees WHERE employment_status IN('active','onboarding','on_leave') AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees WHERE DATE(join_date)=${t} AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees WHERE DATE(exit_date)=${t} AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT r.id,e.first_name,e.last_name,e.nickname,e.department,(SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id=r.id) as task_count,(SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id=r.id AND t.completed=true) as completed_count FROM onboarding_records r INNER JOIN employees e ON e.id=r.employee_id WHERE r.status='in_progress' AND (${noR} OR r.region_code = ANY(${rArr})) ORDER BY r.created_at ASC LIMIT 10` as Promise<any[]>,
      this.sql`SELECT tr.id,tr.status,a.id as application_id,a.job_id,c.first_name,c.last_name,tr.created_at,(SELECT COUNT(*)::int FROM tentative_documents td WHERE td.tentative_record_id=tr.id) as doc_count,(SELECT COUNT(*)::int FROM tentative_documents td WHERE td.tentative_record_id=tr.id AND td.status='verified') as verified_count FROM tentative_records tr INNER JOIN applications a ON a.id=tr.application_id INNER JOIN candidates c ON c.id=a.candidate_id WHERE tr.status='pending' AND a.stage='tentative' AND (${noR} OR a.region_code = ANY(${rArr})) ORDER BY tr.created_at ASC LIMIT 10` as Promise<any[]>,
      this.sql`SELECT o.id,o.employee_id,o.offboarding_type,o.status,o.exit_date as last_working_date,e.first_name,e.last_name,e.nickname,e.department FROM offboarding_records o INNER JOIN employees e ON e.id=o.employee_id WHERE o.status IN('initiated','in_notice') AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY o.exit_date ASC LIMIT 10` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees WHERE employment_status IN('active','onboarding') AND (manager_id IS NULL OR manager_id='') AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees e WHERE e.employment_status IN('active','onboarding') AND NOT EXISTS(SELECT 1 FROM employee_leave_balances elb WHERE elb.employee_id=e.id) AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM tentative_records tr INNER JOIN applications a ON a.id=tr.application_id WHERE tr.status='pending' AND a.stage='tentative' AND tr.created_at<NOW()-INTERVAL'7 days' AND (${noR} OR a.region_code = ANY(${rArr}))` as Promise<any[]>,
      this.sql`SELECT COUNT(DISTINCT o.id)::int as count FROM offboarding_records o INNER JOIN assigned_systems s ON s.user_id=o.employee_id INNER JOIN employees e ON e.id=o.employee_id WHERE o.status IN('initiated','in_notice') AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT a.id,c.first_name,c.last_name,j.title as job_title,j.department FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id WHERE a.stage='interview' AND (${noR} OR a.region_code = ANY(${rArr})) ORDER BY a.stage_updated_at DESC LIMIT 10` as Promise<any[]>,
    ]);
  }

  async adminPanel(t: string, som: string, regions?: string[] | null) {
    const noR = regions == null;
    const rArr = regions ?? [];
    return Promise.all([
      this.sql`SELECT COUNT(*)::int as total FROM employees WHERE employment_status IN('active','onboarding','on_leave') AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees WHERE employment_status IN('terminated','resigned','offboarded') AND DATE(exit_date)>=${som} AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT department,COUNT(*)::int as count FROM employees WHERE employment_status IN('active','onboarding','on_leave') AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) GROUP BY department ORDER BY count DESC` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees WHERE DATE(join_date)>=${som} AND DATE(join_date)<=${t} AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as count FROM employees WHERE employment_status IN('terminated','resigned','offboarded') AND DATE(exit_date)>=${som} AND DATE(exit_date)<=${t} AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as present FROM attendance_records ar INNER JOIN employees e ON e.id=ar.employee_id WHERE ar.date=${t} AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT COUNT(*)::int as total FROM employees WHERE employment_status='active' AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))` as Promise<any[]>,
      this.sql`SELECT (SELECT COUNT(*)::int FROM assigned_systems) as assigned,(SELECT COUNT(*)::int FROM stock_items WHERE quantity>0) as stock_items,(SELECT COUNT(*)::int FROM assigned_systems s INNER JOIN offboarding_records o ON o.employee_id=s.user_id INNER JOIN employees e ON e.id=o.employee_id WHERE o.status IN('initiated','in_notice') AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))) as pending_return` as Promise<any[]>,
      this.sql`SELECT (SELECT COUNT(*)::int FROM offboarding_records o INNER JOIN employees e ON e.id=o.employee_id WHERE o.status IN('initiated','in_notice') AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr})))) as offboarding,(SELECT COUNT(*)::int FROM tentative_records tr INNER JOIN applications a ON a.id=tr.application_id WHERE tr.status='pending' AND a.stage='tentative' AND (${noR} OR a.region_code = ANY(${rArr}))) as tentative,(SELECT COUNT(*)::int FROM onboarding_records WHERE status='in_progress' AND (${noR} OR region_code = ANY(${rArr}))) as onboarding` as Promise<any[]>,
    ]);
  }

  /**
   * Super Region (Pakistan) cross-region rollup — one row per region_code.
   * Uses our real statuses: onboarding 'in_progress', offboarding 'initiated'/'in_notice'.
   */
  async regionRollup() {
    return this.sql`
      SELECT
        b.region_code,
        COUNT(DISTINCT e.id) AS total_employees,
        COUNT(DISTINCT CASE WHEN e.employment_status IN ('active','onboarding','on_leave') THEN e.id END) AS active,
        COUNT(DISTINCT CASE WHEN o.status = 'in_progress' THEN o.id END) AS pending_onboarding,
        COUNT(DISTINCT CASE WHEN off.status IN ('initiated','in_notice') THEN off.id END) AS pending_offboarding
      FROM branches b
      LEFT JOIN employees e          ON e.branch_id = b.id
      LEFT JOIN onboarding_records o  ON o.employee_id = e.id
      LEFT JOIN offboarding_records off ON off.employee_id = e.id
      WHERE b.region_code IS NOT NULL
      GROUP BY b.region_code
      ORDER BY b.region_code
    ` as Promise<any[]>;
  }

  async probationAlerts(todayStr: string, regions?: string[] | null) {
    const noR = regions == null;
    const rArr = regions ?? [];
    return this.sql`SELECT id,first_name,last_name,nickname,probation_end_date FROM employees WHERE probation_end_date IS NOT NULL AND (confirmation_date IS NULL) AND employment_status='active' AND probation_end_date>=${todayStr}::date AND probation_end_date<=(${todayStr}::date+INTERVAL'7 days') AND (${noR} OR branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY probation_end_date ASC` as Promise<any[]>;
  }

  async sharedWidgets(t: string, regions?: string[] | null) {
    const noR = regions == null;
    const rArr = regions ?? [];
    return Promise.all([
      this.sql`SELECT e.id,e.first_name,e.last_name,e.nickname,e.job_title,e.department,e.avatar,e.dob FROM employees e WHERE e.employment_status IN('active','onboarding','on_leave') AND e.dob IS NOT NULL AND (EXTRACT(MONTH FROM e.dob),EXTRACT(DAY FROM e.dob)) IN(SELECT EXTRACT(MONTH FROM d)::int,EXTRACT(DAY FROM d)::int FROM generate_series(${t}::date,${t}::date+interval'6 days','1 day') AS d) AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY EXTRACT(MONTH FROM e.dob),EXTRACT(DAY FROM e.dob) LIMIT 100` as Promise<any[]>,
      this.sql`SELECT e.id,e.first_name,e.last_name,e.nickname,e.job_title,e.department,e.avatar,e.join_date FROM employees e WHERE e.employment_status IN('active','onboarding','on_leave') AND (EXTRACT(MONTH FROM e.join_date),EXTRACT(DAY FROM e.join_date)) IN(SELECT EXTRACT(MONTH FROM d)::int,EXTRACT(DAY FROM d)::int FROM generate_series(${t}::date,${t}::date+interval'6 days','1 day') AS d) AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY EXTRACT(MONTH FROM e.join_date),EXTRACT(DAY FROM e.join_date) LIMIT 100` as Promise<any[]>,
      this.sql`SELECT e.id,e.first_name,e.last_name,e.nickname,e.job_title,e.department,e.avatar,e.join_date FROM employees e WHERE e.employment_status IN('active','onboarding','on_leave') AND e.join_date>=${t}::date-interval'7 days' AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY e.join_date DESC LIMIT 100` as Promise<any[]>,
    ]);
  }

  async activityEmployee(employeeId: string) { return this.sql`SELECT 'leave' as type,lr.id,lr.status,lr.applied_at as timestamp,lt.name as detail,lt.color FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lr.employee_id=${employeeId} ORDER BY lr.applied_at DESC LIMIT 5` as Promise<any[]>; }
  async activityManager(employeeId: string) { return this.sql`SELECT 'leave' as type,lr.id,lr.status,lr.applied_at as timestamp,lt.name as detail,lt.color,e.first_name,e.last_name,e.nickname FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id WHERE e.manager_id=${employeeId} AND lr.applied_at>=NOW()-INTERVAL'7 days' ORDER BY lr.applied_at DESC LIMIT 8` as Promise<any[]>; }
  async activityHR(regions?: string[] | null) {
    const noR = regions == null;
    const rArr = regions ?? [];
    return Promise.all([
      // Use created_at for "when this appeared in the system". join_date is the official start date and can differ (e.g. backdated hires).
      this.sql`SELECT e.first_name,e.last_name,e.nickname,e.department,e.join_date,e.created_at AS timestamp FROM employees e WHERE e.created_at>=NOW()-INTERVAL'14 days' AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY e.created_at DESC LIMIT 5` as Promise<any[]>,
      this.sql`SELECT lr.status,lr.applied_at as timestamp,lt.name as detail,lt.color,e.first_name,e.last_name,e.nickname FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id WHERE lr.applied_at>=NOW()-INTERVAL'7 days' AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY lr.applied_at DESC LIMIT 5` as Promise<any[]>,
      this.sql`SELECT o.status,o.created_at as timestamp,o.offboarding_type,e.first_name,e.last_name,e.nickname FROM offboarding_records o INNER JOIN employees e ON e.id=o.employee_id WHERE o.created_at>=NOW()-INTERVAL'14 days' AND (${noR} OR e.branch_id IN (SELECT id FROM branches WHERE region_code = ANY(${rArr}))) ORDER BY o.created_at DESC LIMIT 5` as Promise<any[]>,
    ]);
  }
}
