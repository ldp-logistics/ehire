# Microsoft Teams integration (interview meetings)

When you schedule an interview in Recruitment, the system can create a Teams meeting and add the selected interviewers (and optionally the candidate) as attendees.

## Configuration (env)

Teams/Graph **reuses your existing Microsoft SSO credentials**:

| Variable | Required | Description |
|----------|----------|-------------|
| `MS_CLIENT_ID` | Yes | Same as SSO – Azure AD application (client) ID |
| `MS_CLIENT_SECRET` | Yes | Same as SSO – client secret |
| `MS_TENANT_ID` | Yes | Same as SSO – Azure AD tenant ID |
| `TEAMS_MEETING_ORGANIZER_EMAIL` | Yes | Email of the user/mailbox that will create the meeting (e.g. hr@company.com or a shared "Interviews" account). Must have a mailbox. |
| `TEAMS_GRAPH_ENABLED` | No | Set to `false` to disable (default: enabled if all above are set) |

If SSO is already configured, you only need to add **TEAMS_MEETING_ORGANIZER_EMAIL** (and the extra Graph permissions below).

## Example .env snippet

```env
# Already set for Microsoft SSO:
MS_CLIENT_ID=your-app-client-id
MS_CLIENT_SECRET=your-app-client-secret
MS_TENANT_ID=your-tenant-id

# Add for Teams interview meetings (organizer mailbox):
TEAMS_MEETING_ORGANIZER_EMAIL=hr@company.com
```

## Azure app setup (high level)

If you already have an app for SSO, add these **API permissions** (Microsoft Graph, Application permissions) and grant admin consent:

- **Calendars.ReadWrite** – to create calendar events (with Teams link) in the organizer's calendar  
  or **OnlineMeetings.ReadWrite.All** if you only create online meetings.

Ensure the user for TEAMS_MEETING_ORGANIZER_EMAIL has a mailbox and is in the same tenant.

## Code layout

- **Config:** `server/config/teams.ts` – reads env (MS_* + TEAMS_MEETING_ORGANIZER_EMAIL) and exposes `isTeamsIntegrationConfigured()`.
- **Service:** `server/services/teamsGraph.ts` – `createInterviewMeeting(params)` stub; replace with real Graph calls when you have the API.
- **Recruitment:** When "schedule interview" is implemented or extended, call `createInterviewMeeting()`, then store the returned `joinUrl` (and optional `eventId`) on the interview record and use it for "Join Teams meeting" and emails.

Once you add TEAMS_MEETING_ORGANIZER_EMAIL and the Graph permissions, the integration will be ready; the actual Graph call can be added in `teamsGraph.ts` when you're ready.
