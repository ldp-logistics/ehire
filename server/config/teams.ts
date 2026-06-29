/**
 * Microsoft Teams / Graph API configuration for interview meeting creation.
 *
 * Reuses the same Azure AD credentials as Microsoft SSO (auth):
 *   MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID
 *
 * Add one extra in .env for the meeting organizer (whose calendar creates the event):
 *   TEAMS_MEETING_ORGANIZER_EMAIL=hr@company.com
 *
 * Optional: TEAMS_GRAPH_ENABLED=false to disable even when credentials exist.
 */

import { config } from "dotenv";
config();

export const teamsConfig = {
  /** Same as Microsoft SSO – Azure AD app client ID */
  clientId: process.env.MS_CLIENT_ID ?? "",
  /** Same as Microsoft SSO – Azure AD app client secret */
  clientSecret: process.env.MS_CLIENT_SECRET ?? "",
  /** Same as Microsoft SSO – Azure AD tenant ID */
  tenantId: process.env.MS_TENANT_ID ?? "common",
  /**
   * Email of the user/mailbox that will create the meeting (organizer).
   * Must have a mailbox; often a shared "HR" or "Interviews" account.
   */
  organizerEmail: process.env.TEAMS_MEETING_ORGANIZER_EMAIL ?? "",
  /** Set to "false" to disable Teams integration even when credentials exist */
  enabled: process.env.TEAMS_GRAPH_ENABLED !== "false",
} as const;

export function isTeamsIntegrationConfigured(): boolean {
  const { clientId, clientSecret, tenantId, organizerEmail, enabled } = teamsConfig;
  return (
    enabled &&
    !!clientId?.trim() &&
    !!clientSecret?.trim() &&
    !!tenantId?.trim() &&
    !!organizerEmail?.trim()
  );
}

export type TeamsConfig = typeof teamsConfig;
