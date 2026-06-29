import { BaseRepository } from "../../core/base/BaseRepository.js";

export interface OnboardingRow {
  id: string; employee_id: string; owner_id: string; status: string;
  template_id?: string | null;
  template_name?: string | null;
  checklist_reopened_at?: Date | null;
  completed_at: Date | null; created_at: Date; updated_at: Date;
  first_name?: string; last_name?: string; work_email?: string;
  job_title?: string | null; department?: string | null; join_date?: string | null;
  task_count?: number; completed_count?: number;
}
export interface OnboardingTaskRow {
  id: string; onboarding_record_id: string; task_name: string; category: string;
  section_id?: string | null;
  completed: string | boolean; assignment_details: string | null; completed_at: Date | null;
  sort_order: number; created_at: Date; updated_at: Date;
  requires_assignment?: boolean;
}
export interface OnboardingRecordSectionRow {
  id: string; record_id: string; template_section_id: string | null;
  name: string; description: string | null; sort_order: number; created_at: Date;
}
export interface OnboardingSectionAssigneeRow {
  id: string; section_id: string; employee_id: string;
  first_name?: string; last_name?: string; avatar?: string | null;
  created_at: Date;
}
export interface InitiateSectionTaskInput {
  taskName: string;
  requiresAssignment?: boolean;
}
export interface InitiateSectionInput {
  templateSectionId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  assigneeIds: string[];
  tasks: InitiateSectionTaskInput[] | string[]; // support legacy string[] for backward compat
}

export class OnboardingRepository extends BaseRepository {
  async findAll(regions?: string[] | null): Promise<OnboardingRow[]> {
    // Region scope: null = no filter; [] = none (ANY('{}') always false → fail-closed).
    // COALESCE(record.region_code, employee.branch.region_code) so legacy NULL rows still match.
    const noRegion = regions == null;
    const regionArr = regions ?? [];
    return this.sql`
      SELECT r.id, r.employee_id, r.owner_id, r.status, r.completed_at, r.created_at, r.updated_at,
             e.first_name, e.last_name, e.work_email, e.job_title, e.department, e.join_date,
             (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id) as task_count,
             (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id AND t.completed = true) as completed_count
      FROM onboarding_records r
      INNER JOIN employees e ON e.id = r.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE (${noRegion} OR COALESCE(r.region_code, b.region_code) = ANY(${regionArr}))
      ORDER BY r.status ASC, r.created_at DESC
    ` as unknown as Promise<OnboardingRow[]>;
  }

  /** True if assignee has incomplete tasks on an in-progress onboarding (nav + API scope). */
  async hasInProgressAssignments(employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM onboarding_records r
      INNER JOIN onboarding_record_sections s ON s.record_id = r.id
      INNER JOIN onboarding_record_section_assignees a ON a.section_id = s.id AND a.employee_id = ${employeeId}
      INNER JOIN onboarding_tasks t ON t.section_id = s.id AND t.onboarding_record_id = r.id
      WHERE r.status = 'in_progress' AND t.completed = false
      LIMIT 1
    ` as { "?column?": number }[];
    return rows.length > 0;
  }

  /** Records where the employee is assignee and still has open tasks in their sections. */
  async findAllWhereAssignee(employeeId: string): Promise<OnboardingRow[]> {
    return this.sql`
      SELECT DISTINCT r.id, r.employee_id, r.owner_id, r.status, r.completed_at, r.created_at, r.updated_at,
             e.first_name, e.last_name, e.work_email, e.job_title, e.department, e.join_date,
             (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id) as task_count,
             (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id AND t.completed = true) as completed_count
      FROM onboarding_records r
      INNER JOIN employees e ON e.id = r.employee_id
      INNER JOIN onboarding_record_sections s ON s.record_id = r.id
      INNER JOIN onboarding_record_section_assignees a ON a.section_id = s.id AND a.employee_id = ${employeeId}
      INNER JOIN onboarding_tasks t ON t.section_id = s.id AND t.onboarding_record_id = r.id
      WHERE r.status = 'in_progress' AND t.completed = false
      ORDER BY r.status ASC, r.created_at DESC
    ` as unknown as Promise<OnboardingRow[]>;
  }

  async isAssigneeOfRecord(recordId: string, employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM onboarding_record_section_assignees a
      INNER JOIN onboarding_record_sections s ON s.id = a.section_id
      WHERE s.record_id = ${recordId} AND a.employee_id = ${employeeId} LIMIT 1
    ` as { "?column?": number }[];
    return rows.length > 0;
  }

