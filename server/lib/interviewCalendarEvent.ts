import { DateTime } from "luxon";
import { emailCtaButtonHtml, escapeHtmlAttrForEmail, escapeHtmlForEmail } from "./emailNotifications.js";

export type InterviewCalendarEventDetails = {
  candidateName: string;
  jobTitle: string;
  jobDepartment?: string | null;
  pipelineStage: "screening" | "interview";
  round: number;
  format: "onsite" | "teams";
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  profileUrl: string;
  pipelineUrl: string;
  commentsUrl: string;
  interviewsUrl: string;
  interviewerNames: string;
  locationPlain?: string | null;
  notes?: string | null;
  teamsJoinUrl?: string | null;
};

export function buildRecruitmentInterviewUrls(
  appUrl: string,
  applicationId: string,
  jobId: string,
  candidateId: string,
) {
  const base = appUrl.replace(/\/$/, "");
  const pipelineBase = `${base}/recruitment/jobs?job=${encodeURIComponent(jobId)}&applicant=${encodeURIComponent(applicationId)}`;
  return {
    profileUrl: `${base}/recruitment/candidates/${encodeURIComponent(candidateId)}`,
    pipelineUrl: pipelineBase,
    commentsUrl: `${pipelineBase}&panel=comments`,
    interviewsUrl: `${pipelineBase}&panel=interviews`,
  };
}

/** Graph API start/end wall-clock in the given IANA zone (interview events use US Eastern for Outlook). */
export function graphWallDateTimeFields(instant: Date, ianaTimeZone: string): { dateTime: string; timeZone: string } {
  const zone = (ianaTimeZone || "UTC").trim() || "UTC";
  const dt = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(zone);
  return { dateTime: dt.toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: zone };
}

export function buildInterviewCalendarSubject(
  d: Pick<InterviewCalendarEventDetails, "candidateName" | "jobTitle" | "format">,
): string {
  const fmt = d.format === "teams" ? "MS Teams interview" : "Onsite interview";
  const title = d.jobTitle.trim() || "Position";
  return `${d.candidateName.trim()} | ${title} | ${fmt}`;
}

export function buildInterviewCalendarEventHtml(d: InterviewCalendarEventDetails): string {
  const esc = escapeHtmlForEmail;
  const stageLabel = d.pipelineStage === "screening" ? "Screening" : "Interview";
  const formatLabel = d.format === "teams" ? "Microsoft Teams" : "Onsite";
  const roundLabel = `Round ${d.round}`;

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:5px 16px 5px 0;color:#64748b;font-size:12px;vertical-align:top;white-space:nowrap">${esc(label)}</td>
      <td style="padding:5px 0;font-size:13px;color:#1e293b;vertical-align:top">${value}</td>
    </tr>`;

  const link = (href: string, text: string) =>
    `<a href="${escapeHtmlAttrForEmail(href)}" style="color:#2563eb;font-weight:600;text-decoration:none">${esc(text)}</a>`;

  const candidateRows = [
    row("Profile", link(d.profileUrl, `View ${d.candidateName}'s profile`)),
    d.candidateEmail ? row("Email", `<a href="mailto:${escapeHtmlAttrForEmail(d.candidateEmail)}" style="color:#2563eb;text-decoration:none">${esc(d.candidateEmail)}</a>`) : "",
    d.candidatePhone ? row("Phone", esc(d.candidatePhone)) : "",
  ].filter(Boolean);

  const interviewRows = [
    row("Type", esc(formatLabel)),
    row("Stage", `${esc(stageLabel)} · ${esc(roundLabel)}`),
    row("Panel", esc(d.interviewerNames || "—")),
    d.format === "onsite" && d.locationPlain?.trim()
      ? row("Location", esc(d.locationPlain.trim()).replace(/\n/g, "<br/>"))
      : "",
  ].filter(Boolean);

  const actionButtons = [
    `<p style="margin:0 0 10px;text-align:center">${emailCtaButtonHtml(d.pipelineUrl, "Open applicant pipeline", { backgroundColor: "#0d9488" })}</p>`,
    `<p style="margin:0 0 10px;text-align:center">${emailCtaButtonHtml(d.commentsUrl, "Comments & @mentions", { backgroundColor: "#475569" })}</p>`,
    `<p style="margin:0 0 10px;text-align:center">${emailCtaButtonHtml(d.interviewsUrl, "Interviews & feedback", { backgroundColor: "#2563eb" })}</p>`,
  ];
  if (d.format === "teams" && d.teamsJoinUrl?.trim()) {
    actionButtons.unshift(
      `<p style="margin:0 0 12px;text-align:center">${emailCtaButtonHtml(d.teamsJoinUrl.trim(), "Join Microsoft Teams", { backgroundColor: "#5059c9" })}</p>`,
    );
  }

  const notesBlock = d.notes?.trim()
    ? `<p style="margin:14px 0 0;padding:10px 12px;background:#f8fafc;border-left:3px solid #94a3b8;font-size:12px;color:#475569;line-height:1.5"><strong>Notes:</strong><br/>${esc(d.notes.trim()).replace(/\n/g, "<br/>")}</p>`
    : "";

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1e293b;line-height:1.5;max-width:560px">
  <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0f172a">eHire · ${esc(stageLabel)} ${esc(roundLabel)}</p>
  <p style="margin:0 0 14px;font-size:12px;color:#64748b">Scheduled from LDP eHire. Use the links below for profile, pipeline, and feedback.</p>

  <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em">Candidate details</p>
  <table style="border-collapse:collapse;width:100%;margin:0 0 16px">${candidateRows.join("")}</table>

  <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em">Interview details</p>
  <table style="border-collapse:collapse;width:100%;margin:0 0 16px">${interviewRows.join("")}</table>

  <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em">Quick actions</p>
  ${actionButtons.join("\n")}
  ${notesBlock}
  <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">Powered by LDP eHire Recruitment</p>
</div>`;
}
