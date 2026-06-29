import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";
import QRCode from "qrcode";

export class AssetRepository extends BaseRepository {
  // ── Audit ────────────────────────────────────────────────────────────────────
  async logAudit(entityType: string, entityId: string, action: string, changes: any, userId?: string, userEmail?: string) {
    try { await this.sql`INSERT INTO asset_audit_log(entity_type,entity_id,action,changes,user_id,user_email) VALUES(${entityType},${entityId},${action},${JSON.stringify(changes)},${userId||null},${userEmail||null})`; } catch {}
  }

  // ── Public view ──────────────────────────────────────────────────────────────
  async getPublicStock(assetId: string) { const r = await this.sql`SELECT id,asset_id,name,category,product_type,quantity,available,description,specs FROM stock_items WHERE asset_id=${assetId} LIMIT 1` as any[]; return r[0]??null; }
  async getPublicAssigned(assetId: string) { const r = await this.sql`SELECT a.id,a.asset_id,a.user_id,a.user_name,a.user_email,a.ram,a.storage,a.processor,a.generation,a.notes,s.name as stock_name,s.category as stock_category,s.product_type as stock_product_type,s.specs as stock_specs,e.department as employee_department,e.location as emp_location,e.city as emp_city,e.comm_city as emp_comm_city FROM assigned_systems a LEFT JOIN stock_items s ON s.id=a.stock_item_id LEFT JOIN employees e ON(e.id=a.user_id)OR(a.user_email IS NOT NULL AND LOWER(TRIM(e.work_email))=LOWER(TRIM(a.user_email))) WHERE a.asset_id=${assetId} LIMIT 1` as any[]; return r[0]??null; }
  async getEmployeeForAsset(userId?: string, email?: string) { if (userId) { const r = await this.sql`SELECT department,location,city,comm_city FROM employees WHERE id=${userId} LIMIT 1` as any[]; if (r[0]) return r[0]; } if (email) { const r = await this.sql`SELECT department,location,city,comm_city FROM employees WHERE LOWER(TRIM(work_email))=LOWER(TRIM(${email})) LIMIT 1` as any[]; if (r[0]) return r[0]; } return null; }

  // ── Stock ────────────────────────────────────────────────────────────────────
  async nextStockAssetId() { const r = await this.sql`SELECT asset_id FROM stock_items WHERE asset_id IS NOT NULL AND asset_id~'^STOCK-[0-9]+$' ORDER BY LENGTH(asset_id) DESC,asset_id DESC LIMIT 1` as any[]; const n = r[0]?.asset_id?parseInt(r[0].asset_id.replace("STOCK-",""),10)+1:1; return `STOCK-${String(n).padStart(5,"0")}`; }
  async listStock(limit: number, offset: number, regions?: string[] | null) {
    if (regions == null || regions.length === 0) return [];
    return this.sql(
      `SELECT s.*,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', a.id, 'asset_id', a.asset_id, 'user_id', a.user_id,
          'user_name', a.user_name, 'user_email', a.user_email,
          'employee_id', e.employee_id, 'first_name', e.first_name,
          'last_name', e.last_name, 'nickname', e.nickname
        )), '[]'::jsonb)
         FROM assigned_systems a
         LEFT JOIN employees e ON e.id = a.user_id
         WHERE a.stock_item_id = s.id OR a.asset_id = s.id OR a.asset_id LIKE s.id || '-%'
        ) AS assignments
       FROM stock_items s
       WHERE s.region_code = ANY($1)
       ORDER BY s.name
       LIMIT $2 OFFSET $3`,
      [regions, limit, offset],
    ) as Promise<any[]>;
  }
  async getStockById(id: string) { const r = await this.sql`SELECT * FROM stock_items WHERE id=${id}` as any[]; return r[0]??null; }
  async getStockAssetId(id: string) { const r = await this.sql`SELECT asset_id FROM stock_items WHERE id=${id}` as any[]; return r[0]??null; }
  async createStock(d: any) {
    const r = await this.sql`
      INSERT INTO stock_items(asset_id, name, category, product_type, quantity, available, description, location, specs, region_code)
      VALUES (
        ${d.assetId}, ${d.name}, ${d.category || "Other"}, ${d.productType || null},
        ${d.quantity || 0}, ${d.available || 0}, ${d.description || null},
        ${d.location || "IT Storage"}, ${d.specs ? JSON.stringify(d.specs) : null}, ${d.regionCode}
      ) RETURNING *
    ` as any[];
    return r[0];
  }
  async updateStock(id: string, d: any) { const r = await this.sql`UPDATE stock_items SET name=COALESCE(${d.name??null},name),category=COALESCE(${d.category??null},category),product_type=COALESCE(${d.productType??null},product_type),quantity=COALESCE(${d.quantity??null},quantity),available=COALESCE(${d.available??null},available),description=COALESCE(${d.description??null},description),location=COALESCE(${d.location??null},location),specs=COALESCE(${d.specs?JSON.stringify(d.specs):null},specs),updated_at=NOW() WHERE id=${id} RETURNING *` as any[]; return r[0]??null; }
  async deleteStock(id: string) { const r = await this.sql`SELECT * FROM stock_items WHERE id=${id}` as any[]; if (!r[0]) return null; await this.sql`DELETE FROM stock_items WHERE id=${id}`; return r[0]; }

