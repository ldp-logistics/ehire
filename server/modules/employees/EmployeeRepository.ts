import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

const ALLOWED_FIELDS = ["employee_id","work_email","first_name","middle_name","last_name","nickname","avatar","job_title","department","sub_department","business_unit","primary_team","cost_center","grade","job_category","location","branch_id","role","manager_id","manager_email","hr_email","employment_status","employee_type","shift","leave_approval_tier","personal_email","personal_phone","work_phone","dob","gender","marital_status","blood_group","street","city","state","country","zip_code","comm_street","comm_city","comm_state","comm_country","comm_zip_code","join_date","probation_start_date","probation_end_date","confirmation_date","notice_period","resignation_date","exit_date","exit_type","resignation_reason","eligible_for_rehire","custom_field_1","custom_field_2","source"];

export { ALLOWED_FIELDS };

export class EmployeeRepository extends BaseRepository {
  private readonly LIST_COLS = "id,employee_id,work_email,first_name,middle_name,last_name,nickname,job_title,department,sub_department,business_unit,location,grade,employment_status,employee_type,join_date,manager_id,city,state,country,avatar,personal_phone,work_phone";

  async list(includeInactive: boolean, limit: number, offset: number) {
    if (includeInactive) return this.sql(`SELECT ${this.LIST_COLS} FROM employees ORDER BY first_name,last_name LIMIT $1 OFFSET $2`, [limit, offset]) as Promise<any[]>;
    return this.sql(`SELECT ${this.LIST_COLS} FROM employees WHERE employment_status IN('active','onboarding','on_leave') ORDER BY first_name,last_name LIMIT $1 OFFSET $2`, [limit, offset]) as Promise<any[]>;
  }

  /**
   * Region scope: branch.region_code first, then location/country heuristics
   * (same rules as timesheets, leave, notifications).
   */
  private addRegionWhere(
    regions: string[] | null | undefined,
    conds: string[],
    params: any[],
    eAlias = "e",
    bAlias = "b",
  ) {
    appendEffectiveRegionFilter(regions, eAlias, bAlias, conds, params);
  }

  private listColsFor(alias?: string) {
    if (!alias) return this.LIST_COLS;
    return this.LIST_COLS.split(",").map((c) => `${alias}.${c.trim()}`).join(",");
  }

  private employeeFrom(regions: string[] | null | undefined) {
    return regions != null
      ? "employees e LEFT JOIN branches b ON b.id = e.branch_id"
      : "employees";
  }

  private qualify(table: string, regions: string[] | null | undefined) {
    return regions != null ? "e" : table;
  }

  /** Operational-risk filters (dashboard deep-links). */
  private addRiskWhere(risk: string | undefined, conds: string[], table = "employees") {
    const r = (risk || "").trim().toLowerCase();
    if (r === "no_manager") {
      conds.push(`(${table}.manager_id IS NULL OR TRIM(COALESCE(${table}.manager_id,''))='')`);
    } else if (r === "no_leave_policy") {
      conds.push(
        `NOT EXISTS (SELECT 1 FROM employee_leave_balances elb WHERE elb.employee_id = ${table}.id)`
      );
    }
  }

  async findBranchIdByLocationName(location: string | null | undefined): Promise<string | null> {
    const loc = String(location ?? "").trim();
    if (!loc) return null;
    const rows = await this.sql`
      SELECT id FROM branches WHERE LOWER(TRIM(name)) = LOWER(${loc}) LIMIT 1
    ` as { id: string }[];
    return rows[0]?.id ?? null;
  }

