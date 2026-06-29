/**
 * SendGrid Web API email sending.
 *
 * Env:
 *   SENDGRID_API_KEY — required
 *   EMAIL_FROM — default "From" when `sendEmail` is called without `from` (e.g. offer letters, interview invites)
 *
 * Notification engine (`notifyEmail` in emailNotifications.ts):
 *   EMAIL_FROM_NOTIFICATIONS — default for any module without its own override
 *   Per-module (optional, each falls back to NOTIFICATIONS then EMAIL_FROM):
 *     EMAIL_FROM_LEAVE, EMAIL_FROM_RECRUITMENT, EMAIL_FROM_TASK, EMAIL_FROM_IT,
 *     EMAIL_FROM_ONBOARDING, EMAIL_FROM_OFFBOARDING, EMAIL_FROM_COMPANY, EMAIL_FROM_GENERAL
 *
 * Verify senders at https://app.sendgrid.com/settings/sender_auth
 */

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sgMail from "@sendgrid/mail";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let envLoaded = false;
function ensureEnv() {
  if (!envLoaded) {
    config({ path: path.resolve(__dirname, "../../.env") });
    envLoaded = true;
  }
}

export type SendEmailParams = {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  /** Custom headers (e.g. Message-ID for reply threading). */
  headers?: Record<string, string>;
  /** Attachments: content as Buffer. */
  attachments?: Array<{ filename: string; content: Buffer }>;
};

export type SendEmailResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Send an email via SendGrid Web API. Uses EMAIL_FROM if from is not provided.
 * Returns { ok: true, id } on success, { ok: false, message } on failure.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  ensureEnv();
  const apiKey = (process.env.SENDGRID_API_KEY ?? "").trim();
  const fromAddress = (process.env.EMAIL_FROM ?? "Recruitment <careers@hr.ldplogistics.com>").trim();
  if (!apiKey) {
    return { ok: false, message: "SENDGRID_API_KEY is not set" };
  }

  sgMail.setApiKey(apiKey);

  const from = params.from ?? fromAddress;
  const to = Array.isArray(params.to) ? params.to : [params.to];
  const html = params.html ?? (params.text ? params.text.replace(/\n/g, "<br>") : "<p></p>");
  const text = params.text ?? (params.html ? params.html.replace(/<[^>]+>/g, "").trim() : "");

  // SendGrid replyTo accepts a single address string
  const replyTo = params.replyTo
    ? (Array.isArray(params.replyTo) ? params.replyTo[0] : params.replyTo)
    : undefined;

  const msg: any = {
    from,
    to,
    subject: params.subject,
    html,
    ...(text && { text }),
    ...(params.cc && { cc: params.cc }),
    ...(params.bcc && { bcc: params.bcc }),
    ...(replyTo && { replyTo }),
    ...(params.headers && { headers: params.headers }),
    ...(params.attachments && params.attachments.length > 0 && {
      attachments: params.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
        type: "application/octet-stream",
        disposition: "attachment",
      })),
    }),
  };

  try {
    const [response] = await sgMail.send(msg);
    const id =
      (response.headers as any)["x-message-id"] ??
      (response.headers as any)["X-Message-Id"] ??
      String(response.statusCode);
    return { ok: true, id };
  } catch (e: any) {
    const message =
      e?.response?.body?.errors?.[0]?.message ?? e?.message ?? String(e);
    return { ok: false, message };
  }
}

export function isEmailConfigured(): boolean {
  ensureEnv();
  return (process.env.SENDGRID_API_KEY ?? "").trim().length > 0;
}