  // ── Assigned Systems ────────────────────────────────────────────────────────
  async nextAssignedAssetId() { const year = new Date().getFullYear(); const prefix = `AST-${year}-`; const r = await this.sql`SELECT asset_id FROM assigned_systems WHERE asset_id LIKE ${prefix+"%"} ORDER BY asset_id DESC LIMIT 1` as any[]; const last = r[0]?.asset_id; const num = last?parseInt(last.slice(prefix.length),10)+1:1; return `${prefix}${String(num).padStart(5,"0")}`; }
  async listSystems(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const params: unknown[] = [];
    const conds: string[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", conds, params);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return this.sql(
      `SELECT a.id,a.asset_id,a.stock_item_id,a.user_id,a.user_name,a.user_email,a.ram,a.storage,a.processor,a.generation,a.notes,a.created_at,e.employee_id,e.first_name,e.last_name,e.nickname,e.department,COALESCE((SELECT s.name FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.name FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_name,COALESCE((SELECT s.category FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.category FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_category FROM assigned_systems a LEFT JOIN employees e ON e.id=a.user_id LEFT JOIN branches b ON b.id=e.branch_id ${where} ORDER BY a.user_name`,
      params,
    ) as unknown as Promise<any[]>;
  }
  async getSystemsByUser(userId: string) { return this.sql`SELECT a.*,e.employee_id,e.first_name,e.last_name,e.nickname,COALESCE((SELECT s.name FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.name FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_name,COALESCE((SELECT s.category FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.category FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_category FROM assigned_systems a LEFT JOIN employees e ON e.id=a.user_id WHERE a.user_id=${userId} ORDER BY a.created_at DESC` as Promise<any[]>; }
  async getMySystemsByEmail(email: string) { return this.sql`SELECT a.*,COALESCE((SELECT s.name FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.name FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_name,COALESCE((SELECT s.category FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.category FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_category FROM assigned_systems a WHERE a.user_email=${email} ORDER BY a.created_at DESC` as Promise<any[]>; }
  async getSystemById(id: string) { const r = await this.sql`SELECT a.*,e.employee_id,e.first_name,e.last_name,e.nickname,e.department,COALESCE((SELECT s.name FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.name FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_name,COALESCE((SELECT s.category FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.category FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_category FROM assigned_systems a LEFT JOIN employees e ON e.id=a.user_id WHERE a.id=${id}` as any[]; return r[0]??null; }
  async getSystemAssetId(id: string) { let r = await this.sql`SELECT asset_id FROM assigned_systems WHERE id=${id}` as any[]; if (!r[0]) r = await this.sql`SELECT asset_id FROM assigned_systems WHERE asset_id=${id}` as any[]; return r[0]??null; }
  async getMySystemsByEmployeeId(employeeId: string) { return this.sql`SELECT a.*,COALESCE((SELECT s.name FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.name FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_name,COALESCE((SELECT s.category FROM stock_items s WHERE s.id=a.stock_item_id),(SELECT s.category FROM stock_items s WHERE s.id=a.asset_id OR a.asset_id LIKE s.id||'-%' LIMIT 1)) as asset_category FROM assigned_systems a WHERE a.user_id=${employeeId} ORDER BY a.created_at DESC` as Promise<any[]>; }
  async createSystem(d: any) { const r = await this.sql`INSERT INTO assigned_systems(asset_id,stock_item_id,user_id,user_name,user_email,ram,storage,processor,generation,notes) VALUES(${d.assetId},${d.stockItemId||null},${d.userId||null},${d.userName},${d.userEmail||null},${d.ram||null},${d.storage||null},${d.processor||null},${d.generation||null},${d.notes||null}) RETURNING *` as any[]; return r[0]; }
  async updateSystem(id: string, d: any) { const r = await this.sql`UPDATE assigned_systems SET asset_id=COALESCE(${d.assetId??null},asset_id),user_id=COALESCE(${d.userId??null},user_id),user_name=COALESCE(${d.userName??null},user_name),user_email=COALESCE(${d.userEmail??null},user_email),ram=COALESCE(${d.ram??null},ram),storage=COALESCE(${d.storage??null},storage),processor=COALESCE(${d.processor??null},processor),generation=COALESCE(${d.generation??null},generation),notes=COALESCE(${d.notes??null},notes),updated_at=NOW() WHERE id=${id} RETURNING *` as any[]; return r[0]??null; }