  /** Assignee with at least one incomplete task in their sections on this record. */
  async hasActiveAssigneeWorkOnRecord(recordId: string, employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM onboarding_records r
      INNER JOIN onboarding_record_sections s ON s.record_id = r.id
      INNER JOIN onboarding_record_section_assignees a ON a.section_id = s.id AND a.employee_id = ${employeeId}
      INNER JOIN onboarding_tasks t ON t.section_id = s.id AND t.onboarding_record_id = r.id
      WHERE r.id = ${recordId} AND r.status = 'in_progress' AND t.completed = false
      LIMIT 1
    ` as { "?column?": number }[];
    return rows.length > 0;
  }

  /** True if the task belongs to a section where the given employee is an assignee. */
  async isAssigneeOfTaskSection(recordId: string, taskId: string, employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM onboarding_tasks t
      INNER JOIN onboarding_record_section_assignees a ON a.section_id = t.section_id
      WHERE t.id = ${taskId} AND t.onboarding_record_id = ${recordId} AND a.employee_id = ${employeeId} LIMIT 1
    ` as { "?column?": number }[];
    return rows.length > 0;
  }

  async findById(id: string): Promise<OnboardingRow | null> {
    const rows = await this.sql`
      SELECT r.*, e.first_name, e.last_name, e.work_email, e.job_title, e.department, e.join_date
      FROM onboarding_records r INNER JOIN employees e ON e.id = r.employee_id WHERE r.id = ${id}
    ` as OnboardingRow[];
    return rows[0] ?? null;
  }

  async findByEmployeeId(employeeId: string): Promise<OnboardingRow | null> {
    const rows = await this.sql`
      SELECT r.*,
        (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id) as task_count,
        (SELECT COUNT(*)::int FROM onboarding_tasks t WHERE t.onboarding_record_id = r.id AND t.completed = true) as completed_count
      FROM onboarding_records r WHERE r.employee_id = ${employeeId} ORDER BY r.created_at DESC LIMIT 1
    ` as OnboardingRow[];
    return rows[0] ?? null;
  }

  async findExistingByEmployee(employeeId: string): Promise<{ id: string; status: string } | null> {
    const rows = await this.sql`SELECT id, status FROM onboarding_records WHERE employee_id = ${employeeId}` as any[];
    return rows[0] ?? null;
  }

  async getEmployeeStatus(employeeId: string): Promise<{ id: string; employment_status: string; department?: string | null } | null> {
    const rows = await this.sql`SELECT id, employment_status, department FROM employees WHERE id = ${employeeId}` as any[];
    return rows[0] ?? null;
  }

  async getEmployeeDetails(employeeId: string): Promise<any | null> {
    const rows = await this.sql`SELECT first_name, last_name, job_title, department, work_email, join_date FROM employees WHERE id = ${employeeId}` as any[];
    return rows[0] ?? null;
  }

  async getTasks(recordId: string): Promise<OnboardingTaskRow[]> {
    return this.sql`SELECT * FROM onboarding_tasks WHERE onboarding_record_id = ${recordId} ORDER BY sort_order ASC, created_at ASC` as unknown as Promise<OnboardingTaskRow[]>;
  }

  async getTaskById(taskId: string, recordId: string): Promise<OnboardingTaskRow | null> {
    const rows = await this.sql`SELECT * FROM onboarding_tasks WHERE id = ${taskId} AND onboarding_record_id = ${recordId}` as OnboardingTaskRow[];
    return rows[0] ?? null;
  }

