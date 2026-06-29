/**
 * Probation reminder service: sends day_7, day_3, day_1 reminders once per employee.
 * Prevents duplicates via probation_reminders table. Run via cron or GET /api/dashboard/run-probation-reminders.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config();
const sql = neon(process.env.DATABASE_URL!);

const REMINDER_DAYS = [7, 3, 1] as const;
type ReminderType = "day_7" | "day_3" | "day_1";

function daysLeft(probationEndDate: string | Date): number {
  const end = new Date(probationEndDate);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function runProbationReminders(): Promise<{ sent: number; details: string[] }> {
  const details: string[] = [];
  let sent = 0;

  const employees = await sql`
    SELECT id, first_name, last_name, probation_end_date
    FROM employees
    WHERE probation_end_date IS NOT NULL
      AND confirmation_date IS NULL
      AND employment_status = 'active'
      AND probation_end_date >= CURRENT_DATE
    ORDER BY probation_end_date ASC
  `;

  for (const emp of employees as any[]) {
    const d = daysLeft(emp.probation_end_date);
    const reminderType: ReminderType | null =
      d === 7 ? "day_7" : d === 3 ? "day_3" : d === 1 ? "day_1" : null;
    if (!reminderType) continue;

    const existing = await sql`
      SELECT 1 FROM probation_reminders
      WHERE employee_id = ${emp.id} AND reminder_type = ${reminderType}
    `;
    if ((existing as any[]).length > 0) continue;

    try {
      await sql`
        INSERT INTO probation_reminders (employee_id, reminder_type)
        VALUES (${emp.id}, ${reminderType})
      `;
      sent++;
      const name = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim() || emp.id;
      details.push(`${reminderType} sent to employee=${emp.id} (${name})`);
      if (process.env.NODE_ENV !== "production") {
        console.log(`[probation] ${reminderType} sent to employee=${emp.id} (${name})`);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[probation] Failed to insert reminder:", err);
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[probation] Reminders triggered: ${sent}`);
  }
  return { sent, details };
}
