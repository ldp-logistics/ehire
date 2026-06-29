import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

export class NotificationRepository extends BaseRepository {
  /** Filter by employee branch region (leave, onboarding, offboarding, etc.). */
  private applyEmployeeRegionFilter(
    regions: string[] | null | undefined,
    eAlias: string,
    bAlias: string,
    conds: string[],
    params: unknown[],
  ): void {
    appendEffectiveRegionFilter(regions, eAlias, bAlias, conds, params);
  }

  /** Filter by job_postings.region_code (recruitment alerts). */
  private applyJobRegionFilter(
    regions: string[] | null | undefined,
    jAlias: string,
    conds: string[],
    params: unknown[],
  ): void {
    if (regions == null) return;
    if (regions.length === 0) {
      conds.push("1=0");
      return;
    }
    params.push(regions);
    conds.push(`${jAlias}.region_code = ANY($${params.length})`);
  }
  async getRecentFeedPosts() {
    return this.sql`
      SELECT p.id, p.content, p.created_at, e.first_name, e.last_name
      FROM feed_posts p
      INNER JOIN employees e ON e.id = p.author_employee_id
      WHERE p.created_at >= NOW() - INTERVAL '14 days'
      ORDER BY p.created_at DESC
      LIMIT 15
    ` as Promise<any[]>;
  }

  async getMyLeave(employeeId: string) {
    return this.sql`
      SELECT lr.id, lr.status, lr.start_date, lr.end_date, lr.applied_at, lt.name as type_name
      FROM leave_requests lr INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ${employeeId} ORDER BY lr.applied_at DESC LIMIT 5
    ` as Promise<any[]>;
  }

