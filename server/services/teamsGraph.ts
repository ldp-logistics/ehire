/**
 * Microsoft Teams / Graph integration for interview calendar events.
 *
 * Creates Outlook calendar invites for panel (+ optional candidate) with optional Teams link.
 * Requires Calendars.ReadWrite (application or delegated).
 */

import { teamsConfig, isTeamsIntegrationConfigured } from "../config/teams";
import { graphWallDateTimeFields } from "../lib/interviewCalendarEvent.js";

export interface CreateInterviewMeetingParams {
  start: string | Date;
  end: string | Date;
  subject: string;
  interviewerEmails: string[];
  candidateEmail?: string | null;
  body?: string | null;
  /** IANA timezone for correct wall-clock display in Outlook (e.g. Asia/Karachi). */
  ianaTimeZone?: string;
  /** Onsite: false. Teams: true (default). */
  isOnlineMeeting?: boolean;
  /** Shown in Outlook location field (onsite address). */
  locationDisplay?: string | null;
  /** Skip Graph /me when excluding organizer from attendees (calendar-only token). */
  organizerEmailLower?: string | null;
}

export interface CreateInterviewMeetingResult {
  success: boolean;
  joinUrl?: string | null;
  eventId?: string | null;
  error?: string;
}

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_EVENTS_URL = (userPrincipalName: string) =>
  `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userPrincipalName)}/calendar/events`;
const GRAPH_ME_EVENTS_URL = "https://graph.microsoft.com/v1.0/me/calendar/events";
const GRAPH_ME_SELECT = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";

async function getGraphToken(): Promise<string> {
  const { clientId, clientSecret, tenantId } = teamsConfig;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: "client_credentials",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph token failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function getDelegatedOrganizerMailLower(token: string): Promise<string | null> {
  try {
    const res = await fetch(GRAPH_ME_SELECT, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
    const raw = (data.mail || data.userPrincipalName || "").trim().toLowerCase();
    return raw || null;
  } catch {
    return null;
  }
}

function buildAttendees(
  interviewerEmails: string[],
  candidateEmail?: string | null,
  excludeEmailLower?: string | null,
) {
  const attendees: Array<{ emailAddress: { address: string; name: string }; type: string }> = [];
  const seen = new Set<string>();
  for (const raw of interviewerEmails) {
    const email = raw?.trim();
    if (!email) continue;
    const k = email.toLowerCase();
    if (excludeEmailLower && k === excludeEmailLower) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    attendees.push({
      emailAddress: { address: email, name: email },
      type: "required",
    });
  }
  const cand = candidateEmail?.trim();
  if (cand) {
    const ck = cand.toLowerCase();
    if (!seen.has(ck) && ck !== excludeEmailLower) {
      attendees.push({
        emailAddress: { address: cand, name: cand },
        type: "required",
      });
    }
  }
  return attendees;
}

function buildGraphEventBody(params: CreateInterviewMeetingParams, excludeOrganizerLower?: string | null) {
  const startDate = typeof params.start === "string" ? new Date(params.start) : params.start;
  const endDate = typeof params.end === "string" ? new Date(params.end) : params.end;
  const iana = params.ianaTimeZone?.trim() || "UTC";
  const online = params.isOnlineMeeting !== false;
  const loc = params.locationDisplay?.trim();

  const payload: Record<string, unknown> = {
    subject: params.subject,
    body: params.body
      ? { contentType: "HTML", content: params.body }
      : { contentType: "HTML", content: "<p>Interview scheduled from eHire.</p>" },
    start: graphWallDateTimeFields(startDate, iana),
    end: graphWallDateTimeFields(endDate, iana),
    attendees: buildAttendees(params.interviewerEmails, params.candidateEmail, excludeOrganizerLower),
  };

  if (online) {
    payload.isOnlineMeeting = true;
    payload.onlineMeetingProvider = "teamsForBusiness";
  } else {
    payload.isOnlineMeeting = false;
  }

  if (loc) {
    payload.location = { displayName: loc.slice(0, 500) };
  }

  return payload;
}

async function parseGraphEventResponse(res: Response): Promise<CreateInterviewMeetingResult> {
  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `Graph API ${res.status}: ${errText.slice(0, 300)}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.error?.message) errMsg = errJson.error.message;
    } catch {
      /* keep errMsg */
    }
    console.error("[teamsGraph] Create event failed:", errMsg);
    return { success: false, error: errMsg };
  }

  const event = (await res.json()) as {
    id?: string;
    onlineMeeting?: { joinUrl?: string };
    webLink?: string;
  };
  const joinUrl = event?.onlineMeeting?.joinUrl ?? null;
  const eventId = event?.id ?? null;
  return {
    success: true,
    joinUrl: joinUrl || undefined,
    eventId: eventId || undefined,
  };
}

export async function createInterviewMeeting(
  params: CreateInterviewMeetingParams,
): Promise<CreateInterviewMeetingResult> {
  if (!isTeamsIntegrationConfigured()) {
    return {
      success: false,
      error:
        "Teams integration not configured. Set MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID and TEAMS_MEETING_ORGANIZER_EMAIL in .env",
    };
  }

  const organizerEmail = teamsConfig.organizerEmail.trim();
  const eventBody = buildGraphEventBody(params);

  try {
    const token = await getGraphToken();
    const res = await fetch(GRAPH_EVENTS_URL(organizerEmail), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });
    const result = await parseGraphEventResponse(res);
    if (result.success) {
      console.log("[teamsGraph] Event created", result.eventId, result.joinUrl ? "with join URL" : "calendar only");
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[teamsGraph] createInterviewMeeting error:", message);
    return { success: false, error: message };
  }
}

export async function createMeetingAsUser(
  userAccessToken: string,
  params: CreateInterviewMeetingParams,
): Promise<CreateInterviewMeetingResult> {
  const orgLower =
    params.organizerEmailLower?.trim().toLowerCase() ||
    (await getDelegatedOrganizerMailLower(userAccessToken));
  const eventBody = buildGraphEventBody(params, orgLower);

  try {
    const res = await fetch(GRAPH_ME_EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });
    const result = await parseGraphEventResponse(res);
    if (result.success) {
      console.log("[teamsGraph] Event created as user", result.eventId, result.joinUrl ? "with join URL" : "calendar only");
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[teamsGraph] createMeetingAsUser error:", message);
    return { success: false, error: message };
  }
}

export { isTeamsIntegrationConfigured };