  async searchWithScope(q: string, department: string | undefined, status: string, includeInactive: boolean, limit: number, offset: number, allowedDepts: string[], allowedOffices: string[], risk?: string, regions?: string[] | null) {
    const conds: string[] = []; const params: any[] = [];
    const t = this.qualify("employees", regions);
    const from = this.employeeFrom(regions);
    const cols = this.listColsFor(regions != null ? "e" : undefined);
    if (!includeInactive) conds.push(`${t}.employment_status IN('active','onboarding','on_leave')`);
    this.addRiskWhere(risk, conds, t);
    this.addRegionWhere(regions, conds, params);
    if (q) {
      const pat = `%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
      params.push(pat);
      const n = params.length;
      conds.push(`(LOWER(${t}.first_name) LIKE $${n} OR LOWER(${t}.last_name) LIKE $${n} OR LOWER(${t}.first_name || ' ' || ${t}.last_name) LIKE $${n} OR LOWER(COALESCE(${t}.nickname,'')) LIKE $${n} OR LOWER(${t}.work_email) LIKE $${n} OR LOWER(${t}.employee_id) LIKE $${n} OR LOWER(COALESCE(${t}.job_title,'')) LIKE $${n})`);
    }
    if (department) { params.push(department); conds.push(`${t}.department=$${params.length}`); }
    if (status) { params.push(status); conds.push(`${t}.employment_status=$${params.length}`); }

    const scopeParts: string[] = [];
    if (allowedDepts.length > 0) { params.push(allowedDepts); scopeParts.push(`${t}.department=ANY($${params.length})`); }
    if (allowedOffices.length > 0) { params.push(allowedOffices); scopeParts.push(`${t}.location=ANY($${params.length})`); }
    if (scopeParts.length > 0) conds.push(`(${scopeParts.join(" OR ")})`);
    else conds.push("1=0");

    const where = conds.length ? " WHERE "+conds.join(" AND ") : "";
    const [countRows, rows] = await Promise.all([
      this.sql(`SELECT COUNT(*)::int as total FROM ${from}${where}`, params) as Promise<any[]>,
      this.sql(`SELECT ${cols} FROM ${from}${where} ORDER BY ${t}.first_name,${t}.last_name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]) as Promise<any[]>,
    ]);
    return { data: rows, total: countRows[0]?.total ?? 0 };
  }

  async search(q: string, department: string, status: string, includeInactive: boolean, limit: number, offset: number, risk?: string, regions?: string[] | null) {
    const conds: string[] = []; const params: any[] = [];
    const t = this.qualify("employees", regions);
    const from = this.employeeFrom(regions);
    const cols = this.listColsFor(regions != null ? "e" : undefined);
    if (!includeInactive) conds.push(`${t}.employment_status IN('active','onboarding','on_leave')`);
    this.addRiskWhere(risk, conds, t);
    this.addRegionWhere(regions, conds, params);
    if (q) {
      const pat = `%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
      params.push(pat);
      const n = params.length;
      conds.push(
        `(LOWER(${t}.first_name) LIKE $${n}` +
        ` OR LOWER(${t}.last_name) LIKE $${n}` +
        ` OR LOWER(${t}.first_name || ' ' || ${t}.last_name) LIKE $${n}` +
        ` OR LOWER(COALESCE(${t}.nickname,'')) LIKE $${n}` +
        ` OR LOWER(${t}.work_email) LIKE $${n}` +
        ` OR LOWER(${t}.employee_id) LIKE $${n}` +
        ` OR LOWER(COALESCE(${t}.job_title,'')) LIKE $${n})`
      );
    }
    if (department) { params.push(department); conds.push(`${t}.department=$${params.length}`); }
    if (status) { params.push(status); conds.push(`${t}.employment_status=$${params.length}`); }
    const where = conds.length ? " WHERE "+conds.join(" AND ") : "";
    const [countRows, rows] = await Promise.all([
      this.sql(`SELECT COUNT(*)::int as total FROM ${from}${where}`, params) as Promise<any[]>,
      this.sql(`SELECT ${cols} FROM ${from}${where} ORDER BY ${t}.first_name,${t}.last_name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]) as Promise<any[]>,
    ]);
    return { data: rows, total: countRows[0]?.total ?? 0 };
  }

  async getById(id: string) {
    const r = await this.sql`SELECT id, employee_id, work_email, first_name, middle_name, last_name, nickname, avatar, job_title, department, sub_department, business_unit, primary_team, cost_center, grade, job_category, location, role, manager_id, manager_email, hr_email, employment_status, employee_type, shift, leave_approval_tier, personal_email, personal_phone, work_phone, dob, gender, marital_status, blood_group, street, city, state, country, zip_code, comm_street, comm_city, comm_state, comm_country, comm_zip_code, join_date, probation_start_date, probation_end_date, confirmation_date, notice_period, resignation_date, exit_date, exit_type, resignation_reason, eligible_for_rehire, custom_field_1, custom_field_2, source, created_at, updated_at FROM employees WHERE id=${id}` as any[];
    const row = r[0] ?? null;
    if (row && typeof row === "object" && !("grade" in row) && "Grade" in row) (row as any).grade = (row as any).Grade;
    return row;
  }

  async findByEmail(email: string, excludeId?: string) {
    if (excludeId) return this.sql`SELECT id FROM employees WHERE LOWER(work_email)=${email} AND id!=${excludeId}` as Promise<any[]>;
    return this.sql`SELECT id FROM employees WHERE LOWER(work_email)=${email}` as Promise<any[]>;
  }

  async create(data: Record<string, any>) {
    const cols = Object.keys(data).join(",");
    const placeholders = Object.keys(data).map((_,i) => `$${i+1}`).join(",");
    const r = await this.sql(`INSERT INTO employees(${cols}) VALUES(${placeholders}) RETURNING *`, Object.values(data)) as any[];
    return r[0];
  }

  async update(id: string, data: Record<string, any>) {
    const keys = Object.keys(data); const values = Object.values(data);
    const setClause = keys.map((k,i) => `${k}=$${i+1}`).join(",");
    const r = await this.sql(`UPDATE employees SET ${setClause},updated_at=NOW() WHERE id=$${keys.length+1} RETURNING *`, [...values, id]) as any[];
    return r[0]??null;
  }

  /** Update only org-related fields (used by org migration so these columns are set explicitly). */
  async updateOrgFields(
    id: string,
    fields: {
      location: string | null;
      business_unit: string | null;
      grade: string | null;
      shift: string | null;
      job_category: string | null;
      primary_team: string | null;
      role: string | null;
    }
  ) {
    const r = await this.sql`
      UPDATE employees SET
        location = ${fields.location},
        business_unit = ${fields.business_unit},
        grade = ${fields.grade},
        shift = ${fields.shift},
        job_category = ${fields.job_category},
        primary_team = ${fields.primary_team},
        role = ${fields.role},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, location, business_unit, grade, shift, job_category, primary_team, role
    ` as any[];
    return r[0] ?? null;
  }

  async delete(id: string) {
    await this.sql`DELETE FROM onboarding_records WHERE employee_id=${id}`;
    const r = await this.sql`DELETE FROM employees WHERE id=${id} RETURNING id` as any[];
    return r.length > 0;
  }

  /** Our system’s active employees only (employment_status in active/onboarding/on_leave). Used when linking business_unit/grade from FreshTeam so we never update terminated employees. */
  async listActiveIdAndEmail(): Promise<{ id: string; work_email: string }[]> {
    return this.sql`
      SELECT id, work_email FROM employees
      WHERE employment_status IN ('active','onboarding','on_leave')
      ORDER BY work_email
    ` as unknown as Promise<{ id: string; work_email: string }[]>;
  }

  async getDepartments() {
    const [fromTable, fromEmps] = await Promise.all([
      (async () => { try { return (await this.sql`SELECT name FROM departments ORDER BY name` as any[]).map((r:any)=>r.name); } catch { return []; } })(),
      (this.sql`SELECT DISTINCT department FROM employees WHERE department IS NOT NULL AND TRIM(department)!=''` as Promise<any[]>).then(r=>r.map((row:any)=>row.department)),
    ]);
    return Array.from(new Set([...fromTable, ...fromEmps])).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b));
  }

  /**
   * Next id = numeric suffix of the **most recently created** employee (by created_at) + 1.
   * Only the trailing digit run is used (e.g. `EMP-048` → 48). This follows your live hire
   * sequence instead of MAX across the whole table (imports/FreshTeam rows with 9999 would
   * otherwise force 10000).
   */
  async getSuggestedId(): Promise<string> {
    const r = await (this.sql(`
      SELECT COALESCE((
        SELECT CAST((regexp_match(TRIM(e.employee_id), '([0-9]+)$'))[1] AS BIGINT)
        FROM employees e
        WHERE e.employee_id IS NOT NULL
          AND TRIM(e.employee_id) != ''
          AND (regexp_match(TRIM(e.employee_id), '([0-9]+)$'))[1] IS NOT NULL
        ORDER BY e.created_at DESC NULLS LAST, e.id DESC
        LIMIT 1
      ), 0) + 1 AS next_num
    `) as unknown as Promise<{ next_num: string | number | bigint | null }[]>);
    const raw = r[0]?.next_num;
    const num = typeof raw === "bigint" ? Number(raw) : Number(raw) || 0;
    return String(num);
  }

  // Avatar
  async getAvatar(id: string) {
    const r = await this.sql`SELECT avatar, employment_status FROM employees WHERE id=${id}` as any[];
    return r[0] ?? null;
  }

  // Documents
  async getDocumentFile(docId: string) { const r = await this.sql`SELECT ed.file_url,ed.file_name,ed.employee_id FROM employee_documents ed WHERE ed.id=${docId}` as any[]; return r[0]??null; }
  async listDocuments(employeeId: string) { return this.sql`SELECT id,display_name,document_type,file_name,source,uploaded_at,created_at FROM employee_documents WHERE employee_id=${employeeId} ORDER BY uploaded_at DESC NULLS LAST,created_at DESC` as Promise<any[]>; }
  async createDocument(employeeId: string, section: string, displayName: string, fileUrl: string, fileName: string) {
    const r = await this.sql`INSERT INTO employee_documents(employee_id,document_type,display_name,file_url,file_name,source,uploaded_at) VALUES(${employeeId},${section},${displayName},${fileUrl},${fileName},'manual',NOW()) RETURNING id,display_name,document_type,file_name,source,uploaded_at,created_at` as any[];
    return r[0];
  }
  async deleteDocument(docId: string) { const r = await this.sql`DELETE FROM employee_documents WHERE id=${docId} RETURNING id` as any[]; return r.length > 0; }

  // Dependents & emergency contacts
  async getEmergencyContacts(employeeId: string) {
    return this.sql`SELECT * FROM emergency_contacts WHERE employee_id = ${employeeId} ORDER BY full_name` as Promise<any[]>;
  }
  async getDependents(employeeId: string) {
    return this.sql`SELECT * FROM dependents WHERE employee_id = ${employeeId} ORDER BY full_name` as Promise<any[]>;
  }

  async createDependent(employeeId: string, data: { fullName: string; relationship?: string | null; dateOfBirth?: string | null; gender?: string | null }) {
    const dob = data.dateOfBirth?.trim() ? new Date(data.dateOfBirth).toISOString() : null;
    const rows = await this.sql`
      INSERT INTO dependents (employee_id, full_name, relationship, date_of_birth, gender)
      VALUES (${employeeId}, ${data.fullName.trim()}, ${data.relationship?.trim() || null}, ${dob}, ${data.gender?.trim() || null})
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateDependent(id: string, data: { fullName: string; relationship?: string | null; dateOfBirth?: string | null; gender?: string | null }) {
    const dob = data.dateOfBirth?.trim() ? new Date(data.dateOfBirth).toISOString() : null;
    const rows = await this.sql`
      UPDATE dependents SET
        full_name = ${data.fullName.trim()},
        relationship = ${data.relationship?.trim() || null},
        date_of_birth = ${dob},
        gender = ${data.gender?.trim() || null},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async deleteDependent(id: string) {
    const r = await this.sql`DELETE FROM dependents WHERE id = ${id} RETURNING id` as any[];
    return r.length > 0;
  }

  async createEmergencyContact(
    employeeId: string,
    data: { fullName: string; relationship?: string | null; phone?: string | null; email?: string | null; address?: string | null },
  ) {
    const rows = await this.sql`
      INSERT INTO emergency_contacts (employee_id, full_name, relationship, phone, email, address)
      VALUES (
        ${employeeId},
        ${data.fullName.trim()},
        ${data.relationship?.trim() || null},
        ${data.phone?.trim() || null},
        ${data.email?.trim() || null},
        ${data.address?.trim() || null}
      )
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateEmergencyContact(
    id: string,
    data: { fullName: string; relationship?: string | null; phone?: string | null; email?: string | null; address?: string | null },
  ) {
    const rows = await this.sql`
      UPDATE emergency_contacts SET
        full_name = ${data.fullName.trim()},
        relationship = ${data.relationship?.trim() || null},
        phone = ${data.phone?.trim() || null},
        email = ${data.email?.trim() || null},
        address = ${data.address?.trim() || null},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async deleteEmergencyContact(id: string) {
    const r = await this.sql`DELETE FROM emergency_contacts WHERE id = ${id} RETURNING id` as any[];
    return r.length > 0;
  }

  // Timeline
  async getTimeline(employeeId: string) {
    const r = await this.sql`SELECT join_date,confirmation_date,probation_start_date,probation_end_date,resignation_date,exit_date,job_title,department FROM employees WHERE id=${employeeId}` as any[];
    if (!r[0]) return null;
    const [salary, onboarding, offboarding, docs, profileChanges, assetAssignments, benefitAssignments] = await Promise.all([
      this.sql`SELECT start_date,reason,annual_salary,currency,pay_rate,base_salary_monthly,allowances_monthly,additional_allowances FROM salary_details WHERE employee_id=${employeeId} ORDER BY start_date DESC` as Promise<any[]>,
      this.sql`SELECT created_at,completed_at,status FROM onboarding_records WHERE employee_id=${employeeId} ORDER BY created_at DESC` as Promise<any[]>,
      this.sql`SELECT initiated_at,exit_date,completed_at,status FROM offboarding_records WHERE employee_id=${employeeId} ORDER BY initiated_at DESC` as Promise<any[]>,
      this.sql`SELECT uploaded_at,display_name,document_type FROM employee_documents WHERE employee_id=${employeeId} AND uploaded_at IS NOT NULL ORDER BY uploaded_at DESC LIMIT 5` as Promise<any[]>,
      (async () => { try { return await this.sql`SELECT changed_at,changed_fields FROM employee_profile_changes WHERE employee_id=${employeeId} ORDER BY changed_at DESC` as any[]; } catch { return []; } })(),
      this.sql`
        SELECT a.created_at, a.asset_id,
          COALESCE(
            (SELECT s.name FROM stock_items s WHERE s.id = a.stock_item_id LIMIT 1),
            (SELECT s.name FROM stock_items s WHERE s.id = a.asset_id OR a.asset_id LIKE s.id || '-%' LIMIT 1)
          ) AS asset_name
        FROM assigned_systems a
        WHERE a.user_id = ${employeeId} AND a.created_at IS NOT NULL
        ORDER BY a.created_at DESC
        LIMIT 25
      ` as Promise<any[]>,
      (async () => {
        try {
          return await this.sql`
            SELECT bca.assigned_at, bca.status, bca.card_number, bca.assigned_by_name,
                   bc.title, bc.category, bc.provider
            FROM benefit_card_assignments bca
            JOIN benefit_cards bc ON bc.id = bca.benefit_card_id
            WHERE bca.employee_id = ${employeeId} AND bca.assigned_at IS NOT NULL
            ORDER BY bca.assigned_at DESC
            LIMIT 50
          ` as any[];
        } catch {
          return [];
        }
      })(),
    ]);
    return { emp: r[0], salary, onboarding, offboarding, docs, profileChanges, assetAssignments, benefitAssignments };
  }

  // Sync tentative documents
  async getHiredApplicationId(employeeId: string) { const r = await this.sql`SELECT id FROM applications WHERE employee_id=${employeeId} AND stage='hired' ORDER BY updated_at DESC LIMIT 1` as any[]; return r[0]?.id??null; }
  async getClearedTentativeId(applicationId: string) { const r = await this.sql`SELECT id FROM tentative_records WHERE application_id=${applicationId} AND status='cleared' LIMIT 1` as any[]; return r[0]?.id??null; }
  async getVerifiedTentativeDocs(tentativeId: string) { return this.sql`SELECT id,document_type,file_url,file_name,uploaded_at FROM tentative_documents WHERE tentative_record_id=${tentativeId} AND status='verified' AND file_url IS NOT NULL AND file_url!=''` as Promise<any[]>; }
  async getExistingTentativeDocIds(employeeId: string) { const r = await this.sql`SELECT tentative_document_id FROM employee_documents WHERE employee_id=${employeeId} AND tentative_document_id IS NOT NULL` as any[]; return new Set(r.map((row:any)=>row.tentative_document_id).filter(Boolean)); }
  async copyTentativeDoc(employeeId: string, doc: any, label: string) { await this.sql`INSERT INTO employee_documents(employee_id,document_type,display_name,file_url,file_name,source,tentative_document_id,uploaded_at) VALUES(${employeeId},${doc.document_type},${label},${doc.file_url},${doc.file_name||null},'tentative_verification',${doc.id},${doc.uploaded_at})`; }

  // Avatar URL migrations
  async getAvatarUrlRows() { return this.sql`SELECT id,avatar FROM employees WHERE avatar IS NOT NULL AND TRIM(avatar)!='' AND (avatar LIKE 'http://%' OR avatar LIKE 'https://%')` as Promise<any[]>; }
  async getAvatarDataUrlRows() { return this.sql`SELECT id,avatar FROM employees WHERE avatar IS NOT NULL AND TRIM(avatar)!='' AND avatar LIKE 'data:%'` as Promise<any[]>; }
  async updateAvatar(id: string, avatar: string) { await this.sql`UPDATE employees SET avatar=${avatar},updated_at=NOW() WHERE id=${id}`; }

  async resolveManagerIds() {
    await this.sql`UPDATE employees e SET manager_id=(SELECT id FROM employees m WHERE m.work_email=e.manager_email LIMIT 1),updated_at=NOW() WHERE e.manager_email IS NOT NULL AND e.manager_email!='' AND (e.manager_id IS NULL OR e.manager_id='') AND EXISTS(SELECT 1 FROM employees m WHERE m.work_email=e.manager_email)`;
  }
}
