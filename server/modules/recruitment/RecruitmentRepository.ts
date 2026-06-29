import { BaseRepository } from "../../core/base/BaseRepository.js";
import { freshteamWorkEmailMatchKeys } from "../../lib/freshteamApi.js";

const DEFAULT_FORM_CONFIG = {
  sections: [
    {
      id: "s_core",
      title: "Submit Your Application",
      description: null,
      system: true,
      fields: [
        { id: "resume",      type: "file",  label: "Resume / CV",  required: true,  system: true,  systemKey: "resume" },
        { id: "firstName",   type: "text",  label: "First Name",   required: true,  system: true,  systemKey: "firstName" },
        { id: "middleName",  type: "text",  label: "Middle Name",  required: false, system: true,  systemKey: "middleName" },
        { id: "lastName",    type: "text",  label: "Last Name",    required: true,  system: true,  systemKey: "lastName" },
        { id: "email",       type: "email", label: "Email",        required: true,  system: true,  systemKey: "email" },
        { id: "phone",       type: "text",  label: "Phone",        required: false, system: false, systemKey: "phone" },
        { id: "linkedinUrl", type: "url",   label: "LinkedIn URL", required: false, system: false, systemKey: "linkedinUrl" },
      ],
    },
  ],
};

export class RecruitmentRepository extends BaseRepository {
  async getRecruitmentAssignableUsers() {
    try {
      return this.sql`
        SELECT
          u.id,
          u.email,
          u.role,
          u.roles,
          u.employee_id,
          e.first_name,
          e.last_name
        FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE u.is_active = true
          AND (
            u.role::text IN ('hr', 'manager')
            OR u.roles::jsonb @> '["hr"]'::jsonb
            OR u.roles::jsonb @> '["recruiter"]'::jsonb
            OR u.roles::jsonb @> '["limited_recruiter"]'::jsonb
            OR u.roles::jsonb @> '["hiring_manager"]'::jsonb
            OR u.roles::jsonb @> '["manager"]'::jsonb
          )
        ORDER BY COALESCE(e.first_name, u.email), COALESCE(e.last_name, '')
      ` as Promise<any[]>;
    } catch (e: any) {
      // Backward compatibility for older DBs missing users.roles.
      if (e?.code === "42703") {
        return this.sql`
          SELECT
            u.id,
            u.email,
            u.role,
            NULL::jsonb AS roles,
            u.employee_id,
            e.first_name,
            e.last_name
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          WHERE u.is_active = true
            AND u.role::text IN ('hr', 'manager')
          ORDER BY COALESCE(e.first_name, u.email), COALESCE(e.last_name, '')
        ` as Promise<any[]>;
      }
      throw e;
    }
  }

  async getJobAssignments(jobId: string): Promise<Array<{ user_id: string; role: string }>> {
    const rows = await this.sql`SELECT user_id, role FROM job_assignments WHERE job_id=${jobId}` as any[];
    return rows;
  }

  /**
   * Accepts user ids and legacy employee ids; returns distinct active user ids only.
   */
  async resolveUserIdsForAssignments(ids: string[]): Promise<string[]> {
    const unique = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
    if (!unique.length) return [];
    const rows = (await this.sql`
      SELECT DISTINCT u.id
      FROM users u
      WHERE u.is_active = true
        AND (u.id = ANY(${unique}) OR u.employee_id = ANY(${unique}))
    `) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /** Resolves region_code for a branch by its id. */
  async getBranchRegion(branchId: string): Promise<string | null> {
    const r = await this.sql`SELECT region_code FROM branches WHERE id = ${branchId}` as { region_code: string | null }[];
    return r[0]?.region_code ?? null;
  }

  /** Returns region_code for each userId (null if unresolvable). */
  async getUsersRegion(userIds: string[]): Promise<Map<string, string | null>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.sql`
      SELECT u.id, b.region_code
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
      WHERE u.id = ANY(${userIds})
    ` as { id: string; region_code: string | null }[];
    return new Map(rows.map((r) => [r.id, r.region_code ?? null]));
  }

  async replaceJobAssignments(
    jobId: string,
    entries: Array<{ userId: string; role: "recruiter" | "limited_recruiter" | "hiring_manager" }>
  ) {
    await this.sql`DELETE FROM job_assignments WHERE job_id=${jobId}`;
    for (const e of entries) {
      await this.sql`
        INSERT INTO job_assignments (user_id, job_id, role)
        VALUES (${e.userId}, ${jobId}, ${e.role})
        ON CONFLICT (user_id, job_id, role) DO NOTHING
      `;
    }
  }

  // ── Candidates ────────────────────────────────────────────────────────────────
  async getCandidateFilterOptions(scopedJobIds?: string[], regions?: string[] | null) {
    if (regions != null && regions.length === 0) {
      return { sources: [], stages: [], departments: [], jobs: [] };
    }
    const noScope = !scopedJobIds;
    const ids = scopedJobIds ?? [];
    const noRegion = regions == null;
    const regionArr = regions ?? [];
    const [sources, stages, departments, jobRows] = await Promise.all([
      this.sql`SELECT DISTINCT source FROM candidates WHERE source IS NOT NULL AND source != '' AND (${noScope} OR EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = candidates.id AND a.job_id = ANY(${ids}))) AND (${noRegion} OR candidates.region_code = ANY(${regionArr}) OR EXISTS (SELECT 1 FROM applications a JOIN job_postings j ON j.id = a.job_id WHERE a.candidate_id = candidates.id AND j.region_code = ANY(${regionArr}))) ORDER BY source`,
      this.sql`SELECT DISTINCT stage FROM applications WHERE stage IS NOT NULL AND (${noScope} OR job_id = ANY(${ids})) AND (${noRegion} OR EXISTS (SELECT 1 FROM job_postings j WHERE j.id = applications.job_id AND j.region_code = ANY(${regionArr}))) ORDER BY stage`,
      this.sql`SELECT DISTINCT j.department FROM job_postings j INNER JOIN applications a ON a.job_id = j.id WHERE j.department IS NOT NULL AND j.department != '' AND (${noScope} OR j.id = ANY(${ids})) AND (${noRegion} OR j.region_code = ANY(${regionArr})) ORDER BY j.department`,
      this.sql`SELECT DISTINCT j.id, j.title FROM job_postings j INNER JOIN applications a ON a.job_id = j.id WHERE j.title IS NOT NULL AND j.title != '' AND (${noScope} OR j.id = ANY(${ids})) AND (${noRegion} OR j.region_code = ANY(${regionArr})) ORDER BY j.title`,
    ]);
    return {
      sources: (sources as any[]).map((r: any) => r.source as string),
      stages: (stages as any[]).map((r: any) => r.stage as string),
      departments: (departments as any[]).map((r: any) => r.department as string),
      jobs: (jobRows as any[]).map((r: any) => ({ id: r.id as string, title: r.title as string })),
    };
  }

