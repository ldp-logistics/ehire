import { EmailNotificationRepository } from "./EmailNotificationRepository.js";
import type { SettingRow, LogRow } from "./EmailNotificationRepository.js";
import { EMAIL_EVENT_CATALOG, EMAIL_EVENT_MAP, EMAIL_EVENT_TABS } from "../../../shared/emailEventCatalog.js";
import { NotFoundError, ValidationError } from "../../core/types/index.js";

export interface EventSettingDTO {
  eventKey: string;
  tab: string;
  label: string;
  description: string;
  recipientNote: string;
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt: string | null;
  // catalog defaults (for reset)
  defaultSubject: string;
  defaultBody: string;
  defaultEnabled: boolean;
}

export interface TabGroupDTO {
  key: string;
  label: string;
  events: EventSettingDTO[];
}

/** In-memory cache so Settings → Email notifications does not hit Neon on every tab switch / refetch. */
let listGroupedCache: { expiresAt: number; data: TabGroupDTO[] } | null = null;
const LIST_GROUPED_TTL_MS = 90_000;

export function bustEmailNotificationListGroupedCache(): void {
  listGroupedCache = null;
}

export class EmailNotificationService {
  private readonly repo = new EmailNotificationRepository();

  /** Return all events grouped by tab, merged with DB overrides. */
  async listGrouped(): Promise<TabGroupDTO[]> {
    const now = Date.now();
    if (listGroupedCache && listGroupedCache.expiresAt > now) {
      return listGroupedCache.data;
    }

    const dbRows = await this.repo.listAll();
    const dbMap: Record<string, SettingRow> = Object.fromEntries(dbRows.map((r) => [r.event_key, r]));

    const data = EMAIL_EVENT_TABS.map((tab) => ({
      key: tab.key,
      label: tab.label,
      events: EMAIL_EVENT_CATALOG.filter((e) => e.tab === tab.key).map((def) => {
        const db = dbMap[def.eventKey];
        return {
          eventKey: def.eventKey,
          tab: def.tab,
          label: def.label,
          description: def.description,
          recipientNote: def.recipientNote,
          enabled: db ? db.enabled : def.defaultEnabled,
          subjectTemplate: db ? db.subject_template : def.defaultSubject,
          bodyTemplate: db ? db.body_template : def.defaultBody,
          updatedAt: db?.updated_at ?? null,
          defaultSubject: def.defaultSubject,
          defaultBody: def.defaultBody,
          defaultEnabled: def.defaultEnabled,
        };
      }),
    }));

    listGroupedCache = { expiresAt: now + LIST_GROUPED_TTL_MS, data };
    return data;
  }

  /** Get a single event setting. */
  async getOne(eventKey: string): Promise<EventSettingDTO> {
    const def = EMAIL_EVENT_MAP[eventKey];
    if (!def) throw new NotFoundError("Email notification event", eventKey);
    const db = await this.repo.getOne(eventKey);
    return {
      eventKey: def.eventKey,
      tab: def.tab,
      label: def.label,
      description: def.description,
      recipientNote: def.recipientNote,
      enabled: db ? db.enabled : def.defaultEnabled,
      subjectTemplate: db ? db.subject_template : def.defaultSubject,
      bodyTemplate: db ? db.body_template : def.defaultBody,
      updatedAt: db?.updated_at ?? null,
      defaultSubject: def.defaultSubject,
      defaultBody: def.defaultBody,
      defaultEnabled: def.defaultEnabled,
    };
  }

  /** Toggle enabled on/off. Seeds the row if it doesn't exist yet. */
  async setEnabled(eventKey: string, enabled: boolean): Promise<EventSettingDTO> {
    const def = EMAIL_EVENT_MAP[eventKey];
    if (!def) throw new NotFoundError("Email notification event", eventKey);

    // Ensure row exists first
    await this.repo.upsert(
      eventKey,
      enabled,
      def.defaultSubject,
      def.defaultBody,
    );
    // Then patch
    const db = await this.repo.patchEnabled(eventKey, enabled);
    bustEmailNotificationListGroupedCache();
    return this._toDTO(def.eventKey, db!);
  }

  /** Update subject and body templates. */
  async updateTemplate(
    eventKey: string,
    subjectTemplate: string,
    bodyTemplate: string,
  ): Promise<EventSettingDTO> {
    const def = EMAIL_EVENT_MAP[eventKey];
    if (!def) throw new NotFoundError("Email notification event", eventKey);
    if (!subjectTemplate?.trim()) throw new ValidationError("subjectTemplate is required");
    if (!bodyTemplate?.trim()) throw new ValidationError("bodyTemplate is required");

    // Ensure row exists first (preserve current enabled state)
    const existing = await this.repo.getOne(eventKey);
    if (!existing) {
      await this.repo.upsert(eventKey, def.defaultEnabled, subjectTemplate, bodyTemplate);
    } else {
      await this.repo.patchTemplate(eventKey, subjectTemplate, bodyTemplate);
    }
    const db = await this.repo.getOne(eventKey);
    bustEmailNotificationListGroupedCache();
    return this._toDTO(eventKey, db!);
  }

  /** Reset a single event to catalog defaults. */
  async resetToDefault(eventKey: string): Promise<EventSettingDTO> {
    const def = EMAIL_EVENT_MAP[eventKey];
    if (!def) throw new NotFoundError("Email notification event", eventKey);
    const db = await this.repo.upsert(eventKey, def.defaultEnabled, def.defaultSubject, def.defaultBody);
    bustEmailNotificationListGroupedCache();
    return this._toDTO(eventKey, db);
  }

  /** Get dispatch logs (paginated). */
  async getLogs(
    eventKey?: string,
    limit = 100,
    offset = 0,
  ): Promise<{ rows: LogRow[]; total: number }> {
    return this.repo.getLogs(eventKey, Math.min(limit, 500), offset);
  }

  private _toDTO(eventKey: string, db: SettingRow): EventSettingDTO {
    const def = EMAIL_EVENT_MAP[eventKey]!;
    return {
      eventKey: db.event_key,
      tab: def.tab,
      label: def.label,
      description: def.description,
      recipientNote: def.recipientNote,
      enabled: db.enabled,
      subjectTemplate: db.subject_template,
      bodyTemplate: db.body_template,
      updatedAt: db.updated_at ?? null,
      defaultSubject: def.defaultSubject,
      defaultBody: def.defaultBody,
      defaultEnabled: def.defaultEnabled,
    };
  }
}
