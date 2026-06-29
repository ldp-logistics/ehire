import type { Request, Response, NextFunction } from "express";
import { AuditService } from "./AuditService.js";
function escapeCsvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export class AuditController {
  private readonly svc = new AuditService();
  constructor() {
    const b = (c: any) => {
      for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c)))
        if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c);
    };
    b(this);
  }

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.svc.list(req.query as Record<string, unknown>));
    } catch (e) {
      next(e);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await this.svc.exportRows(req.query as Record<string, unknown>);
      const header = [
        "created_at",
        "action",
        "entity_type",
        "entity_id",
        "performed_by",
        "performer_email",
        "ip_address",
        "user_agent",
        "details_json",
      ];
      const lines = [header.join(",")];
      for (const r of rows) {
        const d =
          r.details == null
            ? ""
            : typeof r.details === "string"
              ? r.details
              : JSON.stringify(r.details);
        lines.push(
          [
            escapeCsvCell(String(r.created_at ?? "")),
            escapeCsvCell(r.action ?? ""),
            escapeCsvCell(r.entity_type ?? ""),
            escapeCsvCell(r.entity_id ?? ""),
            escapeCsvCell(r.performed_by ?? ""),
            escapeCsvCell(r.performer_email ?? ""),
            escapeCsvCell(r.ip_address ?? ""),
            escapeCsvCell((r.user_agent ?? "").slice(0, 500)),
            escapeCsvCell(d),
          ].join(","),
        );
      }
      const body = lines.join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="audit-logs.csv"');
      res.send(body);
    } catch (e) {
      next(e);
    }
  };
}