  async create(employeeId: string, ownerId: string, templateId?: string | null, templateName?: string | null): Promise<OnboardingRow> {
    // region_code derived from the employee's branch (multi-region access control).
    const rows = await this.sql`
      INSERT INTO onboarding_records (employee_id, owner_id, status, template_id, template_name, region_code)
      VALUES (
        ${employeeId}, ${ownerId}, 'in_progress', ${templateId ?? null}, ${templateName ?? null},
        (SELECT b.region_code FROM employees e JOIN branches b ON b.id = e.branch_id WHERE e.id = ${employeeId})
      ) RETURNING *
    ` as OnboardingRow[];
    return rows[0];
  }

  /** Create record + sections + assignees + tasks atomically via sequential inserts. */
  async initiateWithSections(
    employeeId: string,
    ownerId: string,
    templateId: string | null,
    templateName: string | null,
    sections: InitiateSectionInput[],
  ): Promise<OnboardingRow> {
    const record = await this.create(employeeId, ownerId, templateId, templateName);
    for (const sec of sections) {
      const sRows = await this.sql`
        INSERT INTO onboarding_record_sections (record_id, template_section_id, name, description, sort_order)
        VALUES (${record.id}, ${sec.templateSectionId}, ${sec.name}, ${sec.description}, ${sec.sortOrder}) RETURNING id
      ` as { id: string }[];
      const sectionId = sRows[0].id;
      for (const empId of sec.assigneeIds) {
        await this.sql`
          INSERT INTO onboarding_record_section_assignees (section_id, employee_id) VALUES (${sectionId}, ${empId}) ON CONFLICT DO NOTHING
        `;
      }
      for (let i = 0; i < sec.tasks.length; i++) {
        const t = sec.tasks[i];
        const taskName = typeof t === "string" ? t : t.taskName;
        const requiresAssignment = typeof t !== "string" && t.requiresAssignment === true;
        await this.sql`
          INSERT INTO onboarding_tasks (onboarding_record_id, section_id, task_name, category, sort_order, requires_assignment)
          VALUES (${record.id}, ${sectionId}, ${taskName}, 'Section', ${i}, ${requiresAssignment})
        `;
      }
    }
    return record;
  }

  async update(id: string, status: string, completedAt: string | null): Promise<OnboardingRow> {
    await this.sql`UPDATE onboarding_records SET status = ${status}, completed_at = ${completedAt}, updated_at = NOW() WHERE id = ${id}`;
    if (status === "completed") {
      const rec = await this.findById(id);
      if (rec?.employee_id) {
        await this.sql`UPDATE employees SET employment_status = 'active', updated_at = NOW() WHERE id = ${rec.employee_id}`;
      }
    }
    return (await this.findById(id))!;
  }

  /** Reopen a completed checklist so HR can add late-arriving items (keeps template snapshot + first completed_at). */
  async reopenChecklist(id: string): Promise<OnboardingRow> {
    await this.sql`
      UPDATE onboarding_records
      SET status = 'in_progress', checklist_reopened_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
    `;
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM onboarding_tasks WHERE onboarding_record_id = ${id}`;
    await this.sql`DELETE FROM onboarding_records WHERE id = ${id}`;
  }

  async getSections(recordId: string): Promise<OnboardingRecordSectionRow[]> {
    return this.sql`
      SELECT * FROM onboarding_record_sections WHERE record_id = ${recordId} ORDER BY sort_order ASC, created_at ASC
    ` as unknown as Promise<OnboardingRecordSectionRow[]>;
  }

  async getSectionAssignees(sectionId: string): Promise<OnboardingSectionAssigneeRow[]> {
    return this.sql`
      SELECT a.id, a.section_id, a.employee_id, a.created_at, e.first_name, e.last_name, e.avatar
      FROM onboarding_record_section_assignees a
      INNER JOIN employees e ON e.id = a.employee_id
      WHERE a.section_id = ${sectionId}
    ` as unknown as Promise<OnboardingSectionAssigneeRow[]>;
  }

  async getAllSectionAssignees(recordId: string): Promise<OnboardingSectionAssigneeRow[]> {
    return this.sql`
      SELECT a.id, a.section_id, a.employee_id, a.created_at, e.first_name, e.last_name, e.avatar
      FROM onboarding_record_section_assignees a
      INNER JOIN employees e ON e.id = a.employee_id
      INNER JOIN onboarding_record_sections s ON s.id = a.section_id
      WHERE s.record_id = ${recordId}
    ` as unknown as Promise<OnboardingSectionAssigneeRow[]>;
  }

  /** Returns true if a new assignee row was inserted. */
  async addSectionAssignee(sectionId: string, employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO onboarding_record_section_assignees (section_id, employee_id) VALUES (${sectionId}, ${employeeId}) ON CONFLICT DO NOTHING
      RETURNING id
    ` as { id: string }[];
    return rows.length > 0;
  }