  /** Increment stock.available when an assignment row is removed (mirrors assign-from-stock decrement). */
  private async incrementStockForReturnedAssignment(row: { stock_item_id?: string | null; asset_id?: string | null }) {
    if (row.stock_item_id) {
      await this.sql`UPDATE stock_items SET available=available+1,updated_at=NOW() WHERE id=${row.stock_item_id}`;
      return;
    }
    const assetId = row.asset_id;
    if (!assetId) return;
    const st = await this.sql`SELECT id FROM stock_items WHERE id=${assetId} OR ${assetId} LIKE id||'-%' LIMIT 1` as any[];
    if (st[0]) await this.sql`UPDATE stock_items SET available=available+1,updated_at=NOW() WHERE id=${st[0].id}`;
  }

  /** Remove assignment and return unit to stock inventory. */
  async returnAssignmentToStock(assignmentId: string) {
    const r = await this.sql`SELECT * FROM assigned_systems WHERE id=${assignmentId}` as any[];
    if (!r[0]) return null;
    const row = r[0];
    await this.sql`DELETE FROM assigned_systems WHERE id=${assignmentId}`;
    await this.incrementStockForReturnedAssignment(row);
    return row;
  }

  /** All assignments for an employee (by user_id and optionally work email). */
  async listAssignmentIdsForEmployee(employeeId: string, workEmail?: string | null) {
    const byUser = await this.sql`SELECT id FROM assigned_systems WHERE user_id=${employeeId}` as { id: string }[];
    const ids = new Set(byUser.map((r) => r.id));
    const email = (workEmail ?? "").trim();
    if (email) {
      const byEmail = await this.sql`SELECT id FROM assigned_systems WHERE user_email IS NOT NULL AND LOWER(TRIM(user_email))=LOWER(TRIM(${email}))` as { id: string }[];
      for (const r of byEmail) ids.add(r.id);
    }
    return [...ids];
  }

  async returnAllAssignmentsToStockForEmployee(employeeId: string, workEmail?: string | null) {
    const ids = await this.listAssignmentIdsForEmployee(employeeId, workEmail);
    const released: any[] = [];
    for (const id of ids) {
      const row = await this.returnAssignmentToStock(id);
      if (row) released.push(row);
    }
    return released;
  }