  /** Leave requests where this employee was listed in notify_employee_ids (they were notified when leave was applied). */
  async getLeaveWhereUserNotified(employeeId: string) {
    return this.sql`
      SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.applied_at, lt.name as type_name, e.first_name, e.last_name
      FROM leave_requests lr
      INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
      INNER JOIN employees e ON e.id = lr.employee_id
      WHERE lr.notify_employee_ids @> ${JSON.stringify([employeeId])}::jsonb
        AND lr.applied_at >= NOW() - INTERVAL '14 days'
      ORDER BY lr.applied_at DESC LIMIT 10
    ` as Promise<any[]>;
  }
  async getMyChangeRequests(requesterId: string) {
    return this.sql`
      SELECT id, status, created_at, category FROM change_requests
      WHERE requester_id = ${requesterId} ORDER BY created_at DESC LIMIT 5
    ` as Promise<any[]>;
  }
  async getMyOnboarding(employeeId: string) {
    return this.sql`
      SELECT r.id, r.status, r.created_at,
        (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id AND t.completed = false) as pending_tasks
      FROM onboarding_records r WHERE r.employee_id = ${employeeId} AND r.status = 'in_progress' LIMIT 1
    ` as Promise<any[]>;
  }
  async getPendingApprovals(employeeId: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [
      `la.approver_id = $1`,
      `la.status = 'pending'`,
      `lr.status = 'pending'`,
    ];
    const params: unknown[] = [employeeId];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, params);
    return this.sql(
      `SELECT la.id, la.leave_request_id, la.approver_role, lr.start_date, lr.end_date, lr.total_days,
              lt.name as type_name, e.first_name, e.last_name, lr.applied_at
       FROM leave_approvals la
       INNER JOIN leave_requests lr ON lr.id = la.leave_request_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
       INNER JOIN employees e ON e.id = lr.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY lr.applied_at ASC LIMIT 15`,
      params,
    ) as Promise<any[]>;
  }
  /** Org-wide pending leave steps (manager + hr + admin) for in-app HR inbox — mirrors Leave Approvals queue. */
  async getPendingLeaveApprovalsForHrOrgWide(limit = 15, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [
      `la.approver_role IN ('hr', 'admin', 'manager')`,
      `la.status = 'pending'`,
      `lr.status = 'pending'`,
    ];
    const params: unknown[] = [];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, params);
    params.push(limit);
    return this.sql(
      `SELECT la.id, la.leave_request_id, la.approver_role, lr.start_date, lr.end_date, lr.total_days,
              lt.name as type_name, e.first_name, e.last_name, lr.applied_at
       FROM leave_approvals la
       INNER JOIN leave_requests lr ON lr.id = la.leave_request_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
       INNER JOIN employees e ON e.id = lr.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY lr.applied_at ASC
       LIMIT $${params.length}`,
      params,
    ) as Promise<any[]>;
  }
  /** Scoped pending leave steps for limited_hr (employee requester dept/office). */
  async getPendingLeaveApprovalsForHrScoped(
    viewerEmployeeId: string,
    depts: string[],
    offices: string[],
    limit = 15,
    regions?: string[] | null,
  ) {
    if (regions != null && regions.length === 0) return [];
    const scopeParts: string[] = [];
    const ps: unknown[] = [viewerEmployeeId];
    if (depts.length > 0) {
      ps.push(depts);
      scopeParts.push(`e.department=ANY($${ps.length})`);
    }
    if (offices.length > 0) {
      ps.push(offices);
      scopeParts.push(`e.location=ANY($${ps.length})`);
    }
    const scopeWhere = scopeParts.length > 0 ? ` AND (${scopeParts.join(" OR ")})` : " AND 1=0";
    const conds = [
      `la.approver_role IN ('hr', 'admin', 'manager')`,
      `la.status = 'pending'`,
      `lr.status = 'pending'`,
      `lr.employee_id!=$1${scopeWhere}`,
    ];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, ps);
    ps.push(limit);
    return this.sql(
      `SELECT la.id, la.leave_request_id, la.approver_role, lr.start_date, lr.end_date, lr.total_days,
              lt.name as type_name, e.first_name, e.last_name, lr.applied_at
       FROM leave_approvals la
       INNER JOIN leave_requests lr ON lr.id = la.leave_request_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
       INNER JOIN employees e ON e.id = lr.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY lr.applied_at ASC
       LIMIT $${ps.length}`,
      ps,
    ) as Promise<any[]>;
  }
  async getPendingChangeCount(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [{ c: 0 }];
    const conds = [`cr.status = 'pending'`];
    const params: unknown[] = [];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, params);
    const rows = await this.sql(
      `SELECT COUNT(*)::int as c
       FROM change_requests cr
       JOIN employees e ON e.id = cr.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}`,
      params,
    ) as { c: number }[];
    return rows;
  }
  async getOnboardingInProgress(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [`r.status = 'in_progress'`];
    const params: unknown[] = [];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, params);
    return this.sql(
      `SELECT r.id, e.first_name, e.last_name, e.department, r.created_at
       FROM onboarding_records r
       INNER JOIN employees e ON e.id = r.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY r.created_at DESC LIMIT 5`,
      params,
    ) as Promise<any[]>;
  }
  async getTentativePending() {
    return this.sql`
      SELECT tr.id, a.id AS application_id, a.job_id, c.first_name, c.last_name, tr.created_at
      FROM tentative_records tr
      INNER JOIN applications a ON a.id = tr.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      WHERE tr.status = 'pending' AND a.stage = 'tentative' ORDER BY tr.created_at ASC LIMIT 5
    ` as Promise<any[]>;
  }
  async getOffboardingPending(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [`o.status IN ('initiated', 'in_notice')`];
    const params: unknown[] = [];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, params);
    return this.sql(
      `SELECT o.id, o.employee_id, e.first_name, e.last_name, o.exit_date, o.status, o.created_at
       FROM offboarding_records o
       INNER JOIN employees e ON e.id = o.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY o.exit_date ASC LIMIT 5`,
      params,
    ) as Promise<any[]>;
  }
  async getNewApplications(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [`a.stage IN ('applied', 'screening')`];
    const params: unknown[] = [];
    this.applyJobRegionFilter(regions, "j", conds, params);
    return this.sql(
      `SELECT a.id, a.job_id, c.first_name, c.last_name, j.title as job_title,
              a.stage_updated_at, a.applied_at, a.updated_at
       FROM applications a
       INNER JOIN candidates c ON c.id = a.candidate_id
       INNER JOIN job_postings j ON j.id = a.job_id
       WHERE ${conds.join(" AND ")}
       ORDER BY COALESCE(a.stage_updated_at, a.applied_at, a.updated_at) DESC NULLS LAST
       LIMIT 5`,
      params,
    ) as Promise<any[]>;
  }
  async getOffersSent(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [`a.stage = 'offer'`];
    const params: unknown[] = [];
    this.applyJobRegionFilter(regions, "j", conds, params);
    return this.sql(
      `SELECT a.id, a.job_id, c.first_name, c.last_name, j.title as job_title, a.updated_at
       FROM applications a
       INNER JOIN candidates c ON c.id = a.candidate_id
       INNER JOIN job_postings j ON j.id = a.job_id
       WHERE ${conds.join(" AND ")}
       ORDER BY a.updated_at DESC LIMIT 5`,
      params,
    ) as Promise<any[]>;
  }

  /** Draft offers awaiting HR/recruiter approval (limited-recruiter flow after "Ask for approval"). */
  async getOffersPendingApproval(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [
      `o.status = 'draft'`,
      `o.approval_status = 'pending'`,
      `o.approved_at IS NULL`,
    ];
    const params: unknown[] = [];
    this.applyJobRegionFilter(regions, "j", conds, params);
    return this.sql(
      `SELECT o.id AS offer_id, o.application_id, a.job_id, c.first_name, c.last_name, j.title AS job_title, o.updated_at
       FROM offers o
       INNER JOIN applications a ON a.id = o.application_id
       INNER JOIN candidates c ON c.id = a.candidate_id
       INNER JOIN job_postings j ON j.id = a.job_id
       WHERE ${conds.join(" AND ")}
       ORDER BY o.updated_at DESC
       LIMIT 10`,
      params,
    ) as Promise<any[]>;
  }

  /** Draft offers HR approved — notify original creator they may send the letter. */
  async getApprovedDraftOffersForCreator(userId: string) {
    return this.sql`
      SELECT o.id AS offer_id, o.application_id, a.job_id, c.first_name, c.last_name, j.title AS job_title, o.approved_at
      FROM offers o
      INNER JOIN applications a ON a.id = o.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      INNER JOIN job_postings j ON j.id = a.job_id
      WHERE o.created_by = ${userId}
        AND o.status = 'draft'
        AND o.approval_status = 'approved'
        AND o.approved_at IS NOT NULL
      ORDER BY o.approved_at DESC
      LIMIT 10
    ` as Promise<any[]>;
  }
  async getProbationAlerts(todayStr: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = [
      `e.probation_end_date IS NOT NULL`,
      `e.confirmation_date IS NULL`,
      `e.employment_status = 'active'`,
      `e.probation_end_date >= $1::date`,
      `e.probation_end_date <= ($1::date + INTERVAL '7 days')`,
    ];
    const params: unknown[] = [todayStr];
    this.applyEmployeeRegionFilter(regions, "e", "b", conds, params);
    return this.sql(
      `SELECT e.id, e.first_name, e.last_name, e.probation_end_date
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY e.probation_end_date ASC LIMIT 10`,
      params,
    ) as Promise<any[]>;
  }

  /** Sections in active onboarding records where the given employee is an assignee and there are incomplete tasks. */
  async getOnboardingAssignments(employeeId: string) {
    return this.sql`
      SELECT
        r.id              AS record_id,
        ee.first_name     AS hire_first,
        ee.last_name      AS hire_last,
        r.created_at,
        COUNT(t.id)::int  AS pending_tasks
      FROM onboarding_record_section_assignees a
      INNER JOIN onboarding_record_sections s  ON s.id  = a.section_id
      INNER JOIN onboarding_records r          ON r.id  = s.record_id
      INNER JOIN employees ee                  ON ee.id = r.employee_id
      INNER JOIN onboarding_tasks t            ON t.onboarding_record_id = r.id
                                              AND t.section_id = s.id
                                              AND t.completed = false
      WHERE a.employee_id = ${employeeId}
        AND r.status = 'in_progress'
      GROUP BY r.id, ee.first_name, ee.last_name, r.created_at
      HAVING COUNT(t.id) > 0
      ORDER BY r.created_at DESC LIMIT 10
    ` as Promise<any[]>;
  }

  async getEmployeeWorkEmailLower(employeeId: string) {
    const rows = await this.sql`
      SELECT lower(trim(work_email)) AS e
      FROM employees
      WHERE id = ${employeeId}
      LIMIT 1
    ` as { e: string | null }[];
    const v = rows[0]?.e;
    return v && v.length ? v : null;
  }

  /** Upcoming Timezone Planner meetings where this employee's work email is in attendee_emails. */
  async getUpcomingMeetingsWhereInvited(workEmailLower: string) {
    if (!workEmailLower.trim()) return [] as any[];
    return this.sql`
      SELECT
        sm.id,
        sm.title,
        sm.start_at,
        sm.end_at,
        sm.join_url,
        sm.created_at,
        sm.created_by_user_id,
        oe.first_name AS organizer_first_name,
        oe.last_name AS organizer_last_name
      FROM scheduled_meetings sm
      LEFT JOIN users u ON u.id = sm.created_by_user_id
      LEFT JOIN employees oe ON oe.id = u.employee_id
      WHERE sm.end_at >= NOW()
        AND EXISTS (
          SELECT 1
          FROM unnest(sm.attendee_emails) AS attendee_addr(addr)
          WHERE lower(trim(attendee_addr.addr)) = ${workEmailLower}
        )
      ORDER BY sm.start_at ASC
      LIMIT 20
    ` as Promise<any[]>;
  }

  /** Interview rounds with pending/draft feedback assigned to this employee. */
  async getFeedbackPendingForEmployee(employeeId: string) {
    return this.sql`
      SELECT
        f.id AS feedback_id, f.history_id, f.application_id, f.status AS feedback_status,
        h.scheduled_at, h.interview_type, h.interview_round, h.to_stage,
        a.job_id,
        c.first_name, c.last_name
      FROM interview_feedback f
      INNER JOIN application_stage_history h ON h.id = f.history_id
      INNER JOIN applications a ON a.id = f.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      WHERE f.reviewer_employee_id = ${employeeId}
        AND f.status IN ('pending', 'draft')
        AND h.scheduled_at IS NOT NULL
        AND COALESCE(h.scheduled_at_end, h.scheduled_at + interval '1 hour') <= NOW()
      ORDER BY h.scheduled_at DESC
      LIMIT 10
    ` as Promise<any[]>;
  }

  /** Active offboarding records where the given employee is assigned to at least one task. */
  async getOffboardingAssignments(employeeId: string) {
    return this.sql`
      SELECT DISTINCT o.id AS record_id, o.employee_id, e.first_name, e.last_name, o.exit_date, o.created_at,
        (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id AND t.assigned_to = ${employeeId} AND t.status = 'pending') AS my_pending_tasks
      FROM offboarding_tasks t
      INNER JOIN offboarding_records o ON o.id = t.offboarding_id
      INNER JOIN employees e ON e.id = o.employee_id
      WHERE t.assigned_to = ${employeeId} AND o.status IN ('initiated', 'in_notice')
      ORDER BY o.exit_date ASC LIMIT 10
    ` as Promise<any[]>;
  }

  /** Recent comments on tasks the user is involved in (not their own comments). */
  async getTaskCommentNotifications(userId: string, employeeId: string | null) {
    if (!employeeId) {
      return this.sql`
        SELECT tc.id, tc.created_at, tc.content, tc.author_name, t.id AS task_id, t.title AS task_title
        FROM task_comments tc
        INNER JOIN tasks t ON t.id = tc.task_id
        WHERE tc.created_at >= NOW() - INTERVAL '14 days'
          AND tc.author_id <> ${userId}
          AND t.created_by = ${userId}
        ORDER BY tc.created_at DESC
        LIMIT 15
      ` as Promise<any[]>;
    }
    return this.sql`
      SELECT tc.id, tc.created_at, tc.content, tc.author_name, t.id AS task_id, t.title AS task_title
      FROM task_comments tc
      INNER JOIN tasks t ON t.id = tc.task_id
      WHERE tc.created_at >= NOW() - INTERVAL '14 days'
        AND tc.author_id <> ${userId}
        AND (
          t.created_by = ${userId}
          OR t.assignee_id = ${employeeId}
          OR t.watcher_ids @> to_jsonb(${employeeId}::text)
        )
      ORDER BY tc.created_at DESC
      LIMIT 15
    ` as Promise<any[]>;
  }

  /** Tasks recently assigned to this employee by someone else. */
  async getTaskAssignedNotifications(userId: string, employeeId: string) {
    return this.sql`
      SELECT t.id, t.title, t.created_at, t.priority,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ce.first_name, ce.last_name)), ''), cu.email) AS creator_name
      FROM tasks t
      INNER JOIN users cu ON cu.id = t.created_by
      LEFT JOIN employees ce ON ce.id = cu.employee_id
      WHERE t.assignee_id = ${employeeId}
        AND t.created_by <> ${userId}
        AND t.status NOT IN ('done', 'cancelled')
        AND t.created_at >= NOW() - INTERVAL '14 days'
      ORDER BY t.created_at DESC
      LIMIT 10
    ` as Promise<any[]>;
  }

  /** Tasks the user created that were recently marked complete. */
  async getTaskCompletedNotifications(userId: string) {
    return this.sql`
      SELECT t.id, t.title, t.completed_at,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ae.first_name, ae.last_name)), ''), t.assignee_name) AS completed_by_name
      FROM tasks t
      LEFT JOIN employees ae ON ae.id = t.assignee_id
      WHERE t.created_by = ${userId}
        AND t.status = 'done'
        AND t.completed_at IS NOT NULL
        AND t.completed_at >= NOW() - INTERVAL '14 days'
      ORDER BY t.completed_at DESC
      LIMIT 10
    ` as Promise<any[]>;
  }
}