  /** Context for section-assignment emails (employee being onboarded + section). */
  async getSectionAssignmentEmailContext(recordId: string, sectionId: string) {
    const r = await this.sql`
      SELECT
        s.id AS section_id,
        s.name AS section_name,
        r.id AS onboarding_record_id,
        r.employee_id,
        r.status AS record_status,
        e.first_name,
        e.last_name,
        e.department,
        e.employee_id AS emp_code
      FROM onboarding_record_sections s
      INNER JOIN onboarding_records r ON r.id = s.record_id
      INNER JOIN employees e ON e.id = r.employee_id
      WHERE s.id = ${sectionId} AND s.record_id = ${recordId}
    ` as any[];
    return r[0] ?? null;
  }

  async getSectionTaskNames(sectionId: string): Promise<{ task_name: string }[]> {
    return this.sql`
      SELECT task_name FROM onboarding_tasks WHERE section_id = ${sectionId} ORDER BY sort_order ASC, created_at ASC
    ` as unknown as Promise<{ task_name: string }[]>;
  }

  async removeSectionAssignee(sectionId: string, employeeId: string): Promise<void> {
    await this.sql`DELETE FROM onboarding_record_section_assignees WHERE section_id = ${sectionId} AND employee_id = ${employeeId}`;
  }

  async addTask(recordId: string, taskName: string, sectionId?: string | null, requiresAssignment = false): Promise<OnboardingTaskRow> {
    const scope = sectionId
      ? await this.sql`SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM onboarding_tasks WHERE onboarding_record_id = ${recordId} AND section_id = ${sectionId}` as any[]
      : await this.sql`SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM onboarding_tasks WHERE onboarding_record_id = ${recordId} AND section_id IS NULL` as any[];
    const sortOrder = scope[0]?.next_order ?? 0;
    const rows = await this.sql`
      INSERT INTO onboarding_tasks (onboarding_record_id, section_id, task_name, category, sort_order, requires_assignment)
      VALUES (${recordId}, ${sectionId ?? null}, ${taskName}, 'Section', ${sortOrder}, ${requiresAssignment}) RETURNING *
    ` as OnboardingTaskRow[];
    return rows[0];
  }

  async updateTask(taskId: string, recordId: string, completed: boolean, details: string | null): Promise<OnboardingTaskRow> {
    const rows = await this.sql`
      UPDATE onboarding_tasks SET
        completed = ${completed},
        assignment_details = COALESCE(${details}, assignment_details),
        completed_at = CASE WHEN ${completed} THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE id = ${taskId} AND onboarding_record_id = ${recordId} RETURNING *
    ` as OnboardingTaskRow[];
    return rows[0];
  }

  async getEmployeeWorkEmail(employeeId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT work_email FROM employees WHERE id = ${employeeId} LIMIT 1
    `) as { work_email: string | null }[];
    const v = rows[0]?.work_email;
    return v != null && String(v).trim() ? String(v).trim() : null;
  }

  async setEmployeeWorkEmail(employeeId: string, email: string): Promise<void> {
    await this.sql`UPDATE employees SET work_email = ${email}, updated_at = NOW() WHERE id = ${employeeId}`;
  }

  async setEmployeeNickname(employeeId: string, nickname: string): Promise<void> {
    await this.sql`UPDATE employees SET nickname = ${nickname}, updated_at = NOW() WHERE id = ${employeeId}`;
  }

  async deleteTask(taskId: string, recordId: string): Promise<void> {
    await this.sql`DELETE FROM onboarding_tasks WHERE id = ${taskId} AND onboarding_record_id = ${recordId}`;
  }
}