  async listCandidates(limit: number, offset: number, search: string | null, scopedJobIds?: string[], stageFilter?: string[], sourceFilter?: string[], departmentFilter?: string[], jobIdFilter?: string[], regions?: string[] | null) {
    if (scopedJobIds && scopedJobIds.length === 0) return { candidates: [], total: 0 };
    if (regions != null && regions.length === 0) return { candidates: [], total: 0 };
    const noSearch = search === null;
    const pat = search;
    const noScope = !scopedJobIds;
    const ids = scopedJobIds ?? [];
    const noRegion = regions == null;
    const regionArr = regions ?? [];
    const noStage = !stageFilter || stageFilter.length === 0;
    const stages = stageFilter ?? [];
    const noSource = !sourceFilter || sourceFilter.length === 0;
    const sources = sourceFilter ?? [];
    const noDept = !departmentFilter || departmentFilter.length === 0;
    const depts = departmentFilter ?? [];
    const noJobId = !jobIdFilter || jobIdFilter.length === 0;
    const jobIds = jobIdFilter ?? [];
    // Use a pre-aggregated JOIN instead of a per-row correlated subquery for application_count.
    // Both queries run in parallel; the GROUP BY is resolved once and joined by PK.
    const [countRows, rows] = await Promise.all([
      this.sql`SELECT COUNT(*)::int as total FROM candidates c WHERE (${noSearch} OR c.first_name ILIKE ${pat} OR c.last_name ILIKE ${pat} OR c.email ILIKE ${pat}) AND (${noScope} OR EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = ANY(${ids}))) AND (${noRegion} OR c.region_code = ANY(${regionArr}) OR EXISTS (SELECT 1 FROM applications a JOIN job_postings j ON j.id = a.job_id WHERE a.candidate_id = c.id AND j.region_code = ANY(${regionArr}))) AND (${noStage} OR EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.stage = ANY(${stages}))) AND (${noSource} OR c.source = ANY(${sources})) AND (${noDept} OR EXISTS (SELECT 1 FROM applications a JOIN job_postings j ON j.id = a.job_id WHERE a.candidate_id = c.id AND j.department = ANY(${depts}))) AND (${noJobId} OR EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = ANY(${jobIds})))`,
      this.sql`
        SELECT
          c.id, c.first_name, c.last_name, c.email, c.phone, c.linkedin_url, c.current_company, c.current_title,
          c.experience_years, c.current_salary, c.expected_salary, c.salary_currency, c.source,
          (c.resume_url IS NOT NULL AND LENGTH(TRIM(COALESCE(c.resume_url, ''))) > 50) AS has_resume,
          c.resume_filename,
          CASE WHEN c.resume_url IS NOT NULL AND c.resume_url LIKE 'http%' THEN c.resume_url ELSE NULL END AS resume_url,
          c.created_at, c.updated_at, c.tags, c.city, c.state, c.country, c.date_of_birth, c.gender,
          COALESCE(ac.application_count, 0)::int AS application_count,
          deps.applied_departments,
          rat.fitment_rating_avg
        FROM candidates c
        LEFT JOIN (
          SELECT a.candidate_id, COUNT(*)::int AS application_count
          FROM applications a
          INNER JOIN job_postings j ON j.id = a.job_id
          WHERE (${noScope} OR a.job_id = ANY(${ids}))
            AND (${noRegion} OR j.region_code = ANY(${regionArr}))
          GROUP BY a.candidate_id
        ) ac ON ac.candidate_id = c.id
        LEFT JOIN (
          SELECT x.candidate_id, string_agg(x.dept, ', ' ORDER BY x.dept) AS applied_departments
          FROM (
            SELECT DISTINCT
              a.candidate_id,
              CASE
                WHEN trim(COALESCE(j.department, '')) <> '' AND trim(COALESCE(j.title, '')) <> ''
                  THEN trim(j.department) || ' (' || trim(j.title) || ')'
                WHEN trim(COALESCE(j.title, '')) <> ''
                  THEN trim(j.title)
                ELSE trim(j.department)
              END AS dept
            FROM applications a
            INNER JOIN job_postings j ON j.id = a.job_id
            WHERE (
              trim(COALESCE(j.department, '')) <> ''
              OR trim(COALESCE(j.title, '')) <> ''
            )
              AND (${noScope} OR a.job_id = ANY(${ids}))
              AND (${noRegion} OR j.region_code = ANY(${regionArr}))
          ) x
          WHERE trim(COALESCE(x.dept, '')) <> ''
          GROUP BY x.candidate_id
        ) deps ON deps.candidate_id = c.id
        LEFT JOIN (
          SELECT a.candidate_id, ROUND(AVG(a.rating)::numeric, 2) AS fitment_rating_avg
          FROM applications a
          INNER JOIN job_postings j ON j.id = a.job_id
          WHERE a.rating IS NOT NULL
            AND a.rating >= 1
            AND a.rating <= 5
            AND (${noScope} OR a.job_id = ANY(${ids}))
            AND (${noRegion} OR j.region_code = ANY(${regionArr}))
          GROUP BY a.candidate_id
        ) rat ON rat.candidate_id = c.id
        WHERE (${noSearch} OR c.first_name ILIKE ${pat} OR c.last_name ILIKE ${pat} OR c.email ILIKE ${pat})
          AND (${noScope} OR EXISTS (SELECT 1 FROM applications a2 WHERE a2.candidate_id = c.id AND a2.job_id = ANY(${ids})))
          AND (${noRegion} OR c.region_code = ANY(${regionArr}) OR EXISTS (SELECT 1 FROM applications a_reg JOIN job_postings j_reg ON j_reg.id = a_reg.job_id WHERE a_reg.candidate_id = c.id AND j_reg.region_code = ANY(${regionArr})))
          AND (${noStage} OR EXISTS (SELECT 1 FROM applications a3 WHERE a3.candidate_id = c.id AND a3.stage = ANY(${stages})))
          AND (${noSource} OR c.source = ANY(${sources}))
          AND (${noDept} OR EXISTS (SELECT 1 FROM applications a4 JOIN job_postings j ON j.id = a4.job_id WHERE a4.candidate_id = c.id AND j.department = ANY(${depts})))
          AND (${noJobId} OR EXISTS (SELECT 1 FROM applications a5 WHERE a5.candidate_id = c.id AND a5.job_id = ANY(${jobIds})))
        ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);
    return { candidates: Array.isArray(rows) ? rows : [], total: (countRows[0] as any)?.total ?? 0 };
  }

  async getCandidateById(id: string) {
    const rows = await this.sql`SELECT * FROM candidates WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const apps = await this.sql`
      SELECT a.*,a.custom_answers,a.cover_letter,
             j.title as job_title,j.department as job_department,j.location as job_location,j.form_config,j.region_code as job_region_code,
             o.id as offer_id,o.status as offer_status,o.approval_status as offer_approval_status,
             o.salary as offer_salary,o.salary_currency as offer_salary_currency,
             o.job_title as offer_job_title,o.department as offer_department,
             o.start_date as offer_start_date,o.employment_type as offer_employment_type,
             o.terms as offer_terms,o.merged_document_url as offer_merged_document_url,
             o.offer_letter_url,o.offer_letter_filename,
             o.esign_status,o.esign_signed_at,
             (o.esign_signature_data IS NOT NULL) as offer_is_signed,
             o.responded_at as offer_responded_at,o.sent_at as offer_sent_at
      FROM applications a
      INNER JOIN job_postings j ON j.id=a.job_id
      LEFT JOIN offers o ON o.application_id=a.id
      WHERE a.candidate_id=${id}
      ORDER BY a.applied_at DESC
    `;
    return { ...(rows[0] as any), applications: apps };
  }

  async getCandidateJobIds(id: string): Promise<string[]> {
    const rows = await this.sql`SELECT DISTINCT job_id FROM applications WHERE candidate_id=${id}` as any[];
    return rows.map((r: any) => String(r.job_id)).filter(Boolean);
  }

  async candidateHasApplicationInRegions(candidateId: string, regions: string[]): Promise<boolean> {
    if (regions.length === 0) return false;
    const rows = await this.sql`
      SELECT 1 FROM candidates c
      WHERE c.id = ${candidateId}
        AND (
          c.region_code = ANY(${regions})
          OR EXISTS (
            SELECT 1 FROM applications a
            INNER JOIN job_postings j ON j.id = a.job_id
            WHERE a.candidate_id = c.id
              AND j.region_code = ANY(${regions})
          )
        )
      LIMIT 1
    `;
    return rows.length > 0;
  }

  async getCandidateResume(id: string) {
    const rows = await this.sql`SELECT id,resume_url,resume_filename FROM candidates WHERE id=${id}` as any[];
    return rows[0] ?? null;
  }

  async findCandidateByEmail(email: string) {
    const rows = await this.sql`SELECT id FROM candidates WHERE email=${email}` as any[];
    return rows[0] ?? null;
  }

  async findCandidateByEmailFull(email: string) {
    const rows = await this.sql`SELECT id,resume_url,resume_filename FROM candidates WHERE LOWER(TRIM(email))=${email}` as any[];
    return rows[0] ?? null;
  }

  async patchCandidateRegionIfMissing(candidateId: string, regionCode: string | null) {
    if (!regionCode) return;
    await this.sql`UPDATE candidates SET region_code = ${regionCode}, updated_at = NOW() WHERE id = ${candidateId} AND region_code IS NULL`;
  }

  async createCandidate(d: any) {
    const dob = d.dateOfBirth && String(d.dateOfBirth).trim() ? d.dateOfBirth : null;
    const pe = d.personalEmail && String(d.personalEmail).trim() ? d.personalEmail : null;
    const tags = d.tags != null ? JSON.stringify(d.tags) : null;
    const r = await this.sql`INSERT INTO candidates(first_name,middle_name,last_name,email,phone,linkedin_url,current_company,current_title,experience_years,current_salary,expected_salary,salary_currency,resume_url,resume_filename,date_of_birth,gender,marital_status,blood_group,personal_email,street,city,state,country,zip_code,source,notes,tags,region_code) VALUES(${d.firstName},${d.middleName??null},${d.lastName},${d.email},${d.phone||null},${d.linkedinUrl||null},${d.currentCompany||null},${d.currentTitle||null},${d.experienceYears??null},${d.currentSalary??null},${d.expectedSalary??null},${d.salaryCurrency||null},${d.resumeUrl||""},${d.resumeFilename||null},${dob},${d.gender||null},${d.maritalStatus||null},${d.bloodGroup||null},${pe},${d.street||null},${d.city||null},${d.state||null},${d.country||null},${d.zipCode||null},${d.source||"manual"},${d.notes||null},${tags},${d.regionCode ?? null}) RETURNING *` as any[];
    return r[0];
  }

  async updateCandidate(id: string, u: any, resumeUrl?: string) {
    const tags = u.tags != null ? JSON.stringify(u.tags) : null;
    const r = await this.sql`UPDATE candidates SET first_name=COALESCE(${u.firstName},first_name),middle_name=COALESCE(${u.middleName??null},middle_name),last_name=COALESCE(${u.lastName},last_name),phone=COALESCE(${u.phone},phone),linkedin_url=COALESCE(${u.linkedinUrl},linkedin_url),current_company=COALESCE(${u.currentCompany},current_company),current_title=COALESCE(${u.currentTitle},current_title),experience_years=COALESCE(${u.experienceYears},experience_years),current_salary=COALESCE(${u.currentSalary},current_salary),expected_salary=COALESCE(${u.expectedSalary},expected_salary),salary_currency=COALESCE(${u.salaryCurrency},salary_currency),resume_url=COALESCE(${resumeUrl??null},resume_url),resume_filename=COALESCE(${u.resumeFilename},resume_filename),date_of_birth=COALESCE(${u.dateOfBirth??null},date_of_birth),gender=COALESCE(${u.gender??null},gender),marital_status=COALESCE(${u.maritalStatus??null},marital_status),blood_group=COALESCE(${u.bloodGroup??null},blood_group),personal_email=COALESCE(${u.personalEmail??null},personal_email),street=COALESCE(${u.street??null},street),city=COALESCE(${u.city??null},city),state=COALESCE(${u.state??null},state),country=COALESCE(${u.country??null},country),zip_code=COALESCE(${u.zipCode??null},zip_code),source=COALESCE(${u.source},source),notes=COALESCE(${u.notes},notes),tags=COALESCE(${tags},tags),region_code=COALESCE(${u.regionCode ?? null},region_code),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0];
  }

  async deleteCandidate(id: string) {
    const r = await this.sql`DELETE FROM candidates WHERE id=${id} RETURNING id` as any[];
    return r[0] ?? null;
  }

  async findCandidateByFreshteamId(ftId: string) {
    const r = await this.sql`SELECT id FROM candidates WHERE freshteam_candidate_id=${ftId}` as any[];
    return r[0] ?? null;
  }

  async findCandidateByFreshteamIdFull(ftId: string) {
    const r = await this.sql`
      SELECT id, email, resume_url, resume_filename
      FROM candidates
      WHERE freshteam_candidate_id = ${ftId}
      LIMIT 1
    ` as Array<{ id: string; email: string; resume_url: string | null; resume_filename: string | null }>;
    return r[0] ?? null;
  }

  /** FT-sourced candidates with no applications (for applicant_ids backfill). */
  async listFreshteamOrphanCandidates(limit?: number, offset = 0) {
    if (limit != null) {
      const r = await this.sql`
        SELECT id, freshteam_candidate_id
        FROM candidates c
        WHERE c.source = 'freshteam'
          AND c.freshteam_candidate_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id)
        ORDER BY c.created_at
        LIMIT ${limit} OFFSET ${offset}
      ` as any[];
      return r as Array<{ id: string; freshteam_candidate_id: string }>;
    }
    const r = await this.sql`
      SELECT id, freshteam_candidate_id
      FROM candidates c
      WHERE c.source = 'freshteam'
        AND c.freshteam_candidate_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id)
      ORDER BY c.created_at
    ` as any[];
    return r as Array<{ id: string; freshteam_candidate_id: string }>;
  }

  /** Match existing HRMS candidate — FT id first, then real email, then migration placeholder email. */
  async resolveCandidateForFreshteamImport(opts: {
    freshteamCandidateId: string | null;
    email: string;
    placeholderEmail: string | null;
  }): Promise<{
    id: string;
    email: string;
    resume_url: string | null;
    resume_filename: string | null;
    matchedBy: "freshteam_id" | "email" | "placeholder";
  } | null> {
    const { freshteamCandidateId, email, placeholderEmail } = opts;
    if (freshteamCandidateId) {
      const byFt = await this.findCandidateByFreshteamIdFull(freshteamCandidateId);
      if (byFt) return { ...byFt, matchedBy: "freshteam_id" };
    }
    const norm = email.trim().toLowerCase();
    if (norm && !norm.includes("@no-email.freshteam.migrated")) {
      const byEmail = await this.findCandidateByEmailFull(norm);
      if (byEmail) {
        return {
          id: byEmail.id,
          email: norm,
          resume_url: byEmail.resume_url ?? null,
          resume_filename: byEmail.resume_filename ?? null,
          matchedBy: "email",
        };
      }
    }
    const ph = placeholderEmail?.trim().toLowerCase();
    if (ph) {
      const byPh = await this.findCandidateByEmailFull(ph);
      if (byPh) {
        return {
          id: byPh.id,
          email: ph,
          resume_url: byPh.resume_url ?? null,
          resume_filename: byPh.resume_filename ?? null,
          matchedBy: "placeholder",
        };
      }
    }
    return null;
  }

  private isPlaceholderMigrationEmail(email: string): boolean {
    return email.includes("@no-email.freshteam.migrated");
  }

  /** Prefer real email over placeholder; avoid unique-index clash with another candidate row. */
  async pickEmailForFreshteamUpsert(candidateId: string, incomingEmail: string): Promise<string> {
    const rows = await this.sql`SELECT email FROM candidates WHERE id = ${candidateId} LIMIT 1` as Array<{
      email: string;
    }>;
    const current = String(rows[0]?.email ?? "")
      .trim()
      .toLowerCase();
    const incoming = incomingEmail.trim().toLowerCase();
    if (this.isPlaceholderMigrationEmail(incoming)) return current || incoming;
    if (!current || this.isPlaceholderMigrationEmail(current)) {
      const conflict = await this.findCandidateByEmailFull(incoming);
      if (conflict && conflict.id !== candidateId) return current || incoming;
      return incoming;
    }
    if (current === incoming) return incoming;
    const conflict = await this.findCandidateByEmailFull(incoming);
    if (conflict && conflict.id !== candidateId) return current;
    return incoming;
  }

  async upsertCandidateFromFreshteam(
    email: string,
    data: any,
    existingId?: string
  ): Promise<{ id: string; created: boolean }> {
    let targetId = existingId;
    if (!targetId && data.freshteamCandidateId) {
      const byFt = await this.findCandidateByFreshteamId(String(data.freshteamCandidateId));
      if (byFt) targetId = byFt.id;
    }
    if (!targetId) {
      const byEmail = await this.findCandidateByEmailFull(email.trim().toLowerCase());
      if (byEmail) targetId = byEmail.id;
    }
    if (targetId) {
      const emailToStore = await this.pickEmailForFreshteamUpsert(targetId, email);
      const r = await this.sql`UPDATE candidates SET email=${emailToStore},first_name=${data.firstName},middle_name=COALESCE(${data.middleName??null},middle_name),last_name=${data.lastName},phone=COALESCE(${data.phone??null},phone),linkedin_url=COALESCE(${data.linkedinUrl??null},linkedin_url),current_company=COALESCE(${data.currentCompany??null},current_company),current_title=COALESCE(${data.currentTitle??null},current_title),current_salary=COALESCE(${data.currentSalary??null},current_salary),expected_salary=COALESCE(${data.expectedSalary??null},expected_salary),salary_currency=COALESCE(${data.salaryCurrency??null},salary_currency),city=COALESCE(${data.city??null},city),state=COALESCE(${data.state??null},state),country=COALESCE(${data.country??null},country),street=COALESCE(${data.street??null},street),zip_code=COALESCE(${data.zipCode??null},zip_code),date_of_birth=COALESCE(${data.dateOfBirth??null},date_of_birth),gender=COALESCE(${data.gender??null},gender),experience_years=COALESCE(${data.experienceYears??null},experience_years),notes=COALESCE(${data.notes??null},notes),tags=COALESCE(${data.tagsJson??null},tags),resume_url=${data.setResume?(data.resumeUrl??null):this.sql`resume_url`},resume_filename=${data.setResume?(data.resumeFilename??null):this.sql`resume_filename`},freshteam_candidate_id=COALESCE(${data.freshteamCandidateId??null},freshteam_candidate_id),updated_at=NOW() WHERE id=${targetId} RETURNING id` as any[];
      return { id: String(r[0]?.id ?? targetId), created: false };
    }
    try {
      const r = await this.sql`INSERT INTO candidates(first_name,middle_name,last_name,email,phone,linkedin_url,current_company,current_title,current_salary,expected_salary,salary_currency,city,state,country,street,zip_code,date_of_birth,gender,experience_years,notes,tags,resume_url,resume_filename,source,freshteam_candidate_id) VALUES(${data.firstName},${data.middleName??null},${data.lastName},${email},${data.phone??null},${data.linkedinUrl??null},${data.currentCompany??null},${data.currentTitle??null},${data.currentSalary??null},${data.expectedSalary??null},${data.salaryCurrency??null},${data.city??null},${data.state??null},${data.country??null},${data.street??null},${data.zipCode??null},${data.dateOfBirth??null},${data.gender??null},${data.experienceYears??null},${data.notes??null},${data.tagsJson??null},${data.resumeUrl||""},${data.resumeFilename??null},'freshteam',${data.freshteamCandidateId??null}) RETURNING id` as any[];
      return { id: String(r[0]?.id ?? ""), created: true };
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code;
      if (code === "23505") {
        const byEmail = await this.findCandidateByEmailFull(email.trim().toLowerCase());
        if (byEmail) return this.upsertCandidateFromFreshteam(email, data, byEmail.id);
      }
      throw e;
    }
  }

  // ── Job Postings ──────────────────────────────────────────────────────────────
  async getJobFilterOptions(scopedJobIds?: string[]) {
    const noScope = !scopedJobIds;
    const ids = scopedJobIds ?? [];
    const [depts, locs, empTypes] = await Promise.all([
      this.sql`SELECT DISTINCT department FROM job_postings WHERE department IS NOT NULL AND department!='' AND (${noScope} OR id=ANY(${ids})) ORDER BY department`,
      this.sql`SELECT DISTINCT location FROM job_postings WHERE location IS NOT NULL AND location!='' AND (${noScope} OR id=ANY(${ids})) ORDER BY location`,
      this.sql`SELECT DISTINCT employment_type FROM job_postings WHERE employment_type IS NOT NULL AND employment_type!='' AND (${noScope} OR id=ANY(${ids})) ORDER BY employment_type`,
    ]);
    return { departments: (depts as any[]).map((r:any)=>r.department), locations: (locs as any[]).map((r:any)=>r.location), employmentTypes: (empTypes as any[]).map((r:any)=>r.employment_type) };
  }

  async listJobs(statuses: string[], departments: string[], locations: string[], employmentTypes: string[], limit: number, offset: number, scopedJobIds?: string[], regions?: string[] | null) {
    const noStatus=statuses.length===0, noDept=departments.length===0, noLoc=locations.length===0, noEmp=employmentTypes.length===0;
    const noScope = !scopedJobIds;
    const ids = scopedJobIds ?? [];
    // Region scope: null = no filter; [] = none (ANY('{}') is always false → fail-closed).
    const noRegion = regions == null;
    const regionArr = regions ?? [];
    const [countRows, jobs] = await Promise.all([
      this.sql`SELECT COUNT(*)::int as total FROM job_postings j WHERE (${noStatus} OR j.status=ANY(${statuses})) AND (${noDept} OR j.department=ANY(${departments})) AND (${noLoc} OR j.location=ANY(${locations})) AND (${noEmp} OR j.employment_type=ANY(${employmentTypes})) AND (${noScope} OR j.id=ANY(${ids})) AND (${noRegion} OR j.region_code=ANY(${regionArr}))`,
      this.sql`SELECT j.id,j.title,j.department,j.location,j.employment_type,j.salary_range_min,j.salary_range_max,j.salary_currency,j.headcount,j.hiring_manager_id,j.hiring_manager_ids,j.status,j.published_channels,j.experience_level,j.remote,j.published_at,j.closed_at,j.freshteam_job_id,j.created_at,j.updated_at,j.created_by,j.updated_by FROM job_postings j WHERE (${noStatus} OR j.status=ANY(${statuses})) AND (${noDept} OR j.department=ANY(${departments})) AND (${noLoc} OR j.location=ANY(${locations})) AND (${noEmp} OR j.employment_type=ANY(${employmentTypes})) AND (${noScope} OR j.id=ANY(${ids})) AND (${noRegion} OR j.region_code=ANY(${regionArr})) ORDER BY j.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    ]);
    return { jobs: Array.isArray(jobs) ? jobs : [], total: (countRows[0] as any)?.total ?? 0 };
  }

  async getJobApplicationCounts(jobIds: string[]) {
    if (jobIds.length === 0) return new Map<string, any>();
    const r = await this.sql`
      SELECT
        job_id,
        COUNT(*)::int AS application_count,
        COUNT(*) FILTER (WHERE stage = 'hired')::int AS hired_count,
        COUNT(*) FILTER (WHERE stage = 'rejected')::int AS rejected_count,
        COUNT(*) FILTER (WHERE applied_at >= NOW() - INTERVAL '7 days')::int AS recent_applications_7d
      FROM applications
      WHERE job_id = ANY(${jobIds})
      GROUP BY job_id
    ` as any[];
    return new Map(
      r.map((row: any) => [
        row.job_id,
        {
          application_count: row.application_count ?? 0,
          hired_count: row.hired_count ?? 0,
          rejected_count: row.rejected_count ?? 0,
          recent_applications_7d: row.recent_applications_7d ?? 0,
        },
      ])
    );
  }

  async getPublishedJobs(regionCode?: string | null) {
    if (regionCode && regionCode.trim()) {
      // Use prefix LIKE so "IN" matches both "IN-S" and "IN-N"; "PK" matches "PK" exactly.
      const prefix = regionCode.trim().toUpperCase();
      return this.sql`SELECT id,title,department,location,employment_type,description,requirements,salary_range_min,salary_range_max,salary_currency,experience_level,remote,published_at,region_code FROM job_postings WHERE status='published' AND UPPER(COALESCE(region_code,'')) LIKE ${prefix + '%'} ORDER BY published_at DESC LIMIT 200`;
    }
    return this.sql`SELECT id,title,department,location,employment_type,description,requirements,salary_range_min,salary_range_max,salary_currency,experience_level,remote,published_at,region_code FROM job_postings WHERE status='published' ORDER BY published_at DESC LIMIT 200`;
  }


  async getJobById(id: string) {
    const rows = await this.sql`SELECT j.* FROM job_postings j WHERE j.id=${id}`;
    if (rows.length === 0) return null;
    return rows[0] as any;
  }

  async getJobApplications(jobId: string) {
    return this.sql(
      `SELECT ${RecruitmentRepository.APP_COLS} FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id LEFT JOIN offers o ON o.application_id=a.id LEFT JOIN tentative_records tr ON tr.application_id=a.id WHERE a.job_id=$1 ORDER BY a.rating DESC NULLS LAST, a.applied_at DESC`,
      [jobId]
    ) as Promise<any[]>;
  }

  async createJob(d: any) {
    const hmIdsJson = d.hmIds && Array.isArray(d.hmIds) && d.hmIds.length > 0 ? JSON.stringify(d.hmIds) : null;
    // hiring_manager_id is a legacy FK to employees.id (used by FreshTeam migration).
    // d.hmIds contains user IDs from the UI, NOT employee IDs — never use them here.
    // Only use d.hiringManagerId when it is an explicit employee ID (e.g. migration path).
    const legacyHmEmployeeId = d.hiringManagerId && !d.hmIds?.length ? (d.hiringManagerId || null) : null;
    const r = await this.sql`INSERT INTO job_postings(title,department,location,employment_type,description,requirements,salary_range_min,salary_range_max,salary_currency,headcount,hiring_manager_id,hiring_manager_ids,status,published_channels,experience_level,remote,region_code,published_at,created_by) VALUES(${d.title},${d.department},${d.location||null},${d.employmentType||null},${d.description||null},${d.requirements||null},${d.salaryRangeMin??null},${d.salaryRangeMax??null},${d.salaryCurrency||null},${d.headcount||1},${legacyHmEmployeeId},${hmIdsJson},${d.status||"draft"},${d.publishedChannels?JSON.stringify(d.publishedChannels):null},${d.experienceLevel??null},${d.remote??null},${d.regionCode ?? null},${d.status==="published"?new Date():null},${d.createdBy ?? null}) RETURNING *` as any[];
    return r[0];
  }

  async updateJob(id: string, u: any) {
    const hmIdsJson = u.hiringManagerIds && Array.isArray(u.hiringManagerIds) && u.hiringManagerIds.length > 0 ? JSON.stringify(u.hiringManagerIds) : null;
    // hiring_manager_id is a legacy FK to employees.id. u.hiringManagerIds contains user IDs
    // from the UI and must NOT be stored in this column. Only preserve/update the employee FK
    // when an explicit employee ID is passed as u.hiringManagerId (migration path).
    const legacyHmEmployeeId = (u.hiringManagerId && !u.hiringManagerIds?.length) ? (u.hiringManagerId ?? null) : null;
    const existing = await this.sql`SELECT published_at,closed_at FROM job_postings WHERE id=${id}` as any[];
    if (!existing.length) return null;
    let publishedAt = existing[0].published_at;
    let closedAt = existing[0].closed_at;
    if (u.status === "published" && !publishedAt) publishedAt = new Date();
    if (u.status === "closed" && !closedAt) closedAt = new Date();
    const r = await this.sql`UPDATE job_postings SET title=COALESCE(${u.title},title),department=COALESCE(${u.department},department),location=COALESCE(${u.location},location),employment_type=COALESCE(${u.employmentType},employment_type),description=COALESCE(${u.description},description),requirements=COALESCE(${u.requirements},requirements),salary_range_min=COALESCE(${u.salaryRangeMin},salary_range_min),salary_range_max=COALESCE(${u.salaryRangeMax},salary_range_max),salary_currency=COALESCE(${u.salaryCurrency},salary_currency),headcount=COALESCE(${u.headcount},headcount),hiring_manager_id=COALESCE(${legacyHmEmployeeId},hiring_manager_id),hiring_manager_ids=COALESCE(${hmIdsJson},hiring_manager_ids),status=COALESCE(${u.status},status),published_channels=COALESCE(${u.publishedChannels?JSON.stringify(u.publishedChannels):null},published_channels),experience_level=COALESCE(${u.experienceLevel},experience_level),remote=COALESCE(${u.remote},remote),region_code=COALESCE(${u.regionCode ?? null},region_code),published_at=${publishedAt},closed_at=${closedAt},updated_by=COALESCE(${u.updatedBy ?? null},updated_by),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0];
  }

  async deleteJob(id: string) {
    const r = await this.sql`DELETE FROM job_postings WHERE id=${id} RETURNING id` as any[];
    return r[0] ?? null;
  }

  // ── Application Form Config ────────────────────────────────────────────────────

  private async ensureFormConfigTable() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS application_form_configs (
        id         VARCHAR(50)  PRIMARY KEY DEFAULT 'default',
        config     JSONB        NOT NULL DEFAULT '{"sections":[]}',
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `;
    // Seed default row if missing
    await this.sql`
      INSERT INTO application_form_configs (id, config)
      VALUES ('default', ${JSON.stringify(DEFAULT_FORM_CONFIG)})
      ON CONFLICT (id) DO NOTHING
    `;
    // Also ensure custom_answers column exists on applications
    await this.sql`
      ALTER TABLE applications ADD COLUMN IF NOT EXISTS custom_answers JSONB
    `;
  }

  async getApplicationFormConfig() {
    try {
      const r = await this.sql`SELECT config FROM application_form_configs WHERE id='default'` as any[];
      return r[0]?.config ?? DEFAULT_FORM_CONFIG;
    } catch (e: any) {
      if (e?.code === "42P01") {
        await this.ensureFormConfigTable();
        return DEFAULT_FORM_CONFIG;
      }
      throw e;
    }
  }

  async saveApplicationFormConfig(config: unknown) {
    try {
      await this.sql`
        INSERT INTO application_form_configs (id, config, updated_at)
        VALUES ('default', ${JSON.stringify(config)}, NOW())
        ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
      `;
    } catch (e: any) {
      if (e?.code === "42P01") {
        await this.ensureFormConfigTable();
        await this.sql`
          INSERT INTO application_form_configs (id, config, updated_at)
          VALUES ('default', ${JSON.stringify(config)}, NOW())
          ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
        `;
      } else {
        throw e;
      }
    }
    return { config };
  }

  // ── Per-job Application Form Config ──────────────────────────────────────────

  private async ensureJobFormConfigColumn() {
    await this.sql`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS form_config JSONB`;
  }

  async getJobFormConfig(jobId: string) {
    try {
      const r = await this.sql`SELECT form_config FROM job_postings WHERE id = ${jobId}` as any[];
      if (!r.length) return DEFAULT_FORM_CONFIG;
      // fall back to global default if the column is null
      return r[0]?.form_config ?? await this.getApplicationFormConfig();
    } catch (e: any) {
      if (e?.code === "42703") { // column does not exist yet
        await this.ensureJobFormConfigColumn();
        return await this.getApplicationFormConfig();
      }
      throw e;
    }
  }

  async saveJobFormConfig(jobId: string, config: unknown) {
    try {
      await this.sql`UPDATE job_postings SET form_config = ${JSON.stringify(config)} WHERE id = ${jobId}`;
    } catch (e: any) {
      if (e?.code === "42703") {
        await this.ensureJobFormConfigColumn();
        await this.sql`UPDATE job_postings SET form_config = ${JSON.stringify(config)} WHERE id = ${jobId}`;
      } else {
        throw e;
      }
    }
    return { config };
  }

  /** One-shot: set every job's form_config to the current global default (same JSON as Settings → Application Form). */
  async syncAllJobPostingsFormConfigFromGlobalDefault(): Promise<{ updated: number }> {
    await this.ensureJobFormConfigColumn();
    const config = await this.getApplicationFormConfig();
    const payload = JSON.stringify(config);
    const rows = (await this.sql`UPDATE job_postings SET form_config = ${payload} RETURNING id`) as { id: string }[];
    return { updated: Array.isArray(rows) ? rows.length : 0 };
  }

  /** All HRMS jobs linked to a FreshTeam job posting id (for applicant migration). */
  async listFreshteamLinkedJobs(): Promise<Array<{ id: string; freshteam_job_id: string; title: string }>> {
    const rows = await this.sql`
      SELECT id, freshteam_job_id, title
      FROM job_postings
      WHERE freshteam_job_id IS NOT NULL AND TRIM(freshteam_job_id) != ''
    ` as Array<{ id: string; freshteam_job_id: string; title: string }>;
    return Array.isArray(rows) ? rows : [];
  }

  /** FT-linked jobs with no applications in HRMS (e.g. after incremental job import). */
  async listFreshteamLinkedJobsWithZeroApplications(): Promise<
    Array<{ id: string; freshteam_job_id: string; title: string }>
  > {
    const rows = await this.sql`
      SELECT j.id, j.freshteam_job_id, j.title
      FROM job_postings j
      WHERE j.freshteam_job_id IS NOT NULL AND TRIM(j.freshteam_job_id) != ''
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
      ORDER BY j.created_at DESC
    ` as Array<{ id: string; freshteam_job_id: string; title: string }>;
    return Array.isArray(rows) ? rows : [];
  }

  async findJobIdByFreshteamJobId(ftJobId: string | number): Promise<string | null> {
    const rows = await this.sql`
      SELECT id FROM job_postings WHERE freshteam_job_id = ${String(ftJobId)} LIMIT 1
    ` as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  async upsertJobFromFreshteam(data: any) {
    const existing = await this.sql`SELECT id FROM job_postings WHERE freshteam_job_id=${String(data.freshteamJobId)}` as any[];
    if (existing.length > 0) {
      const r = await this.sql`UPDATE job_postings SET title=${data.title},department=COALESCE(${data.department||null},department),description=COALESCE(${data.description||null},description),requirements=COALESCE(${data.requirements||null},requirements),status=COALESCE(${data.status||null},status),employment_type=COALESCE(${data.employmentType||null},employment_type),experience_level=COALESCE(${data.experienceLevel||null},experience_level),salary_range_min=COALESCE(${data.salaryRangeMin??null},salary_range_min),salary_range_max=COALESCE(${data.salaryRangeMax??null},salary_range_max),salary_currency=COALESCE(${data.salaryCurrency||null},salary_currency),headcount=COALESCE(${data.headcount||null},headcount),published_at=COALESCE(${data.publishedAt??null},published_at),closed_at=COALESCE(${data.closedAt??null},closed_at),hiring_manager_id=COALESCE(${data.hiringManagerId||null},hiring_manager_id),hiring_manager_ids=COALESCE(${data.hmIdsJson||null},hiring_manager_ids),updated_at=NOW() WHERE id=${existing[0].id} RETURNING id` as any[];
      return { id: r[0]?.id ?? existing[0].id, created: false };
    }
    return this.insertJobFromFreshteam(data);
  }

  /** Insert only — caller must skip when freshteam_job_id already exists. */
  async insertJobFromFreshteam(data: any) {
    const createdAt = data.createdAt ?? new Date();
    const updatedAt = data.updatedAt ?? createdAt;
    const r = await this.sql`INSERT INTO job_postings(title,department,location,description,requirements,status,employment_type,experience_level,salary_range_min,salary_range_max,salary_currency,headcount,hiring_manager_id,hiring_manager_ids,published_at,closed_at,freshteam_job_id,region_code,created_at,updated_at,created_by,updated_by) VALUES(${data.title},${data.department||null},${data.location||null},${data.description||null},${data.requirements||null},${data.status||"closed"},${data.employmentType||null},${data.experienceLevel||null},${data.salaryRangeMin??null},${data.salaryRangeMax??null},${data.salaryCurrency||null},${data.headcount||1},${data.hiringManagerId||null},${data.hmIdsJson||null},${data.publishedAt??null},${data.closedAt??null},${String(data.freshteamJobId)},${data.regionCode??null},${createdAt instanceof Date ? createdAt.toISOString() : createdAt},${updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt},${data.createdBy??null},${data.updatedBy??null}) RETURNING id` as any[];
    return { id: r[0]?.id, created: true };
  }

  /** Apply FT created/updated timestamps and owner user ids (backfill all linked jobs). */
  async applyJobAuditFromFreshTeam(
    jobId: string,
    data: { createdAt: Date | null; updatedAt: Date | null; createdBy: string | null; updatedBy: string | null }
  ) {
    await this.sql`
      UPDATE job_postings
      SET
        created_at = COALESCE(${data.createdAt ? data.createdAt.toISOString() : null}, created_at),
        updated_at = COALESCE(${data.updatedAt ? data.updatedAt.toISOString() : null}, updated_at),
        created_by = COALESCE(${data.createdBy}, created_by),
        updated_by = COALESCE(${data.updatedBy}, updated_by)
      WHERE id = ${jobId}
    `;
  }

  /** Match FT recruiter official_email to an auth user (users.email or employee work_email). */
  async resolveUserIdByEmail(email: string): Promise<string | null> {
    const keys = freshteamWorkEmailMatchKeys(email);
    if (!keys.length) return null;
    const lowered = keys.map((k) => k.toLowerCase());
    const rows = await this.sql`
      SELECT u.id
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE LOWER(u.email) = ANY(${lowered})
         OR LOWER(COALESCE(e.work_email, '')) = ANY(${lowered})
      LIMIT 1
    ` as { id: string }[];
    return rows[0]?.id ?? null;
  }

  /** Backfill location/region on FT-imported jobs missing region_code. */
  async patchJobLocationAndRegion(jobId: string, location: string | null, regionCode: string | null) {
    await this.sql`
      UPDATE job_postings
      SET
        location = COALESCE(${location}, location),
        region_code = COALESCE(${regionCode}, region_code)
      WHERE id = ${jobId}
    `;
  }

  // ── Employee helpers ──────────────────────────────────────────────────────────
  async resolveEmployeeNames(ids: string[]): Promise<string[]> {
    if (!ids || ids.length === 0) return [];
    const rows = await this.sql`SELECT id,first_name,last_name FROM employees WHERE id=ANY(${ids})` as any[];
    const map = new Map(rows.map((r:any)=>[r.id, `${r.first_name} ${r.last_name}`]));
    return ids.map((id) => map.get(id) || id);
  }

  async batchResolveEmployeeNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids || ids.length === 0) return new Map();
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (unique.length === 0) return new Map();
    const rows = await this.sql`SELECT id,first_name,last_name FROM employees WHERE id=ANY(${unique})` as any[];
    return new Map(rows.map((r:any)=>[r.id, `${(r.first_name||"")} ${(r.last_name||"")}`.trim()||r.id]));
  }

  /** Resolve auth user ids to display names (employee name, else email). */
  async batchResolveUserDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    if (!userIds?.length) return new Map();
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    if (!unique.length) return new Map();
    const rows = await this.sql`
      SELECT u.id,
        COALESCE(
          NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
          u.email,
          u.id
        ) AS display_name
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = ANY(${unique})
    ` as { id: string; display_name: string }[];
    return new Map(rows.map((r) => [r.id, r.display_name]));
  }

  /** Resolve user ids and/or legacy employee ids to display names. */
  async batchResolveAssigneeDisplayNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids?.length) return new Map();
    const unique = Array.from(new Set(ids.map(String).filter(Boolean)));
    if (!unique.length) return new Map();

    const [userRows, employeeRows] = await Promise.all([
      this.sql`
        SELECT u.id, u.employee_id,
          COALESCE(
            NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
            u.email,
            u.id
          ) AS display_name
        FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE u.id = ANY(${unique}) OR u.employee_id = ANY(${unique})
      ` as unknown as Promise<Array<{ id: string; employee_id: string | null; display_name: string }>>,
      this.sql`
        SELECT id,
          COALESCE(
            NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
            work_email,
            id
          ) AS display_name
        FROM employees
        WHERE id = ANY(${unique})
      ` as unknown as Promise<Array<{ id: string; display_name: string }>>,
    ]);

    const map = new Map<string, string>();
    for (const row of userRows) {
      map.set(row.id, row.display_name);
      if (row.employee_id) map.set(row.employee_id, row.display_name);
    }
    for (const row of employeeRows) {
      if (!map.has(row.id)) map.set(row.id, row.display_name);
    }
    return map;
  }

  async resolveHiringManagersByEmails(emails: string[]): Promise<string[]> {
    if (!emails.length) return [];
    const unique = Array.from(new Set(emails)).filter(Boolean);
    const rows = await this.sql`SELECT id FROM employees WHERE work_email=ANY(${unique})` as any[];
    return rows.map((r:any)=>r.id);
  }

  async getInterviewerEmails(ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = (await this.sql`SELECT id, work_email FROM employees WHERE id=ANY(${ids})`) as { id: string; work_email: string | null }[];
    const byId = new Map(rows.map((r) => [r.id, (r.work_email ?? "").trim()]));
    return ids.map((id) => byId.get(id)).filter((e): e is string => !!e);
  }

  // ── Applications ──────────────────────────────────────────────────────────────
  // Neon 0.10 has no sql.unsafe(); column list is inlined so only limit/offset/ids are interpolated.
  private static readonly APP_COLS =
    "a.id,a.candidate_id,a.job_id,a.stage,a.applied_at,a.stage_updated_at,a.updated_at,a.rating,c.first_name,c.last_name,c.email as candidate_email,c.current_company,c.current_title,c.experience_years,c.expected_salary,(c.resume_url IS NOT NULL AND LENGTH(TRIM(COALESCE(c.resume_url,'')))>50) AS has_resume,c.resume_filename,CASE WHEN c.resume_url IS NOT NULL AND(c.resume_url ILIKE 'http://%' OR c.resume_url ILIKE 'https://%') THEN c.resume_url ELSE NULL END AS resume_url,c.linkedin_url as candidate_linkedin_url,c.source,c.tags,TRIM(CONCAT_WS(', ',NULLIF(TRIM(COALESCE(c.city,'')),'' ),NULLIF(TRIM(COALESCE(c.country,'')),'') )) as location,j.title as job_title,j.department as job_department,o.id as offer_id,o.status as offer_status,o.approval_status as offer_approval_status,o.offer_letter_url,o.offer_letter_filename,o.esign_status,o.template_id as offer_template_id,tr.status as tentative_status,a.reject_reason,(SELECT h.notes FROM application_stage_history h WHERE h.application_id=a.id AND h.to_stage='rejected' ORDER BY h.created_at DESC LIMIT 1) AS rejection_stage_notes,(SELECT COALESCE(NULLIF(TRIM(BOTH ' ' FROM COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')),''), u.email) FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = j.created_by) AS job_owner_display";

  async listApplications(limit: number, offset: number, scopedJobIds?: string[], regions?: string[] | null) {
    if (scopedJobIds && scopedJobIds.length === 0) return [];
    if (regions != null && regions.length === 0) return []; // no region → fail-closed
    const conds: string[] = []; const params: any[] = [];
    if (scopedJobIds && scopedJobIds.length > 0) { params.push(scopedJobIds); conds.push(`a.job_id=ANY($${params.length})`); }
    if (regions != null) { params.push(regions); conds.push(`a.region_code=ANY($${params.length})`); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    params.push(limit); const limIdx = params.length;
    params.push(offset); const offIdx = params.length;
    return this.sql(
      `SELECT ${RecruitmentRepository.APP_COLS} FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id LEFT JOIN offers o ON o.application_id=a.id LEFT JOIN tentative_records tr ON tr.application_id=a.id ${where} ORDER BY a.rating DESC NULLS LAST, a.applied_at DESC LIMIT $${limIdx} OFFSET $${offIdx}`,
      params
    ) as Promise<any[]>;
  }

  async listApplicationsByJob(jobId: string, limit: number, offset: number, search: string | null = null) {
    const noSearch = search === null;
    const pat = search;
    const applicantSearchSql =
      "($2::boolean OR c.first_name ILIKE $3 OR c.last_name ILIKE $3 OR c.email ILIKE $3 OR (c.first_name || ' ' || c.last_name) ILIKE $3 OR COALESCE(c.current_company, '') ILIKE $3 OR COALESCE(c.current_title, '') ILIKE $3)";
    const [countResult, apps] = await Promise.all([
      this.sql`SELECT COUNT(*)::int as total FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id WHERE a.job_id=${jobId} AND (${noSearch} OR c.first_name ILIKE ${pat} OR c.last_name ILIKE ${pat} OR c.email ILIKE ${pat} OR (c.first_name || ' ' || c.last_name) ILIKE ${pat} OR COALESCE(c.current_company, '') ILIKE ${pat} OR COALESCE(c.current_title, '') ILIKE ${pat})`,
      this.sql(
        `SELECT ${RecruitmentRepository.APP_COLS} FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id LEFT JOIN offers o ON o.application_id=a.id LEFT JOIN tentative_records tr ON tr.application_id=a.id WHERE a.job_id=$1 AND ${applicantSearchSql} ORDER BY a.rating DESC NULLS LAST, a.applied_at DESC LIMIT $4 OFFSET $5`,
        [jobId, noSearch, pat ?? "", limit, offset]
      ) as Promise<any[]>,
    ]);
    const rawTotal = (countResult[0] as any)?.total;
    return { applications: Array.isArray(apps) ? apps : [], total: typeof rawTotal === "number" ? rawTotal : parseInt(String(rawTotal),10)||0 };
  }

  async listApplicationsByCandidate(candidateId: string, limit: number, offset: number, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const noRegion = regions == null;
    const regionArr = regions ?? [];
    return this.sql(
      `SELECT ${RecruitmentRepository.APP_COLS} FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id LEFT JOIN offers o ON o.application_id=a.id LEFT JOIN tentative_records tr ON tr.application_id=a.id WHERE a.candidate_id=$1 AND ($4::boolean OR j.region_code=ANY($5)) ORDER BY a.rating DESC NULLS LAST, a.applied_at DESC LIMIT $2 OFFSET $3`,
      [candidateId, limit, offset, noRegion, regionArr]
    ) as Promise<any[]>;
  }

  async getApplicationById(id: string) {
    const rows = await this.sql`SELECT a.*,c.first_name,c.last_name,c.email as candidate_email,c.phone as candidate_phone,c.linkedin_url,c.resume_url,c.resume_filename,c.current_company,c.current_title,c.experience_years,c.current_salary,c.expected_salary,c.salary_currency,j.title as job_title,j.department as job_department,j.location as job_location,j.form_config FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id WHERE a.id=${id}` as any[];
    return rows[0] ?? null;
  }

  async createApplication(d: any, userId: string | null, regionCode: string | null = null) {
    const customAnswersJson = d.customAnswers && typeof d.customAnswers === "object" ? JSON.stringify(d.customAnswers) : null;
    const r = await this.sql`INSERT INTO applications(candidate_id,job_id,stage,cover_letter,referral_source,custom_answers,region_code,applied_at,stage_updated_at,created_at,updated_at) VALUES(${d.candidateId},${d.jobId},'applied',${d.coverLetter||null},${d.referralSource||null},${customAnswersJson},${regionCode},NOW(),NOW(),NOW(),NOW()) RETURNING *` as any[];
    await this.sql`INSERT INTO application_stage_history(application_id,from_stage,to_stage,notes,moved_by) VALUES(${r[0].id},NULL,'applied','Application submitted',${userId})`;
    return r[0];
  }

  async createApplicationFromFreshteam(candidateId: string, jobId: string, stage: string, appliedAt: Date, coverLetter: string | null, referralSource: string | null) {
    const r = await this.sql`
      INSERT INTO applications(candidate_id, job_id, stage, applied_at, cover_letter, referral_source, region_code)
      SELECT ${candidateId}, ${jobId}, ${stage}, ${appliedAt.toISOString()}, ${coverLetter}, ${referralSource}, j.region_code
      FROM job_postings j
      WHERE j.id = ${jobId}
      RETURNING id
    ` as any[];
    const applicationId = r[0]?.id;
    if (applicationId) {
      await this.sql`INSERT INTO application_stage_history(application_id,from_stage,to_stage,notes,moved_by) VALUES(${applicationId},NULL,${stage},'Imported from FreshTeam',NULL)`;
    }
  }

  async applicationExistsForJob(candidateId: string, jobId: string) {
    const r = await this.sql`SELECT id FROM applications WHERE candidate_id=${candidateId} AND job_id=${jobId}` as any[];
    return r.length > 0;
  }

  /** When HR moves the application out of tentative, close the open tentative row so dashboards stay accurate. */
  async cancelTentativeIfPending(applicationId: string) {
    await this.sql`
      UPDATE tentative_records
      SET status = 'cancelled'
      WHERE application_id = ${applicationId} AND status = 'pending'
    `;
  }

  async updateApplicationStage(id: string, stage: string, fromStage: string, data: any, userId: string) {
    const verbalAt = stage === "verbally_accepted" ? new Date() : null;
    const existing = await this.sql`SELECT reject_reason FROM applications WHERE id=${id}` as any[];
    const rejectReason = stage === "rejected" ? (data.rejectReason || null) : (existing[0]?.reject_reason ?? null);
    const r = await this.sql`UPDATE applications SET stage=${stage},stage_updated_at=NOW(),verbal_acceptance_at=COALESCE(${verbalAt},verbal_acceptance_at),reject_reason=${rejectReason},updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    const idsJson = data.interviewerIds && Array.isArray(data.interviewerIds) && data.interviewerIds.length > 0 ? JSON.stringify(data.interviewerIds) : null;
    const scheduledAtVal = data.scheduledAt ? new Date(data.scheduledAt) : null;
    const interviewTypeStr = data.interviewType != null ? String(data.interviewType).trim() || null : null;
    // For rejection, prepend the reject reason to the history notes so it appears in the activity feed
    let historyNotes = data.notes || null;
    if (stage === "rejected" && data.rejectReason) {
      historyNotes = data.notes
        ? `Reason: ${data.rejectReason}\n${data.notes}`
        : `Reason: ${data.rejectReason}`;
    }
    const hist = await this.sql`INSERT INTO application_stage_history(application_id,from_stage,to_stage,notes,moved_by,interviewer_names,interviewer_ids,scheduled_at,interview_type) VALUES(${id},${fromStage},${stage},${historyNotes},${userId},${data.interviewerNames||null},${idsJson},${scheduledAtVal},${interviewTypeStr}) RETURNING id` as any[];
    return { application: r[0], stageHistoryId: hist[0]?.id ?? null };
  }

  async updateStageHistoryMeeting(historyId: string, joinUrl: string | null, eventId: string | null) {
    await this.sql`UPDATE application_stage_history SET meeting_link=${joinUrl||null},teams_event_id=${eventId||null} WHERE id=${historyId}`;
  }

  /** Set application stage only (no history row). */
  async setApplicationStage(applicationId: string, newStage: string) {
    const verbalAt = newStage === "verbally_accepted" ? new Date() : null;
    await this.sql`
      UPDATE applications
      SET stage = ${newStage},
          stage_updated_at = NOW(),
          verbal_acceptance_at = COALESCE(${verbalAt}, verbal_acceptance_at),
          updated_at = NOW()
      WHERE id = ${applicationId}
    `;
  }

  async getUserEmail(userId: string): Promise<string | null> {
    const r = await this.sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1` as { email: string }[];
    const e = r[0]?.email?.trim();
    return e || null;
  }

  /** Max round number already recorded for this application and pipeline stage. */
  async getMaxInterviewRoundForStage(applicationId: string, toStage: string): Promise<number> {
    const rows = await this.sql`
      SELECT COALESCE(MAX(interview_round), 0)::int AS max_r
      FROM application_stage_history
      WHERE application_id = ${applicationId} AND to_stage = ${toStage}
    ` as { max_r: number }[];
    return rows[0]?.max_r ?? 0;
  }

  /**
   * Insert a scheduled interview/screening history row (append-only).
   * `toStage` is the pipeline bucket (screening or interview), not always "interview".
   */
  async insertInterviewScheduleHistory(
    applicationId: string,
    fromStage: string | null,
    toStage: string,
    data: {
      notes?: string | null;
      interviewerNames?: string | null;
      interviewerIds?: string[] | null;
      scheduledAt?: string | null;
      scheduledAtEnd?: string | null;
      interviewTypeLabel?: string | null;
      interviewerRound?: number | null;
      scheduleFormat?: string | null;
      meetingLink?: string | null;
      teamsEventId?: string | null;
    },
    userId: string,
  ): Promise<string | null> {
    const idsJson = data.interviewerIds?.length ? JSON.stringify(data.interviewerIds) : null;
    const scheduledAtVal = data.scheduledAt ? new Date(data.scheduledAt) : null;
    const scheduledAtEndVal = data.scheduledAtEnd ? new Date(data.scheduledAtEnd) : null;
    const typeStr = data.interviewTypeLabel?.trim() || null;
    const round = data.interviewerRound != null && Number.isFinite(data.interviewerRound) ? Math.trunc(data.interviewerRound) : null;
    const fmt = data.scheduleFormat?.trim() || null;
    const hist = await this.sql`
      INSERT INTO application_stage_history (
        application_id, from_stage, to_stage, notes, moved_by,
        interviewer_names, interviewer_ids, scheduled_at, scheduled_at_end, interview_type,
        meeting_link, teams_event_id, interview_round, schedule_format
      )
      VALUES (
        ${applicationId},
        ${fromStage},
        ${toStage},
        ${data.notes ?? null},
        ${userId},
        ${data.interviewerNames ?? null},
        ${idsJson},
        ${scheduledAtVal},
        ${scheduledAtEndVal},
        ${typeStr},
        ${data.meetingLink ?? null},
        ${data.teamsEventId ?? null},
        ${round},
        ${fmt}
      )
      RETURNING id
    ` as { id: string }[];
    return hist[0]?.id ?? null;
  }

  /** Insert a fresh interview-round history entry without touching the application stage. */
  async addInterviewRound(appId: string, currentStage: string, data: {
    interviewerNames?: string | null;
    interviewerIds?: string[] | null;
    scheduledAt?: string | null;
    interviewType?: string | null;
    notes?: string | null;
    /** Pipeline stage this round belongs to (screening or interview). Defaults to current stage when screening/interview, else interview. */
    pipelineStage?: string | null;
    interviewRound?: number | null;
    scheduleFormat?: string | null;
  }, userId: string): Promise<string | null> {
    const idsJson = data.interviewerIds?.length ? JSON.stringify(data.interviewerIds) : null;
    const scheduledAtVal = data.scheduledAt ? new Date(data.scheduledAt) : null;
    const typeStr = data.interviewType?.trim() || null;
    const toStage =
      data.pipelineStage === "screening" || data.pipelineStage === "interview"
        ? data.pipelineStage
        : currentStage === "screening" || currentStage === "interview"
          ? currentStage
          : "interview";
    const round = data.interviewRound != null ? Math.trunc(Math.min(3, Math.max(1, data.interviewRound))) : null;
    const fmt = data.scheduleFormat?.trim() || null;
    const hist = await this.sql`
      INSERT INTO application_stage_history
        (application_id, from_stage, to_stage, notes, moved_by, interviewer_names, interviewer_ids, scheduled_at, interview_type, interview_round, schedule_format)
      VALUES
        (${appId}, ${currentStage}, ${toStage}, ${data.notes||null}, ${userId}, ${data.interviewerNames||null}, ${idsJson}, ${scheduledAtVal}, ${typeStr}, ${round}, ${fmt})
      RETURNING id
    ` as any[];
    return hist[0]?.id ?? null;
  }

  async getApplicationStageDetail(id: string) {
    const r = await this.sql`
      SELECT c.email as candidate_email, c.first_name, c.last_name, j.title as job_title, j.id as job_id,
             COALESCE(NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''), u.email, 'HR Team') as owner_display_name
      FROM applications a
      INNER JOIN candidates c ON c.id = a.candidate_id
      INNER JOIN job_postings j ON j.id = a.job_id
      LEFT JOIN users u ON u.id = j.created_by
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE a.id = ${id}
    ` as any[];
    return r[0] ?? null;
  }

  async updateApplicationRating(id: string, rating: number | null): Promise<any> {
    const r = await this.sql`UPDATE applications SET rating=${rating},updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0] ?? null;
  }

  async deleteApplication(id: string) {
    const r = await this.sql`DELETE FROM applications WHERE id=${id} RETURNING id` as any[];
    return r[0] ?? null;
  }

  async getApplicationStageHistory(applicationId: string) {
    return this.sql`SELECT h.*,u.email as moved_by_email FROM application_stage_history h LEFT JOIN users u ON u.id=h.moved_by WHERE h.application_id=${applicationId} ORDER BY h.created_at ASC`;
  }

  /** Single history row (for backfill / reminder flows). */
  async getApplicationStageHistoryById(historyId: string) {
    const rows = await this.sql`
      SELECT id, application_id, interviewer_ids
      FROM application_stage_history
      WHERE id = ${historyId}
      LIMIT 1
    ` as { id: string; application_id: string; interviewer_ids: unknown }[];
    return rows[0] ?? null;
  }

  async getJobPosting(id: string) {
    const r = await this.sql`SELECT status FROM job_postings WHERE id=${id}` as any[];
    return r[0] ?? null;
  }

  async getCandidateRow(id: string) {
    const r = await this.sql`SELECT id FROM candidates WHERE id=${id}` as any[];
    return r[0] ?? null;
  }

  // ── Application Emails ────────────────────────────────────────────────────────
  async listApplicationEmails(applicationId: string) {
    return this.sql`SELECT id,application_id,direction,from_email,to_email,cc,bcc,subject,body_plain,body_html,sent_at,received_at,created_at FROM application_emails WHERE application_id=${applicationId} ORDER BY created_at ASC`;
  }

  async insertApplicationEmail(d: any) {
    const r = await this.sql`INSERT INTO application_emails(application_id,direction,from_email,to_email,cc,bcc,subject,body_plain,body_html,sent_at,created_at) VALUES(${d.applicationId},'sent',${d.fromEmail},${d.toEmail},${d.cc||null},${d.bcc||null},${d.subject||""},${d.body||""},${d.body||""},NOW(),NOW()) RETURNING id,application_id,direction,from_email,to_email,subject,body_plain,sent_at,created_at` as any[];
    return r[0];
  }

  async updateEmailMessageId(emailId: string, messageId: string) {
    await this.sql`UPDATE application_emails SET message_id=${messageId} WHERE id=${emailId}`;
  }

  async insertInboundEmail(d: any) {
    await this.sql`INSERT INTO application_emails(application_id,direction,from_email,to_email,subject,body_plain,body_html,message_id,received_at,created_at) VALUES(${d.applicationId},'received',${d.fromEmail},${d.toEmail},${d.subject},${d.textPlain||null},${d.textHtml||null},${d.messageId??null},NOW(),NOW())`;
  }

  async deleteApplicationEmail(emailId: string, applicationId: string) {
    const r = await this.sql`DELETE FROM application_emails WHERE id=${emailId} AND application_id=${applicationId} RETURNING id` as any[];
    return r[0] ?? null;
  }

  async matchEmailByMessageId(messageId: string) {
    const normalized = messageId.replace(/^<|>$/g, "");
    const rows = await this.sql`SELECT application_id FROM application_emails WHERE message_id=${messageId} OR message_id=${normalized} OR message_id=${`<${normalized}>`} LIMIT 1` as any[];
    return rows[0]?.application_id ?? null;
  }

  async matchEmailBySenderSubject(fromEmail: string, normalizedSubject: string) {
    const rows = await this.sql`SELECT ae.application_id FROM application_emails ae WHERE ae.direction='sent' AND (ae.to_email ILIKE ${"%" + fromEmail + "%"} OR ae.to_email=${fromEmail}) AND LOWER(TRIM(REGEXP_REPLACE(ae.subject,'^\\s*(Re:\\s*|Fwd:\\s*)+','','gi')))=${normalizedSubject} ORDER BY ae.created_at DESC LIMIT 1` as any[];
    return rows[0]?.application_id ?? null;
  }

  // ── Offers ────────────────────────────────────────────────────────────────────
  async listOffers(scopedJobIds?: string[]) {
    const noScope = !scopedJobIds;
    const ids = scopedJobIds ?? [];
    return this.sql`SELECT o.*,a.candidate_id,a.job_id,c.first_name,c.last_name,c.email as candidate_email,j.title as job_posting_title FROM offers o INNER JOIN applications a ON a.id=o.application_id INNER JOIN candidates c ON c.id=a.candidate_id INNER JOIN job_postings j ON j.id=a.job_id WHERE (${noScope} OR a.job_id=ANY(${ids})) ORDER BY o.created_at DESC`;
  }

  async getOffersByApplication(applicationId: string): Promise<any[]> {
    return this.sql`SELECT * FROM offers WHERE application_id=${applicationId}` as unknown as Promise<any[]>;
  }

  async getOfferById(id: string) {
    const r = await this.sql`SELECT * FROM offers WHERE id=${id}` as any[];
    return r[0] ?? null;
  }

  /** Ensures migration 0095 is applied when DB was not migrated manually (created_by on offers). */
  async ensureOffersCreatedByColumn() {
    await this.sql`
      ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL
    `;
  }

  async createOffer(d: any) {
    await this.ensureOffersCreatedByColumn();
    const approvalStatus = d.approvalStatus ?? "pending";
    const r = await this.sql`INSERT INTO offers(application_id,salary,salary_currency,job_title,department,start_date,employment_type,terms,status,esign_status,sent_at,response_token,approval_status,template_id,template_version,variables_snapshot,merged_document_url,esign_token_expires_at,created_by) VALUES(${d.applicationId},${d.salary},${d.salaryCurrency||null},${d.jobTitle},${d.department||null},${d.startDate||null},${d.employmentType||null},${d.terms||null},${d.status||"draft"},${d.esignStatus||null},${d.sentAt||null},${d.responseToken||null},${approvalStatus},${d.templateId||null},${d.templateVersion||null},${d.variablesSnapshot?JSON.stringify(d.variablesSnapshot):null},${d.mergedDocumentUrl||null},${d.esignTokenExpiresAt||null},${d.createdBy ?? null}) RETURNING *` as any[];
    return r[0];
  }

  /** Limited-recruiter flow: move from not_requested → pending (caller sends HR email). */
  async requestOfferApproval(id: string) {
    const r = await this.sql`UPDATE offers SET approval_status='pending',updated_at=NOW() WHERE id=${id} AND approval_status='not_requested' RETURNING *` as any[];
    return r[0] ?? null;
  }

  async updateOffer(id: string, u: any) {
    // Partial patches (e.g. mergeOfferTemplate) must not clear sent_at / response_token — omit = leave unchanged.
    const hasSentAt = Object.prototype.hasOwnProperty.call(u, "sentAt");
    const hasRespondedAt = Object.prototype.hasOwnProperty.call(u, "respondedAt");
    const hasResponseToken = Object.prototype.hasOwnProperty.call(u, "responseToken");
    const hasTemplateId = Object.prototype.hasOwnProperty.call(u, "templateId");
    const hasTemplateVersion = Object.prototype.hasOwnProperty.call(u, "templateVersion");
    const hasVariablesSnapshot = Object.prototype.hasOwnProperty.call(u, "variablesSnapshot");
    const vsJson =
      hasVariablesSnapshot && u.variablesSnapshot != null ? JSON.stringify(u.variablesSnapshot) : null;
    const r = await this.sql`UPDATE offers SET salary=COALESCE(${u.salary},salary),salary_currency=COALESCE(${u.salaryCurrency},salary_currency),job_title=COALESCE(${u.jobTitle},job_title),department=COALESCE(${u.department},department),start_date=COALESCE(${u.startDate},start_date),employment_type=COALESCE(${u.employmentType},employment_type),terms=COALESCE(${u.terms},terms),status=COALESCE(${u.status},status),sent_at=CASE WHEN ${hasSentAt} THEN ${u.sentAt ?? null} ELSE sent_at END,responded_at=CASE WHEN ${hasRespondedAt} THEN ${u.respondedAt ?? null} ELSE responded_at END,response_token=CASE WHEN ${hasResponseToken} THEN ${u.responseToken ?? null} ELSE response_token END,esign_status=COALESCE(${u.esignStatus ?? null},esign_status),template_id=CASE WHEN ${hasTemplateId} THEN ${u.templateId ?? null} ELSE template_id END,template_version=CASE WHEN ${hasTemplateVersion} THEN ${u.templateVersion ?? null} ELSE template_version END,variables_snapshot=CASE WHEN ${hasVariablesSnapshot} THEN ${vsJson} ELSE variables_snapshot END,merged_document_url=COALESCE(${u.mergedDocumentUrl ?? null},merged_document_url),signed_document_url=COALESCE(${u.signedDocumentUrl ?? null},signed_document_url),esign_token_expires_at=COALESCE(${u.esignTokenExpiresAt ?? null},esign_token_expires_at),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0];
  }

  async approveOffer(id: string, userId: string) {
    const r = await this.sql`UPDATE offers SET approval_status='approved',approved_at=NOW(),approved_by=${userId},updated_at=NOW() WHERE id=${id} AND approval_status='pending' RETURNING *` as any[];
    return r[0] ?? null;
  }

  async rejectOffer(id: string, userId: string) {
    const r = await this.sql`UPDATE offers SET approval_status='rejected',approved_at=NOW(),approved_by=${userId},updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0];
  }

  async uploadOfferLetter(id: string, fileUrl: string, fileName: string) {
    await this.sql`UPDATE offers SET offer_letter_url=${fileUrl},offer_letter_filename=${fileName},updated_at=NOW() WHERE id=${id}`;
  }

  async getOfferLetter(id: string) {
    const r = await this.sql`SELECT offer_letter_url,offer_letter_filename FROM offers WHERE id=${id}` as any[];
    return r[0] ?? null;
  }

  /** Returns all fields needed to send the offer email: offer details + candidate info + offer letter. */
  async getOfferFullDetails(id: string) {
    const r = await this.sql`
      SELECT
        o.id, o.salary, o.salary_currency, o.job_title, o.department,
        o.start_date, o.employment_type, o.terms, o.status, o.response_token,
        o.offer_letter_url, o.offer_letter_filename,
        o.template_id, o.merged_document_url, o.signed_document_url, o.esign_status,
        o.created_at AS offer_created_at,
        c.first_name, c.last_name, c.email AS candidate_email,
        j.title AS job_posting_title, j.location AS job_location,
        j.department AS job_posting_department,
        a.id AS application_id, a.job_id AS job_id
      FROM offers o
      INNER JOIN applications a ON a.id = o.application_id
      INNER JOIN candidates c   ON c.id = a.candidate_id
      INNER JOIN job_postings j ON j.id = a.job_id
      WHERE o.id = ${id}
    ` as any[];
    return r[0] ?? null;
  }

  async getOfferByToken(token: string) {
    const r = await this.sql`
      SELECT
        o.id, o.salary, o.salary_currency, o.job_title, o.department, o.start_date, o.employment_type,
        o.terms, o.status, o.sent_at, o.responded_at,
        o.template_id, o.merged_document_url, o.esign_status, o.esign_signed_at,
        o.esign_signature_data, o.esign_token_expires_at, o.variables_snapshot,
        c.first_name AS candidate_first_name, c.last_name AS candidate_last_name, c.email AS candidate_email,
        j.title AS job_posting_title, j.department AS job_posting_department, j.location AS job_location,
        j.employment_type AS job_employment_type,
        b.time_zone AS branch_time_zone, b.date_format AS branch_date_format,
        a.id AS application_id, j.id AS job_id
      FROM offers o
      INNER JOIN applications a ON a.id = o.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      INNER JOIN job_postings j ON j.id = a.job_id
      LEFT JOIN employees hm ON hm.id = j.hiring_manager_id
      LEFT JOIN branches b ON b.id = hm.branch_id
      WHERE o.response_token = ${token}
    ` as any[];
    return r[0] ?? null;
  }

  async submitEsign(id: string, signatureData: string, ip: string, ua: string) {
    const r = await this.sql`UPDATE offers SET esign_status='signed',esign_signature_data=${signatureData},esign_signed_at=NOW(),esign_signer_ip=${ip},esign_signer_ua=${ua},status='accepted',responded_at=NOW(),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0];
  }

  async declineOffer(id: string) {
    const r = await this.sql`UPDATE offers SET status='rejected',esign_status='declined',responded_at=NOW(),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0];
  }

  async getOfferLink(id: string) {
    const r = await this.sql`SELECT id,status,response_token FROM offers WHERE id=${id}` as any[];
    return r[0] ?? null;
  }

  async updateOfferToken(id: string, token: string) {
    await this.sql`UPDATE offers SET response_token=${token},updated_at=NOW() WHERE id=${id}`;
  }

  async getTentativeForApplication(applicationId: string) {
    const r = await this.sql`
      SELECT id, status FROM tentative_records
      WHERE application_id=${applicationId}
      ORDER BY created_at DESC
      LIMIT 1
    ` as any[];
    return r[0] ?? null;
  }

  // ── Hire ──────────────────────────────────────────────────────────────────────
  async getApplicationForHire(id: string) {
    const r = await this.sql`SELECT a.*,c.first_name,c.last_name,c.email,c.phone,c.personal_email as candidate_personal_email,c.date_of_birth,c.gender,c.marital_status,c.blood_group,c.street,c.city,c.state,c.country,c.zip_code,j.location as job_location FROM applications a INNER JOIN candidates c ON c.id=a.candidate_id LEFT JOIN job_postings j ON j.id=a.job_id WHERE a.id=${id}` as any[];
    return r[0] ?? null;
  }

  async createEmployeeFromHire(d: any) {
    const personalPhone = d.personalPhone ?? d.phone ?? null;
    const workPhone = d.workPhone ?? null;
    const branchId = d.branchId ?? d.branch_id ?? null;
    const r = await this.sql`INSERT INTO employees(employee_id,work_email,first_name,last_name,nickname,job_title,department,location,branch_id,employment_status,employee_type,join_date,personal_email,personal_phone,work_phone,dob,gender,marital_status,blood_group,street,city,state,country,zip_code,source) VALUES(${d.employeeId},${d.workEmail},${d.firstName},${d.lastName},${d.nickname ?? null},${d.jobTitle},${d.department||"Other"},${d.location||null},${branchId},'onboarding',${d.employmentType||"full_time"},${d.joinDate},${d.personalEmail||null},${personalPhone},${workPhone},${d.dob||null},${d.gender||null},${d.maritalStatus||null},${d.bloodGroup||null},${d.street||null},${d.city||null},${d.state||null},${d.country||null},${d.zipCode||null},'manual') RETURNING *` as any[];
    return r[0];
  }

  async markApplicationHired(id: string, employeeId: string, fromStage: string, userId: string) {
    await this.sql`UPDATE applications SET stage='hired',stage_updated_at=NOW(),employee_id=${employeeId},converted_at=NOW(),updated_at=NOW() WHERE id=${id}`;
    await this.sql`INSERT INTO application_stage_history(application_id,from_stage,to_stage,notes,moved_by) VALUES(${id},${fromStage},'hired','Candidate hired and converted to employee',${userId})`;
  }

  async rejectApplicationOnOfferReject(applicationId: string, fromStage: string, userId: string) {
    await this.sql`UPDATE applications SET stage='rejected',stage_updated_at=NOW(),reject_reason=COALESCE(reject_reason,'Offer rejected'),updated_at=NOW() WHERE id=${applicationId}`;
    await this.sql`INSERT INTO application_stage_history(application_id,from_stage,to_stage,notes,moved_by) VALUES(${applicationId},${fromStage},'rejected','Offer rejected',${userId})`;
  }

  async moveApplicationToOffer(applicationId: string, fromStage: string, userId: string) {
    await this.sql`UPDATE applications SET stage='offer',stage_updated_at=NOW(),updated_at=NOW() WHERE id=${applicationId}`;
    await this.sql`INSERT INTO application_stage_history(application_id,from_stage,to_stage,notes,moved_by) VALUES(${applicationId},${fromStage},'offer','Offer created',${userId})`;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  async getStats() {
    const [[jobStats], [appStats], [candidateStats], [offerStats]] = await Promise.all([
      this.sql`SELECT COUNT(*)::int as total_jobs,COUNT(*) FILTER(WHERE status='published')::int as active_jobs,COUNT(*) FILTER(WHERE status='draft')::int as draft_jobs,COUNT(*) FILTER(WHERE status='closed')::int as closed_jobs FROM job_postings WHERE status!='archived'`,
      this.sql`SELECT COUNT(*)::int as total_applications,COUNT(*) FILTER(WHERE stage='applied')::int as applied,COUNT(*) FILTER(WHERE stage='screening' OR stage='longlisted')::int as in_review,COUNT(*) FILTER(WHERE stage='interview')::int as interviewing,COUNT(*) FILTER(WHERE stage='offer')::int as offers,COUNT(*) FILTER(WHERE stage='tentative')::int as tentative,COUNT(*) FILTER(WHERE stage='hired')::int as hired,COUNT(*) FILTER(WHERE stage='rejected')::int as rejected,COUNT(*) FILTER(WHERE applied_at >= NOW() - INTERVAL '7 days')::int as new_this_week FROM applications`,
      this.sql`SELECT COUNT(*)::int as total_candidates FROM candidates`,
      this.sql`SELECT COUNT(*)::int as total_offers,COUNT(*) FILTER(WHERE status='sent')::int as pending,COUNT(*) FILTER(WHERE status='accepted')::int as accepted,COUNT(*) FILTER(WHERE status='rejected')::int as declined FROM offers`,
    ]);
    return { jobs: jobStats, applications: appStats, candidates: candidateStats, offers: offerStats };
  }

  async getStatsScoped(jobIds: string[]) {
    if (!jobIds.length) {
      return {
        jobs: { total_jobs: 0, active_jobs: 0, draft_jobs: 0, closed_jobs: 0 },
        applications: { total_applications: 0, applied: 0, in_review: 0, interviewing: 0, offers: 0, tentative: 0, hired: 0, rejected: 0 },
        candidates: { total_candidates: 0 },
        offers: { total_offers: 0, pending: 0, accepted: 0, declined: 0 },
      };
    }
    const [[jobStats], [appStats], [candidateStats], [offerStats]] = await Promise.all([
      this.sql`SELECT COUNT(*)::int as total_jobs,COUNT(*) FILTER(WHERE status='published')::int as active_jobs,COUNT(*) FILTER(WHERE status='draft')::int as draft_jobs,COUNT(*) FILTER(WHERE status='closed')::int as closed_jobs FROM job_postings WHERE status!='archived' AND id=ANY(${jobIds})`,
      this.sql`SELECT COUNT(*)::int as total_applications,COUNT(*) FILTER(WHERE stage='applied')::int as applied,COUNT(*) FILTER(WHERE stage='screening' OR stage='longlisted')::int as in_review,COUNT(*) FILTER(WHERE stage='interview')::int as interviewing,COUNT(*) FILTER(WHERE stage='offer')::int as offers,COUNT(*) FILTER(WHERE stage='tentative')::int as tentative,COUNT(*) FILTER(WHERE stage='hired')::int as hired,COUNT(*) FILTER(WHERE stage='rejected')::int as rejected,COUNT(*) FILTER(WHERE applied_at >= NOW() - INTERVAL '7 days')::int as new_this_week FROM applications WHERE job_id=ANY(${jobIds})`,
      this.sql`SELECT COUNT(DISTINCT candidate_id)::int as total_candidates FROM applications WHERE job_id=ANY(${jobIds})`,
      this.sql`SELECT COUNT(*)::int as total_offers,COUNT(*) FILTER(WHERE status='sent')::int as pending,COUNT(*) FILTER(WHERE status='accepted')::int as accepted,COUNT(*) FILTER(WHERE status='rejected')::int as declined FROM offers o INNER JOIN applications a ON a.id=o.application_id WHERE a.job_id=ANY(${jobIds})`,
    ]);
    return { jobs: jobStats, applications: appStats, candidates: candidateStats, offers: offerStats };
  }

  // ── Application Comments ──────────────────────────────────────────────────────

  private async ensureCommentsTable() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS application_comments (
        id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id VARCHAR(255)  NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        author_id      VARCHAR(255)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body           TEXT          NOT NULL,
        visibility     VARCHAR(20)   NOT NULL DEFAULT 'public',
        attachments    JSONB,
        mentions       JSONB,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_app_comments_application ON application_comments(application_id)
    `;
  }

  async listApplicationComments(applicationId: string) {
    await this.ensureCommentsTable();
    return this.sql`
      SELECT
        c.*,
        u.email        AS author_email,
        e.first_name   AS author_first_name,
        e.last_name    AS author_last_name,
        e.avatar       AS author_avatar
      FROM application_comments c
      JOIN users u ON u.id = c.author_id
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE c.application_id = ${applicationId}
      ORDER BY c.created_at ASC
    ` as Promise<any[]>;
  }

  async createApplicationComment(d: {
    applicationId: string;
    authorId: string;
    body: string;
    visibility: string;
    attachments?: unknown[];
    mentions?: string[];
  }) {
    await this.ensureCommentsTable();
    const rows = await this.sql`
      INSERT INTO application_comments
        (application_id, author_id, body, visibility, attachments, mentions)
      VALUES (
        ${d.applicationId},
        ${d.authorId},
        ${d.body},
        ${d.visibility},
        ${d.attachments ? JSON.stringify(d.attachments) : null},
        ${d.mentions?.length ? JSON.stringify(d.mentions) : null}
      )
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async deleteApplicationComment(id: string, authorId: string) {
    await this.ensureCommentsTable();
    await this.sql`
      DELETE FROM application_comments WHERE id = ${id} AND author_id = ${authorId}
    `;
  }

  async getUserEmailById(userId: string): Promise<{ email: string; first_name: string | null } | null> {
    const rows = await this.sql`
      SELECT u.email, e.first_name
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = ${userId}
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async getMentionableUsers(applicationId: string) {
    // Hiring team + org-wide recruiting roles. Note: primary user_role enum has no "recruiter" —
    // those roles live in users.roles JSONB, so we must use COALESCE(roles,'[]') and job-based ORs.
    return this.sql`
      SELECT
        u.id,
        u.email,
        e.first_name,
        e.last_name,
        e.avatar       AS avatar_url
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.is_active = true
        AND (
          u.role::text IN ('admin', 'hr', 'manager')
          OR COALESCE(u.roles, '[]'::jsonb) @> '["hr"]'::jsonb
          OR COALESCE(u.roles, '[]'::jsonb) @> '["recruiter"]'::jsonb
          OR COALESCE(u.roles, '[]'::jsonb) @> '["hiring_manager"]'::jsonb
          OR COALESCE(u.roles, '[]'::jsonb) @> '["limited_recruiter"]'::jsonb
          OR COALESCE(u.roles, '[]'::jsonb) @> '["manager"]'::jsonb
          OR COALESCE(u.roles, '[]'::jsonb) @> '["admin"]'::jsonb
          OR EXISTS (
            SELECT 1 FROM job_assignments ja
            JOIN applications a ON a.job_id = ja.job_id
            WHERE a.id = ${applicationId} AND ja.user_id = u.id
          )
          OR EXISTS (
            SELECT 1 FROM applications a
            JOIN job_postings j ON j.id = a.job_id
            WHERE a.id = ${applicationId}
              AND j.hiring_manager_ids IS NOT NULL
              AND jsonb_typeof(j.hiring_manager_ids) = 'array'
              AND j.hiring_manager_ids::jsonb @> jsonb_build_array(u.id::text)
          )
          OR EXISTS (
            SELECT 1 FROM applications a
            JOIN job_postings j ON j.id = a.job_id
            WHERE a.id = ${applicationId}
              AND j.hiring_manager_id IS NOT NULL
              AND u.employee_id IS NOT NULL
              AND u.employee_id = j.hiring_manager_id
          )
        )
      ORDER BY COALESCE(e.first_name, u.email), COALESCE(e.last_name, '')
    ` as Promise<any[]>;
  }

  // ── Interview Feedback ────────────────────────────────────────────────────────

  /**
   * All scheduled interview/screening rounds for an application, enriched with
   * the scheduling user's name and per-round feedback rows.
   */
  async getInterviewsForApplication(applicationId: string) {
    return this.sql`
      SELECT
        h.id, h.to_stage, h.interview_round, h.interview_type, h.schedule_format,
        h.scheduled_at, h.scheduled_at_end, h.meeting_link, h.teams_event_id,
        h.interviewer_names, h.interviewer_ids, h.notes, h.created_at,
        h.cancelled_at, h.no_show_at,
        COALESCE(e.first_name || ' ' || e.last_name, u.email) AS scheduled_by_name,
        e.id AS scheduled_by_employee_id
      FROM application_stage_history h
      LEFT JOIN users u  ON u.id = h.moved_by
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE h.application_id = ${applicationId}
        AND h.to_stage IN ('screening', 'interview')
        AND (h.scheduled_at IS NOT NULL OR h.meeting_link IS NOT NULL)
      ORDER BY h.scheduled_at ASC NULLS LAST, h.created_at ASC
    ` as Promise<any[]>;
  }

  /** Upcoming / in-progress scheduled rounds across jobs (recruitment landing). */
  async listScheduledInterviews(scopedJobIds: string[] | undefined, limit: number) {
    const noScope = !scopedJobIds;
    const ids = scopedJobIds ?? [];
    return this.sql`
      SELECT
        h.id AS history_id,
        h.application_id,
        h.scheduled_at,
        h.scheduled_at_end,
        h.interview_type,
        h.interview_round,
        h.to_stage,
        h.schedule_format,
        h.interviewer_names,
        h.meeting_link,
        a.job_id,
        a.stage AS application_stage,
        j.title AS job_title,
        c.first_name,
        c.last_name
      FROM application_stage_history h
      INNER JOIN applications a ON a.id = h.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      INNER JOIN job_postings j ON j.id = a.job_id
      WHERE h.to_stage IN ('screening', 'interview')
        AND h.scheduled_at IS NOT NULL
        AND h.cancelled_at IS NULL
        AND h.no_show_at IS NULL
        AND a.stage NOT IN ('rejected', 'hired')
        AND COALESCE(h.scheduled_at_end, h.scheduled_at + interval '1 hour') >= NOW()
        AND (${noScope} OR a.job_id = ANY(${ids}))
      ORDER BY h.scheduled_at ASC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  /** Active interview panel duties for the signed-in employee (feedback pending or upcoming round). */
  async listInterviewerAssignments(employeeId: string, limit: number) {
    return this.sql`
      SELECT
        h.id AS history_id,
        h.application_id,
        h.scheduled_at,
        h.scheduled_at_end,
        h.interview_type,
        h.interview_round,
        h.to_stage,
        h.schedule_format,
        h.meeting_link,
        a.job_id,
        a.stage AS application_stage,
        j.title AS job_title,
        c.first_name,
        c.last_name,
        COALESCE(f.status, 'pending') AS my_feedback_status,
        f.id AS feedback_id
      FROM application_stage_history h
      INNER JOIN applications a ON a.id = h.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      INNER JOIN job_postings j ON j.id = a.job_id
      LEFT JOIN interview_feedback f
        ON f.history_id = h.id AND f.reviewer_employee_id = ${employeeId}
      WHERE h.interviewer_ids @> to_jsonb(ARRAY[${employeeId}]::text[])
        AND h.to_stage IN ('screening', 'interview')
        AND h.scheduled_at IS NOT NULL
        AND h.cancelled_at IS NULL
        AND h.no_show_at IS NULL
        AND a.stage NOT IN ('rejected', 'hired')
        AND (f.status IS NULL OR f.status IN ('pending', 'draft'))
      ORDER BY h.scheduled_at ASC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  /** Fetch a single interview history row (for edit / cancel / no-show flows). */
  async getInterviewHistoryById(historyId: string) {
    const rows = await this.sql`
      SELECT h.*, a.job_id, a.stage AS app_stage
      FROM application_stage_history h
      INNER JOIN applications a ON a.id = h.application_id
      WHERE h.id = ${historyId}
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  /** Update mutable interview fields in-place (for edits). */
  async updateInterviewHistoryRow(historyId: string, data: {
    scheduledAt?: string | null;
    scheduledAtEnd?: string | null;
    interviewerIds?: string[] | null;
    interviewerNames?: string | null;
    scheduleFormat?: string | null;
    meetingLink?: string | null;
    teamsEventId?: string | null;
    notes?: string | null;
  }) {
    const idsJson = data.interviewerIds?.length ? JSON.stringify(data.interviewerIds) : null;
    const scheduledAtVal = data.scheduledAt ? new Date(data.scheduledAt) : null;
    const scheduledAtEndVal = data.scheduledAtEnd ? new Date(data.scheduledAtEnd) : null;
    const rows = await this.sql`
      UPDATE application_stage_history SET
        scheduled_at      = COALESCE(${scheduledAtVal}, scheduled_at),
        scheduled_at_end  = COALESCE(${scheduledAtEndVal}, scheduled_at_end),
        interviewer_ids   = COALESCE(${idsJson}::jsonb, interviewer_ids),
        interviewer_names = COALESCE(${data.interviewerNames ?? null}, interviewer_names),
        schedule_format   = COALESCE(${data.scheduleFormat ?? null}, schedule_format),
        meeting_link      = ${data.meetingLink !== undefined ? data.meetingLink : null},
        teams_event_id    = ${data.teamsEventId !== undefined ? data.teamsEventId : null},
        notes             = COALESCE(${data.notes ?? null}, notes)
      WHERE id = ${historyId}
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  /** Mark an interview round as cancelled. */
  async cancelInterviewHistory(historyId: string) {
    const rows = await this.sql`
      UPDATE application_stage_history
      SET cancelled_at = NOW()
      WHERE id = ${historyId} AND cancelled_at IS NULL
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  /** Mark all feedback slots for a round as no_show, and stamp the history row. */
  async markInterviewNoShow(historyId: string, applicationId: string) {
    await this.sql`
      UPDATE interview_feedback
      SET status = 'no_show', updated_at = NOW()
      WHERE history_id = ${historyId} AND status NOT IN ('submitted')
    `;
    const rows = await this.sql`
      UPDATE application_stage_history
      SET no_show_at = NOW()
      WHERE id = ${historyId} AND no_show_at IS NULL AND cancelled_at IS NULL
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  /** All feedback rows for one interview round (HR/admin view). */
  async getInterviewFeedbackForHistory(historyId: string) {
    return this.sql`
      SELECT f.*, e.first_name AS emp_first, e.last_name AS emp_last, e.avatar AS emp_avatar
      FROM interview_feedback f
      LEFT JOIN employees e ON e.id = f.reviewer_employee_id
      WHERE f.history_id = ${historyId}
      ORDER BY f.created_at ASC
    ` as Promise<any[]>;
  }

  /** One reviewer's feedback for a round. */
  async getInterviewFeedbackForReviewer(historyId: string, employeeId: string) {
    const rows = await this.sql`
      SELECT * FROM interview_feedback
      WHERE history_id = ${historyId} AND reviewer_employee_id = ${employeeId}
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  /** Upsert a feedback row for a given (historyId, reviewerEmployeeId). */
  async upsertInterviewFeedback(data: {
    historyId: string;
    applicationId: string;
    reviewerEmployeeId: string;
    reviewerName: string;
    reviewerEmail: string;
    status: string;
    overallRating?: number | null;
    overallComments?: string | null;
    scorecard?: unknown[];
    testReportUrl?: string | null;
    testReportFilename?: string | null;
    submittedAt?: Date | null;
  }) {
    const scorecardJson = JSON.stringify(data.scorecard ?? []);
    const rows = await this.sql`
      INSERT INTO interview_feedback (
        history_id, application_id, reviewer_employee_id, reviewer_name, reviewer_email,
        status, overall_rating, overall_comments, scorecard,
        test_report_url, test_report_filename, submitted_at, updated_at
      ) VALUES (
        ${data.historyId}, ${data.applicationId}, ${data.reviewerEmployeeId},
        ${data.reviewerName}, ${data.reviewerEmail}, ${data.status},
        ${data.overallRating ?? null}, ${data.overallComments ?? null}, ${scorecardJson}::jsonb,
        ${data.testReportUrl ?? null}, ${data.testReportFilename ?? null},
        ${data.submittedAt ?? null}, NOW()
      )
      ON CONFLICT (history_id, reviewer_employee_id) WHERE reviewer_employee_id IS NOT NULL
      DO UPDATE SET
        status            = EXCLUDED.status,
        overall_rating    = EXCLUDED.overall_rating,
        overall_comments  = EXCLUDED.overall_comments,
        scorecard         = EXCLUDED.scorecard,
        test_report_url   = COALESCE(EXCLUDED.test_report_url, interview_feedback.test_report_url),
        test_report_filename = COALESCE(EXCLUDED.test_report_filename, interview_feedback.test_report_filename),
        submitted_at      = EXCLUDED.submitted_at,
        updated_at        = NOW()
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  /** Seed pending feedback slots for all interviewers listed on a history row. */
  async seedFeedbackSlotsForHistory(historyId: string, applicationId: string, interviewerIds: string[]) {
    if (!interviewerIds.length) return;
    const empRows = await this.sql`
      SELECT
        e.id,
        e.first_name,
        e.last_name,
        COALESCE(NULLIF(trim(e.work_email), ''), NULLIF(trim(u.email), '')) AS reviewer_email
      FROM employees e
      LEFT JOIN users u ON u.employee_id = e.id
      WHERE e.id = ANY(${interviewerIds})
    ` as { id: string; first_name: string; last_name: string; reviewer_email: string | null }[];
    for (const emp of empRows) {
      const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || emp.id;
      const email = (emp.reviewer_email ?? "").trim();
      await this.sql`
        INSERT INTO interview_feedback (
          history_id, application_id, reviewer_employee_id, reviewer_name, reviewer_email, status
        ) VALUES (
          ${historyId}, ${applicationId}, ${emp.id}, ${name}, ${email},'pending'
        )
        ON CONFLICT (history_id, reviewer_employee_id) WHERE reviewer_employee_id IS NOT NULL DO NOTHING
      `;
    }
  }

  /** Update test report fields on an existing feedback row (by id). */
  async updateFeedbackTestReport(feedbackId: string, url: string, filename: string) {
    return this.sql`
      UPDATE interview_feedback
      SET test_report_url = ${url}, test_report_filename = ${filename}, updated_at = NOW()
      WHERE id = ${feedbackId}
      RETURNING *
    ` as Promise<any[]>;
  }

  /** Mark reminder_sent_at on all feedback rows for a history round. */
  async markFeedbackReminderSent(historyId: string) {
    return this.sql`
      UPDATE interview_feedback SET reminder_sent_at = NOW(), updated_at = NOW()
      WHERE history_id = ${historyId} AND status IN ('pending', 'draft')
      RETURNING reviewer_employee_id, reviewer_email, reviewer_name
    ` as Promise<any[]>;
  }

  async markFeedbackReminderSentByIds(feedbackIds: string[]) {
    if (!feedbackIds.length) return;
    await this.sql`
      UPDATE interview_feedback SET reminder_sent_at = NOW(), updated_at = NOW()
      WHERE id = ANY(${feedbackIds}) AND reminder_sent_at IS NULL
    `;
  }

  /** Pending feedback rows whose interview end time has passed (auto reminder cron). */
  async listInterviewFeedbackAutoReminderCandidates(limit = 40) {
    return this.sql`
      SELECT
        f.id AS feedback_id,
        f.history_id,
        f.application_id,
        f.reviewer_email,
        f.reviewer_name,
        a.job_id,
        c.first_name,
        c.last_name,
        j.title AS job_title
      FROM interview_feedback f
      INNER JOIN application_stage_history h ON h.id = f.history_id
      INNER JOIN applications a ON a.id = f.application_id
      INNER JOIN candidates c ON c.id = a.candidate_id
      LEFT JOIN job_postings j ON j.id = a.job_id
      WHERE f.status IN ('pending', 'draft')
        AND f.reminder_sent_at IS NULL
        AND f.reviewer_email IS NOT NULL
        AND trim(f.reviewer_email) <> ''
        AND h.cancelled_at IS NULL
        AND h.no_show_at IS NULL
        AND h.scheduled_at IS NOT NULL
        AND COALESCE(h.scheduled_at_end, h.scheduled_at + interval '1 hour') <= NOW()
        AND a.stage NOT IN ('rejected', 'hired')
      ORDER BY COALESCE(h.scheduled_at_end, h.scheduled_at + interval '1 hour') ASC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  /** Look up employee record by user_id. */
  async getEmployeeByUserId(userId: string) {
    const rows = await this.sql`
      SELECT e.* FROM employees e INNER JOIN users u ON u.employee_id = e.id WHERE u.id = ${userId} LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  /** Interviewer employee details for a stage-history row. */
  async getInterviewerDetailsByIds(ids: string[]) {
    if (!ids.length) return [] as any[];
    return this.sql`
      SELECT id, first_name, last_name, work_email, avatar FROM employees WHERE id = ANY(${ids})
    ` as Promise<any[]>;
  }

  // auditLog is inherited from BaseRepository

  async getApplicationAuditLog(applicationId: string) {
    return this.sql`
      SELECT
        r.id,
        r.entity_type,
        r.entity_id,
        r.action,
        r.metadata,
        r.created_at,
        COALESCE(e.first_name || ' ' || e.last_name, u.email) AS performed_by_name,
        u.email AS performed_by_email
      FROM recruitment_audit_log r
      LEFT JOIN users u ON u.id = r.performed_by
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE
        (r.entity_type = 'application' AND r.entity_id = ${applicationId})
        OR (r.entity_type = 'offer' AND r.entity_id IN (
          SELECT id FROM offers WHERE application_id = ${applicationId}
        ))
      ORDER BY r.created_at DESC
    ` as Promise<any[]>;
  }

  /** Cancel queued emails that were not sent yet (e.g. candidate moved out of Rejected). */
  async cancelPendingScheduledRecruitmentEmails(applicationId: string, eventKey: string) {
    await this.sql`
      UPDATE scheduled_recruitment_emails
      SET status = 'cancelled'
      WHERE application_id = ${applicationId} AND event_key = ${eventKey} AND status = 'pending'
    `;
  }

  async insertScheduledRecruitmentEmail(params: {
    applicationId: string;
    eventKey: string;
    recipientEmail: string;
    recipientName: string | null;
    context: Record<string, string | number | null | undefined>;
    sendAt: Date;
  }) {
    const ctxJson = JSON.stringify(params.context);
    await this.sql`
      INSERT INTO scheduled_recruitment_emails (application_id, event_key, recipient_email, recipient_name, context_json, send_at)
      VALUES (
        ${params.applicationId},
        ${params.eventKey},
        ${params.recipientEmail},
        ${params.recipientName},
        ${ctxJson}::jsonb,
        ${params.sendAt.toISOString()}
      )
    `;
  }

  async listDueScheduledRecruitmentEmails(limit: number) {
    return this.sql`
      SELECT id, event_key, recipient_email, recipient_name, context_json
      FROM scheduled_recruitment_emails
      WHERE status = 'pending' AND send_at <= NOW()
      ORDER BY send_at ASC
      LIMIT ${limit}
    `;
  }

  async markScheduledRecruitmentEmailSent(id: string) {
    await this.sql`
      UPDATE scheduled_recruitment_emails
      SET status = 'sent', sent_at = NOW()
      WHERE id = ${id}
    `;
  }

  async markScheduledRecruitmentEmailFailed(id: string, errorMessage: string) {
    await this.sql`
      UPDATE scheduled_recruitment_emails
      SET status = 'failed', error_message = ${errorMessage}
      WHERE id = ${id}
    `;
  }
}