  /** Legacy rows unlinked via offboarding task (user_id cleared) but not returned to stock. */
  async listAssignmentIdsLinkedToOffboarding(offboardingId: string) {
    const rows = await this.sql`
      SELECT DISTINCT a.id
      FROM assigned_systems a
      INNER JOIN offboarding_tasks t ON t.related_asset_id = a.id
      WHERE t.offboarding_id = ${offboardingId} AND t.task_type = 'asset_return'
    ` as { id: string }[];
    return rows.map((r) => r.id);
  }

  async deleteSystem(id: string) {
    return this.returnAssignmentToStock(id);
  }
  async getStockForAssign(stockItemId: string) { const r = await this.sql`SELECT * FROM stock_items WHERE id=${stockItemId}` as any[]; return r[0]??null; }
  async hasStockAssignment(employeeId: string, stockItemId: string) {
    const r = await this.sql`SELECT 1 FROM assigned_systems WHERE user_id=${employeeId} AND stock_item_id=${stockItemId} LIMIT 1` as { "?column?": number }[];
    return r.length > 0;
  }
  async getEmployeeForAssign(employeeId: string) { const r = await this.sql`SELECT id,first_name,last_name,nickname,work_email,employee_id FROM employees WHERE id=${employeeId}` as any[]; return r[0]??null; }
  async assignFromStock(d: any) { const r = await this.sql`INSERT INTO assigned_systems(asset_id,stock_item_id,user_id,user_name,user_email,ram,storage,processor,generation) VALUES(${d.assetId},${d.stockItemId},${d.userId},${d.userName},${d.userEmail||null},${d.ram||null},${d.storage||null},${d.processor||null},${d.generation||null}) RETURNING *` as any[]; await this.sql`UPDATE stock_items SET available=available-1,updated_at=NOW() WHERE id=${d.stockItemId}`; return r[0]; }

