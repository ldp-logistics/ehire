import type { Request, Response, NextFunction } from "express";
import { neon } from "@neondatabase/serverless";
import { createInterviewMeeting, createMeetingAsUser } from "../../services/teamsGraph.js";
import { isTeamsIntegrationConfigured } from "../../config/teams.js";
import { AuthService } from "../auth/AuthService.js";
import { notifyEmail, resolvePublicAppUrlForTemplates, emailCtaButtonHtml } from "../../lib/emailNotifications.js";
import { emitRefreshAll } from "../../lib/notificationEvents.js";
import { buildMeetingTimeFields } from "../../lib/orgInterviewTime.js";
import { AppSettingsService } from "../settings/AppSettingsService.js";

export class TimezoneController {
  private readonly appSettings = new AppSettingsService();

  constructor() {
    const b = (c: any) => {
      for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c)))
        if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c);
    };
    b(this);
  }

  /** GET /api/timezone/employees — active employees with IANA timezone from branch (location). */
  async getEmployees(_req: Request, res: Response, next: NextFunction) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rows = await sql`
        SELECT
          e.id,
          e.first_name,
          e.last_name,
          e.job_title,
          e.department,
          e.work_email,
          e.avatar,
          e.location,
          b.time_zone AS time_zone
        FROM employees e
        LEFT JOIN branches b ON b.id = e.branch_id
        WHERE e.employment_status IN ('active', 'onboarding', 'on_leave')
        ORDER BY e.first_name, e.last_name
      `;
      res.json(rows);
    } catch (e) { next(e); }
  }

  /** GET /api/timezone/status — whether Teams integration is configured */
  async getStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ teamsConfigured: isTeamsIntegrationConfigured() });
    } catch (e) { next(e); }
  }

  /** GET /api/timezone/meetings — list scheduled meetings (newest first). Past meetings are deleted and excluded. */
  async getMeetings(_req: Request, res: Response, next: NextFunction) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const now = new Date().toISOString();
      await sql`DELETE FROM scheduled_meetings WHERE end_at < ${now}::timestamptz`;
      const rows = await sql`
        SELECT
          sm.id,
          sm.title,
          sm.start_at,
          sm.end_at,
          sm.join_url,
          sm.attendee_emails,
          sm.created_at,
          u.email AS creator_email
        FROM scheduled_meetings sm
        LEFT JOIN users u ON u.id = sm.created_by_user_id
        WHERE sm.end_at >= ${now}::timestamptz
        ORDER BY sm.start_at DESC
        LIMIT 100
      `;
      const withOrganizer = (rows as Record<string, unknown>[]).map((row) => {
        const { creator_email: creatorEmail, ...rest } = row;
        const raw = rest.attendee_emails;
        const list = Array.isArray(raw) ? [...(raw as string[])] : [];
        const creator = typeof creatorEmail === "string" ? creatorEmail.trim() : "";
        if (creator && !list.some((e) => String(e).trim().toLowerCase() === creator.toLowerCase())) {
          list.unshift(creator);
        }
        return { ...rest, attendee_emails: list };
      });
      return res.json(withOrganizer);
    } catch (e) { next(e); }
  }

  /** POST /api/timezone/meeting — schedule a Teams meeting with selected employees */
  async scheduleMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, start, end, attendeeIds, body } = req.body as {
        title?: string;
        start?: string;
        end?: string;
        attendeeIds?: string[];
        body?: string;
      };

      if (!title?.trim() || !start || !end || !Array.isArray(attendeeIds) || attendeeIds.length === 0) {
        return res.status(400).json({ error: "title, start, end, and attendeeIds are required" });
      }

      const sql = neon(process.env.DATABASE_URL!);
      const attendeeRows = await sql`
        SELECT work_email, first_name, last_name
        FROM employees
        WHERE id = ANY(${attendeeIds})
          AND work_email IS NOT NULL
          AND TRIM(work_email) != ''
      `;

      const rows = attendeeRows as { work_email: string; first_name: string | null; last_name: string | null }[];
      const emails = rows.map((r) => r.work_email).filter(Boolean);
      if (!emails.length) {
        return res.status(400).json({ error: "No valid attendee work emails found" });
      }

      const organizerEmail = req.user?.email?.trim() || "";
      const organizerLower = organizerEmail.toLowerCase();
      const attendeeEmailsForDb =
        organizerEmail && !emails.some((e) => e.trim().toLowerCase() === organizerLower)
          ? [organizerEmail, ...emails]
          : [...emails];

      const params = {
        subject: title.trim(),
        start,
        end,
        interviewerEmails: emails,
        body: body?.trim() || null,
      };

      const authService = new AuthService();
      const userToken = await authService.getValidMicrosoftAccessToken(req.user!.id);
      const result = userToken
        ? await createMeetingAsUser(userToken, params)
        : await createInterviewMeeting(params);

      if (result.success) {
        const userId = req.user?.id ?? null;
        const emailsJson = JSON.stringify(attendeeEmailsForDb);
        try {
          await sql`
            INSERT INTO scheduled_meetings (title, start_at, end_at, join_url, attendee_emails, created_by_user_id)
            VALUES (
              ${title.trim()},
              ${start},
              ${end},
              ${result.joinUrl ?? null},
              (SELECT array_agg(elem) FROM jsonb_array_elements_text(${emailsJson}::jsonb) AS elem),
              ${userId}
            )
          `;
        } catch (insertErr) {
          console.error("[timezone] Failed to save meeting to DB:", insertErr);
          // Still return success so user sees Teams link; meeting just won't appear in list
        }

        const appBase = resolvePublicAppUrlForTemplates().replace(/\/$/, "") || "";
        const joinUrl = result.joinUrl?.trim();
        const meetingLink = joinUrl
          ? emailCtaButtonHtml(joinUrl, "Join Microsoft Teams", { backgroundColor: "#5059c9" })
          : emailCtaButtonHtml(`${appBase}/timezones`, "Open meeting details", { backgroundColor: "#7c3aed" });
        const startD = new Date(start);
        const orgTz = await this.appSettings.getEffectiveOrgIanaTimezone();
        const meetingFields = buildMeetingTimeFields(startD, orgTz);

        const doerRows = await sql`
          SELECT e.first_name, e.last_name, u.email
          FROM users u
          LEFT JOIN employees e ON e.id = u.employee_id
          WHERE u.id = ${req.user!.id}
          LIMIT 1
        `;
        const doerRow = (doerRows as { first_name: string | null; last_name: string | null; email: string }[])[0];
        const doerName =
          [doerRow?.first_name, doerRow?.last_name].filter(Boolean).join(" ").trim() || doerRow?.email || "A colleague";

        const orgLower = organizerEmail.toLowerCase();
        const emailRecipients = rows
          .map((r) => ({
            email: r.work_email.trim(),
            name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || undefined,
          }))
          .filter((r) => !organizerEmail || r.email.toLowerCase() !== orgLower);

        if (emailRecipients.length > 0) {
          void notifyEmail(
            "company.meeting.scheduled",
            {
              meeting_title: title.trim(),
              doer_name: doerName,
              meeting_link: meetingLink,
              ...meetingFields,
            },
            emailRecipients,
          ).catch((err) => console.error("[timezone] Attendee notify email:", err));
        }
        emitRefreshAll();
      }

      return res.json(result);
    } catch (e) {
      next(e);
    }
  }
}
