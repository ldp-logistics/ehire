import { type Server } from "node:http";

import express, { type Express, type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

// Behind Cloudflare Tunnel / nginx: they send X-Forwarded-For. express-rate-limit v7+ errors if
// trust proxy is false. Set TRUST_PROXY=false only for raw local hits with no reverse proxy.
if (process.env.TRUST_PROXY !== "false") {
  app.set("trust proxy", 1);
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Cookie parser middleware (must be before routes)
app.use(cookieParser());

app.use(express.json({
  limit: '10mb', // Increased limit for avatar uploads
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Performance logger — warns on slow API endpoints (>300ms)
import { perfLogger } from "./lib/perf";
app.use(perfLogger);

// Disable HTTP caching for API routes so clients always get fresh data
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // In production, omit response bodies from logs to reduce PII / token leakage
      if (process.env.NODE_ENV !== "production" && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  // Global error handler — must be registered AFTER all routes.
  // AppError subclasses (NotFoundError, ConflictError, etc.) are handled here.
  // Legacy route files that call res.status(x).json() directly are unaffected.
  const { errorHandler } = await import("./core/middleware/errorHandler.js");
  app.use(errorHandler);

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST ?? (process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0');
  const listenOptions: { port: number; host: string; reusePort?: boolean } = { port, host };
  if (process.platform !== 'win32') listenOptions.reusePort = true;
  server.listen(listenOptions, async () => {
    log(`serving on ${host}:${port}`);
    const { startLeaveAccrualCron } = await import("./lib/leaveAccrualCron.js");
    startLeaveAccrualCron();
    const { startMissingCheckInHrAlertCron } = await import("./lib/missingCheckInAlertCron.js");
    startMissingCheckInHrAlertCron();
    const { startScheduledRecruitmentEmailCron, processDueScheduledRecruitmentEmails } = await import(
      "./lib/scheduledRecruitmentEmailCron.js"
    );
    startScheduledRecruitmentEmailCron();
    processDueScheduledRecruitmentEmails().catch(() => {});
    const { startInterviewFeedbackReminderCron, processAutoInterviewFeedbackReminders } = await import(
      "./lib/interviewFeedbackReminderCron.js"
    );
    startInterviewFeedbackReminderCron();
    processAutoInterviewFeedbackReminders().catch(() => {});
    // Startup backfill: run accrual once on every server start.
    // The "YYYY-MM" gate in leave_accrual_run makes this idempotent —
    // if this month already ran (cron or previous deploy), both engines return 0 immediately.
    // This ensures no month is ever missed due to a missed cron tick or a mid-month deploy.
    try {
      const { LeaveService } = await import("./modules/leave/LeaveService.js");
      const r = await new LeaveService().runAccrual();
      log(`[startup-accrual] ok earnedLeaveAccrued=${r.earnedLeaveAccrued} accruedCount=${r.accruedCount}`);
    } catch (e) {
      log(`[startup-accrual] failed: ${(e as Error)?.message}`);
    }
  });
}