  // ── Tickets (global — IT support queue spans all regions) ───────────────────
  async listTickets(isAdminHR: boolean, employeeId?: string|null) {
    if (!isAdminHR) {
      return this.sql`SELECT * FROM support_tickets WHERE created_by_id=${employeeId||"__none__"} ORDER BY created_at DESC` as Promise<any[]>;
    }
    return this.sql`SELECT * FROM support_tickets ORDER BY CASE priority WHEN'critical'THEN 1 WHEN'high'THEN 2 WHEN'medium'THEN 3 WHEN'low'THEN 4 END,created_at DESC` as Promise<any[]>;
  }
  async getTicketById(id: string) { const r = await this.sql`SELECT * FROM support_tickets WHERE id=${id}` as any[]; return r[0]??null; }
  async createTicket(d: any) {
    const status = d.status || "open";
    const resolvedAt = status === "resolved" || status === "closed" ? new Date() : null;
    const r = await this.sql`
      INSERT INTO support_tickets(
        ticket_number, asset_id, asset_name, title, description, priority, status,
        created_by_id, created_by_name, created_by_email, created_by_department,
        assigned_to_id, assigned_to_name, attachment_url, attachment_name, resolved_at
      ) VALUES (
        ${d.ticketNumber}, ${d.assetId || null}, ${d.assetName || null}, ${d.title}, ${d.description},
        ${d.priority || "medium"}, ${status}, ${d.createdById || null}, ${d.createdByName},
        ${d.createdByEmail || null}, ${d.createdByDepartment || null}, ${d.assignedToId || null},
        ${d.assignedToName || null}, ${d.attachmentUrl || null}, ${d.attachmentName || null}, ${resolvedAt}
      ) RETURNING *
    ` as any[];
    return r[0];
  }
  async updateTicket(id: string, d: any, adminHR: boolean) {
    if (!adminHR) { const r = await this.sql`UPDATE support_tickets SET description=COALESCE(${d.description||null},description),updated_at=NOW() WHERE id=${id} RETURNING *` as any[]; return r[0]??null; }
    const assignProvided = Object.prototype.hasOwnProperty.call(d, "assignedToId");
    const assignId = assignProvided ? (d.assignedToId ?? null) : undefined;
    const assignName = assignProvided ? (d.assignedToName ?? null) : undefined;
    const r = assignProvided
      ? await this.sql`UPDATE support_tickets SET asset_id=COALESCE(${d.assetId||null},asset_id),asset_name=COALESCE(${d.assetName||null},asset_name),title=COALESCE(${d.title||null},title),description=COALESCE(${d.description||null},description),priority=COALESCE(${d.priority||null},priority),status=COALESCE(${d.status||null},status),assigned_to_id=${assignId},assigned_to_name=${assignName},resolution=COALESCE(${d.resolution||null},resolution),resolved_at=${d.status==="resolved"||d.status==="closed"?new Date():null},updated_at=NOW() WHERE id=${id} RETURNING *` as any[]
      : await this.sql`UPDATE support_tickets SET asset_id=COALESCE(${d.assetId||null},asset_id),asset_name=COALESCE(${d.assetName||null},asset_name),title=COALESCE(${d.title||null},title),description=COALESCE(${d.description||null},description),priority=COALESCE(${d.priority||null},priority),status=COALESCE(${d.status||null},status),assigned_to_id=COALESCE(${d.assignedToId||null},assigned_to_id),assigned_to_name=COALESCE(${d.assignedToName||null},assigned_to_name),resolution=COALESCE(${d.resolution||null},resolution),resolved_at=${d.status==="resolved"||d.status==="closed"?new Date():null},updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0]??null;
  }
  async getUserEmailForEmployee(employeeId: string) {
    try {
      const r = await this.sql`
        SELECT u.email, COALESCE(NULLIF(TRIM(e.first_name || ' ' || e.last_name), ''), u.email) AS name
        FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE u.employee_id = ${employeeId} AND u.is_active = true
          AND u.email IS NOT NULL AND u.email <> ''
        ORDER BY u.updated_at DESC
        LIMIT 1
      ` as { email: string; name: string }[];
      return r[0] ?? null;
    } catch {
      return null;
    }
  }
  async listItAssigneeCandidates() {
    const tag = JSON.stringify(["it"]);
    try {
      return this.sql`
        SELECT DISTINCT e.id, e.first_name, e.last_name, e.nickname, e.work_email, e.job_title
        FROM users u
        INNER JOIN employees e ON e.id = u.employee_id
        WHERE u.is_active = true AND u.employee_id IS NOT NULL
          AND (u.role::text = 'it' OR u.roles::jsonb @> ${tag}::jsonb)
        ORDER BY e.first_name, e.last_name
      ` as Promise<any[]>;
    } catch (e: any) {
      if (e?.code === "42703") {
        return this.sql`
          SELECT DISTINCT e.id, e.first_name, e.last_name, e.nickname, e.work_email, e.job_title
          FROM users u
          INNER JOIN employees e ON e.id = u.employee_id
          WHERE u.is_active = true AND u.employee_id IS NOT NULL AND u.role::text = 'it'
          ORDER BY e.first_name, e.last_name
        ` as Promise<any[]>;
      }
      throw e;
    }
  }
  async deleteTicket(id: string) { const r = await this.sql`SELECT * FROM support_tickets WHERE id=${id}` as any[]; if (!r[0]) return null; await this.sql`DELETE FROM support_tickets WHERE id=${id}`; return r[0]; }
  async getTicketComments(ticketId: string) { return this.sql`SELECT * FROM ticket_comments WHERE ticket_id=${ticketId} ORDER BY created_at ASC` as Promise<any[]>; }
  async addComment(d: any) { const isStatusUpdate = d.isStatusUpdate === true || d.isStatusUpdate === "true"; const r = await this.sql`INSERT INTO ticket_comments(ticket_id,message,author_id,author_name,author_email,author_role,is_status_update,old_status,new_status) VALUES(${d.ticketId},${d.message},${d.authorId||null},${d.authorName},${d.authorEmail||null},${d.authorRole||"employee"},${isStatusUpdate},${d.oldStatus||null},${d.newStatus||null}) RETURNING *` as any[]; await this.sql`UPDATE support_tickets SET updated_at=NOW() WHERE id=${d.ticketId}`; return r[0]; }
  async getEmployeeName(employeeId: string) { const r = await this.sql`SELECT first_name,last_name,department FROM employees WHERE id=${employeeId}` as any[]; return r[0]??null; }
  async getEmployeeForTicket(employeeId: string) {
    const r = await this.sql`
      SELECT id, first_name, last_name, department, work_email
      FROM employees WHERE id = ${employeeId}
    ` as any[];
    return r[0] ?? null;
  }
  async updateTicketStatus(ticketId: string, status: string, authorName: string, authorEmail: string|undefined, authorEmployeeId: string|undefined, comment?: string) {
    const ticket = await this.getTicketById(ticketId); if (!ticket) return null;
    const oldStatus = ticket.status;
    const statusLabels: Record<string,string> = { open:"Open",in_progress:"In Progress",resolved:"Resolved",closed:"Closed" };
    const r = await this.sql`UPDATE support_tickets SET status=${status},resolved_at=${status==="resolved"||status==="closed"?new Date():null},updated_at=NOW() WHERE id=${ticketId} RETURNING *` as any[];
    const msg = comment||`Status changed from ${statusLabels[oldStatus]||oldStatus} to ${statusLabels[status]||status}`;
    await this.addComment({ ticketId, message:msg, authorId:authorEmployeeId, authorName, authorEmail, authorRole:"it_support", isStatusUpdate: true, oldStatus, newStatus:status });
    return r[0];
  }

  // ── Audit Log ────────────────────────────────────────────────────────────────
  async getAuditLog(entityType?: string, entityId?: string, limit=100, offset=0) {
    if (entityType && entityId) return this.sql`SELECT * FROM asset_audit_log WHERE entity_type=${entityType} AND entity_id=${entityId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}` as Promise<any[]>;
    if (entityType) return this.sql`SELECT * FROM asset_audit_log WHERE entity_type=${entityType} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}` as Promise<any[]>;
    return this.sql`SELECT * FROM asset_audit_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}` as Promise<any[]>;
  }

  /** Assignments returned to stock (unassign / offboarding / delete). */
  async getRecentReturns(limit: number) {
    return this.sql`
      SELECT id, entity_id, action, changes, user_email, created_at
      FROM asset_audit_log
      WHERE entity_type = 'system' AND action IN ('return_to_stock', 'delete')
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  async getStockNamesByIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [] as { id: string; name: string }[];
    return this.sql`SELECT id, name FROM stock_items WHERE id = ANY(${unique})` as unknown as Promise<{ id: string; name: string }[]>;
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────
  async listInvoices(limit: number, offset: number) { return this.sql`SELECT * FROM invoices ORDER BY purchase_date DESC,created_at DESC LIMIT ${limit} OFFSET ${offset}` as Promise<any[]>; }
  async getInvoiceById(id: string) { const r = await this.sql`SELECT * FROM invoices WHERE id=${id}` as any[]; return r[0]??null; }
  async getInvoiceFile(id: string) { const r = await this.sql`SELECT file_path,file_name,file_type FROM invoices WHERE id=${id}` as any[]; return r[0]??null; }
  async createInvoice(d: any) { const r = await this.sql`INSERT INTO invoices(invoice_number,vendor,purchase_date,total_amount,items,file_name,file_type,file_path,status,notes) VALUES(${d.invoiceNumber},${d.vendor},${d.purchaseDate instanceof Date?d.purchaseDate.toISOString():d.purchaseDate},${String(d.totalAmount??0)},${d.items},${d.fileName??null},${d.fileType??null},${d.filePath??null},${d.status||"pending"},${d.notes??null}) RETURNING *` as any[]; return r[0]; }
  async updateInvoice(id: string, d: any) {
    const ex = await this.getInvoiceById(id); if (!ex) return null;
    const filePathSent = "file_path" in d||"filePath" in d; const filePathVal = filePathSent?(d.file_path??d.filePath):ex.file_path;
    const clearFile = filePathSent&&filePathVal==null; const fileNameVal=clearFile?null:(d.file_name??d.fileName??ex.file_name); const fileTypeVal=clearFile?null:(d.file_type??d.fileType??ex.file_type);
    const rawDate=d.purchase_date??d.purchaseDate; const dateVal=rawDate==null?null:typeof rawDate==="string"?rawDate:(rawDate as Date).toISOString?.()??null;
    const rawAmt=d.total_amount??d.totalAmount; const amtVal=rawAmt!=null?String(rawAmt):null;
    const r = await this.sql`UPDATE invoices SET invoice_number=COALESCE(${d.invoice_number??d.invoiceNumber??null},invoice_number),vendor=COALESCE(${d.vendor??null},vendor),purchase_date=COALESCE(${dateVal},purchase_date),total_amount=COALESCE(${amtVal},total_amount),items=COALESCE(${d.items??null},items),file_name=${fileNameVal},file_type=${fileTypeVal},file_path=${filePathVal},status=COALESCE(${d.status??null},status),notes=COALESCE(${d.notes??null},notes),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return r[0]??null;
  }
  async deleteInvoice(id: string) { const r = await this.sql`SELECT * FROM invoices WHERE id=${id}` as any[]; if (!r[0]) return null; await this.sql`DELETE FROM invoices WHERE id=${id}`; return r[0]; }

  // ── Stats ────────────────────────────────────────────────────────────────────
  async getStats(systemRegions?: string[] | null, stockRegions?: string[] | null) {
    const emptyStock = { total_items: 0, total_quantity: 0, total_available: 0, out_of_stock: 0 };
    const stockStatsPromise =
      stockRegions != null && stockRegions.length > 0
        ? this.sql(
            `SELECT COUNT(*)::int AS total_items,
                    SUM(quantity)::int AS total_quantity,
                    SUM(available)::int AS total_available,
                    COUNT(*) FILTER (WHERE available = 0)::int AS out_of_stock
             FROM stock_items WHERE region_code = ANY($1)`,
            [stockRegions],
          ) as unknown as Promise<any[]>
        : Promise.resolve([emptyStock]);

    const ticketStatsPromise = this.sql`SELECT COUNT(*)::int as total_tickets,COUNT(*)FILTER(WHERE status='open')::int as open,COUNT(*)FILTER(WHERE status='in_progress')::int as in_progress,COUNT(*)FILTER(WHERE status='resolved'OR status='closed')::int as resolved,COUNT(*)FILTER(WHERE priority='critical'AND status='open')::int as critical_open FROM support_tickets` as Promise<any[]>;

    if (systemRegions != null && systemRegions.length === 0) {
      const [stockStats, ticketStats] = await Promise.all([stockStatsPromise, ticketStatsPromise]);
      return {
        stock: stockStats[0],
        systems: { total_systems: 0 },
        tickets: ticketStats[0],
      };
    }

    const sysParams: unknown[] = [];
    const sysConds: string[] = [];
    appendEffectiveRegionFilter(systemRegions, "e", "b", sysConds, sysParams);
    const sysWhere = sysConds.length ? `WHERE ${sysConds.join(" AND ")}` : "";

    const [stockStats, systemStats, ticketStats] = await Promise.all([
      stockStatsPromise,
      this.sql(
        `SELECT COUNT(*)::int as total_systems FROM assigned_systems a LEFT JOIN employees e ON e.id=a.user_id LEFT JOIN branches b ON b.id=e.branch_id ${sysWhere}`,
        sysParams,
      ) as unknown as Promise<any[]>,
      ticketStatsPromise,
    ]);
    return { stock: stockStats[0], systems: systemStats[0], tickets: ticketStats[0] };
  }

  async generateQR(url: string, size: number) {
    return QRCode.toBuffer(url, { type: "png", width: size, margin: 2 });
  }
}
