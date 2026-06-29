import type { Request, Response, NextFunction } from "express";
import { neon } from "@neondatabase/serverless";
import { NotificationService } from "./NotificationService.js";
import { getRequestBranchDisplay } from "../../lib/timezone.js";
import { notificationEmitter, REFRESH_EVENT } from "../../lib/notificationEvents.js";
import { isTransientDbError } from "../../lib/dbConnectivity.js";
import { regionCtxFromRequest } from "../../lib/moduleRegionCtx.js";

const sql = neon(process.env.DATABASE_URL!);

export class NotificationController {
  private readonly service = new NotificationService();
  constructor() {
    this.list = this.list.bind(this);
    this.stream = this.stream.bind(this);
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { timeZone: userTz, dateFormat: userDateFormat } = await getRequestBranchDisplay(req, sql);
      const result = await this.service.getNotifications(
        {
          id: req.user!.id,
          role: req.user!.role,
          employeeId: req.user!.employeeId,
          email: req.user!.email,
          roles: req.user!.roles,
        },
        userTz,
        userDateFormat,
        regionCtxFromRequest(req),
      );
      res.status(200).json(result);
    } catch (err) {
      if (isTransientDbError(err)) {
        console.warn("[notifications] list: DB unreachable — returning empty notifications", err);
        res.status(200).json({
          notifications: [],
          role: String(req.user?.role ?? "").toLowerCase(),
        });
        return;
      }
      next(err);
    }
  }

  /** Server-Sent Events stream — pushes refresh signals to the client in real time. */
  async stream(req: Request, res: Response): Promise<void> {
    // Override headers set by the global no-cache middleware
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx/proxy buffering
    res.flushHeaders();

    const write = (event: string, data: unknown) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
    };

    // Let the client know the stream is open
    write("connected", { status: "ok" });

    // Keep connection alive with a heartbeat every 25 seconds
    const heartbeat = setInterval(() => write("heartbeat", { ts: Date.now() }), 25_000);

    // Forward server-emitted refresh signals to this SSE client
    const onRefresh = () => write("refresh", { ts: Date.now() });
    notificationEmitter.on(REFRESH_EVENT, onRefresh);

    req.on("close", () => {
      clearInterval(heartbeat);
      notificationEmitter.off(REFRESH_EVENT, onRefresh);
    });
  }
}
