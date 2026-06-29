import { BaseRepository } from "../../core/base/BaseRepository.js";

export class AppSettingsRepository extends BaseRepository {
  async getValue(key: string): Promise<string | null> {
    const rows = (await this.sql`SELECT value FROM app_settings WHERE key = ${key}`) as { value: string }[];
    return rows[0]?.value ?? null;
  }

  async getEntry(key: string): Promise<{ value: string; updatedAt: string } | null> {
    const rows = (await this.sql`SELECT value, updated_at FROM app_settings WHERE key = ${key}`) as {
      value: string;
      updated_at: string | Date;
    }[];
    const r = rows[0];
    if (!r) return null;
    const updatedAt =
      r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at);
    return { value: r.value, updatedAt };
  }

  async setValue(key: string, value: string): Promise<void> {
    await this.sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  async deleteKey(key: string): Promise<void> {
    await this.sql`DELETE FROM app_settings WHERE key = ${key}`;
  }
}
