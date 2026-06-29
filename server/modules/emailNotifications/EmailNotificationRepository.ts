import { BaseRepository } from "../../core/base/BaseRepository.js";

export interface SettingRow {
  event_key: string;
  enabled: boolean;
  subject_template: string;
  body_template: string;
  updated_at: string;
}

export interface LogRow {
  id: string;
  event_key: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string;
}

export class EmailNotificationRepository extends BaseRepository {

  /** All persisted rows. Missing keys are filled from the catalog in the service layer (no per-request seeding — that was N round-trips and slowed Settings). Rows appear after first toggle/template save or first notify. */
  async listAll(): Promise<SettingRow[]> {
    return this.sql`
      SELECT event_key, enabled, subject_template, body_template,
             updated_at::text AS updated_at
      FROM email_notification_settings
      ORDER BY event_key
    ` as unknown as Promise<SettingRow[]>;
  }

  async getOne(eventKey: string): Promise<SettingRow | null> {
    const rows = (await this.sql`
      SELECT event_key, enabled, subject_template, body_template,
             updated_at::text AS updated_at
      FROM email_notification_settings
      WHERE event_key = ${eventKey}
    `) as SettingRow[];
    return rows[0] ?? null;
  }

  async upsert(
    eventKey: string,
    enabled: boolean,
    subjectTemplate: string,
    bodyTemplate: string,
  ): Promise<SettingRow> {
    const rows = (await this.sql`
      INSERT INTO email_notification_settings (event_key, enabled, subject_template, body_template)
      VALUES (${eventKey}, ${enabled}, ${subjectTemplate}, ${bodyTemplate})
      ON CONFLICT (event_key) DO UPDATE
        SET enabled          = EXCLUDED.enabled,
            subject_template = EXCLUDED.subject_template,
            body_template    = EXCLUDED.body_template,
            updated_at       = NOW()
      RETURNING event_key, enabled, subject_template, body_template,
                updated_at::text AS updated_at
    `) as SettingRow[];
    return rows[0];
  }

  async patchEnabled(eventKey: string, enabled: boolean): Promise<SettingRow | null> {
    const rows = (await this.sql`
      UPDATE email_notification_settings
      SET enabled = ${enabled}, updated_at = NOW()
      WHERE event_key = ${eventKey}
      RETURNING event_key, enabled, subject_template, body_template,
                updated_at::text AS updated_at
    `) as SettingRow[];
    return rows[0] ?? null;
  }

  async patchTemplate(
    eventKey: string,
    subjectTemplate: string,
    bodyTemplate: string,
  ): Promise<SettingRow | null> {
    const rows = (await this.sql`
      UPDATE email_notification_settings
      SET subject_template = ${subjectTemplate},
          body_template    = ${bodyTemplate},
          updated_at       = NOW()
      WHERE event_key = ${eventKey}
      RETURNING event_key, enabled, subject_template, body_template,
                updated_at::text AS updated_at
    `) as SettingRow[];
    return rows[0] ?? null;
  }

  async getLogs(eventKey?: string, limit = 100, offset = 0): Promise<{ rows: LogRow[]; total: number }> {
    const cond = eventKey ? `WHERE event_key = '${eventKey.replace(/'/g, "''")}'` : "";
    const countRows = (await this.sql(
      `SELECT COUNT(*)::int AS c FROM email_notification_logs ${cond}`,
      [],
    )) as { c: number }[];
    const total = countRows[0]?.c ?? 0;
    const rows = (await this.sql(
      `SELECT id, event_key, recipient_email, subject, status, error, metadata, sent_at::text AS sent_at
       FROM email_notification_logs ${cond}
       ORDER BY sent_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )) as LogRow[];
    return { rows, total };
  }
}
