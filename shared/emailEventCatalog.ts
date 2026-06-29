/**
 * Canonical event catalog for the email notification system.
 *
 * Each entry defines:
 *  - eventKey     unique machine key   e.g. "leave.submitted"
 *  - tab          UI grouping          e.g. "leave"
 *  - label        human-readable name
 *  - description  one-line hint for Settings UI
 *  - defaultEnabled whether new installs send this event by default
 *  - defaultSubject default subject template (supports {{variable}})
 *  - defaultBody   default plain-text / light HTML body template
 *  - recipientNote describes who receives it (informational — displayed in UI)
 */

export interface EmailEventDef {
  eventKey: string;
  tab: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultSubject: string;
  defaultBody: string;
  recipientNote: string;
}

export const EMAIL_EVENT_CATALOG: EmailEventDef[] = [
  // ── Leave ──────────────────────────────────────────────────────────────────
  {
    eventKey: "leave.submitted",
    tab: "leave",
    label: "Leave Request Submitted",
    description: "Sent when an employee submits a new leave request.",
    defaultEnabled: true,
    defaultSubject: "Leave Request – {{employee_name}} ({{leave_type}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A leave request has been submitted and requires your review.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af">Pending Approval</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/leave/admin?requestId={{request_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Review Request</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee's reporting manager (if any) plus all active users with the HR role (not Limited HR or Admin; deduped by email)",
  },
  {
    eventKey: "leave.approved",
    tab: "leave",
    label: "Leave Request Approved",
    description: "Sent to the employee when their leave is fully approved.",
    defaultEnabled: true,
    defaultSubject: "Your {{leave_type}} Leave Has Been Approved",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Great news — your leave request has been <strong>approved</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">&#10003; &nbsp;Approved</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">You don't need to do anything further. Have a good break!</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who submitted the request",
  },
  {
    eventKey: "leave.rejected",
    tab: "leave",
    label: "Leave Request Rejected",
    description: "Sent to the employee when their leave is rejected.",
    defaultEnabled: true,
    defaultSubject: "Your {{leave_type}} Leave Request Has Been Declined",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Unfortunately, your leave request has been <strong>declined</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#dc2626">&#10007; &nbsp;Declined</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{rejection_reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">If you have questions, please speak to your manager or HR.</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who submitted the request",
  },
  {
    eventKey: "leave.cancelled",
    tab: "leave",
    label: "Leave Request Cancelled",
    description: "Sent to the employee's reporting manager and HR users when a leave request is cancelled.",
    defaultEnabled: true,
    defaultSubject: "Leave Cancelled – {{employee_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{employee_name}}</strong> has cancelled their leave request.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f8fafc;border-left:4px solid #94a3b8;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#64748b">Cancelled</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">No action is required on your part.</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee's reporting manager (if any) plus all active users with the HR role (same as leave submitted)",
  },
  {
    eventKey: "leave.on_behalf",
    tab: "leave",
    label: "Leave Applied on Your Behalf",
    description: "Sent to the employee when HR applies leave on their behalf.",
    defaultEnabled: true,
    defaultSubject: "Leave Applied on Your Behalf ({{leave_type}})",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>A leave request has been applied on your behalf by your HR team.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b45309">Applied on Your Behalf</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Applied by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please contact HR if you believe this is incorrect.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/leave/employee?requestId={{request_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Details</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee the leave was applied for",
  },
  {
    eventKey: "leave.comp_off_granted",
    tab: "leave",
    label: "Comp Off Granted",
    description: "Sent to the employee when HR or a manager grants compensation leave (comp off) days.",
    defaultEnabled: true,
    defaultSubject: "Comp Off Granted — {{days_granted_label}} added by {{granter_name}}",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Good news — <strong>{{granter_name}}</strong> has credited <strong>compensation leave (comp off)</strong> to your balance for working on a holiday or off day.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b45309">&#127873; &nbsp;Comp Off Granted</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:120px">Granted by</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{granter_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Days Added</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#b45309">{{days_granted_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Date Worked</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{date_worked}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">New Balance</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{new_balance}} day(s) available</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">You can use this comp off when applying for leave. Unused balance resets at year-end — it does not carry forward or convert to cash.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/leave/employee" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View My Leave Balance</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who received the comp off credit",
  },
  {
    eventKey: "leave.notify_others",
    tab: "leave",
    label: "Time Off — Notify Colleagues",
    description:
      "Sent to employees chosen under “Notify others” when someone applies for time off (same as in-app notify list).",
    defaultEnabled: true,
    defaultSubject: "{{employee_name}} is taking {{leave_type}} ({{start_date}} – {{end_date}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{employee_name}}</strong> has applied for time off and wanted to let you know.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdfa;border-left:4px solid #0d9488;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f766e">Upcoming Time Off</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">This is for your information only — no action is required.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/leave" style="display:inline-block;padding:10px 24px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Team calendar</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "Colleagues selected when applying (Notify others)",
  },

  // ── Recruitment ────────────────────────────────────────────────────────────
  {
    eventKey: "recruit.job_published",
    tab: "recruitment",
    label: "Job Opening Published",
    description: "Sent to recruiters and hiring managers when a job is published.",
    defaultEnabled: true,
    defaultSubject: "New Opening: {{job_title}} — Now Accepting Applications",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A new position has been published and is ready to receive applications.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f0f4ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#1e293b">{{job_title}}</p>
      <p style="margin:0;font-size:13px;color:#64748b">{{department}} &middot; {{location}}</p>
    </td>
  </tr>
</table>

<p>You can start reviewing incoming applications immediately.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment/jobs/{{job_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open job</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter and hiring managers assigned to the job",
  },
  {
    eventKey: "recruit.application_received",
    tab: "recruitment",
    label: "New Application Received",
    description: "Sent when a new application is submitted for a job.",
    defaultEnabled: true,
    defaultSubject: "New Applicant: {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A new application has been submitted and is awaiting your review.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b;width:90px">Candidate</td><td style="padding:2px 0 2px 8px;font-size:14px;font-weight:600;color:#1e293b">{{candidate_name}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Email</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{candidate_email}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Position</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Applied</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Review Application</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter and hiring managers assigned to the job",
  },
  {
    eventKey: "recruit.application_received_candidate",
    tab: "recruitment",
    label: "Application Received (Candidate confirmation)",
    description: "Sent to the candidate when they apply through the public careers page.",
    defaultEnabled: true,
    defaultSubject: "We received your application — {{job_title}} at {{company_name}}",
    defaultBody: `<p>Dear {{candidate_name}},</p>

<p>Thank you for applying to <strong>{{company_name}}</strong>. We have successfully received your application and our Talent Acquisition team will review it shortly.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#1e293b">Application summary</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b;width:90px">Position</td><td style="padding:2px 0 2px 8px;font-size:14px;font-weight:600;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Department</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Location</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{location}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Submitted</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p><strong>What happens next?</strong></p>
<ul style="margin:8px 0 16px;padding-left:20px;color:#334155;font-size:14px;line-height:1.6">
  <li>Our recruiting team will carefully review your profile and qualifications.</li>
  <li>If your experience aligns with the role, we will contact you at this email address for the next steps.</li>
  <li>Please allow a few business days for our initial review.</li>
</ul>

<p>In the meantime, you can explore other opportunities on our careers page.</p>

<p style="margin:24px 0 8px">
  <a href="{{careers_url}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Careers Page</a>
</p>

<p style="margin:24px 0 4px">Warm regards,</p>
<p style="margin:0"><strong>{{company_name}} Talent Acquisition</strong></p>
<p style="margin:8px 0 0;color:#64748b;font-size:13px">This is an automated confirmation — please do not reply to this message.</p>`,
    recipientNote: "The candidate (email submitted on the careers page application)",
  },
  {
    eventKey: "recruit.stage_changed",
    tab: "recruitment",
    label: "Application Stage Changed",
    description: "Sent to the team when an application moves to a new stage.",
    defaultEnabled: true,
    defaultSubject: "Pipeline Update: {{candidate_name}} → {{new_stage}} ({{job_title}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>An application has progressed in the hiring pipeline.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#faf5ff;border-left:4px solid #7c3aed;border-radius:6px">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b;width:90px">Candidate</td><td style="padding:2px 0 2px 8px;font-size:14px;font-weight:600;color:#1e293b">{{candidate_name}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Position</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Stage</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{old_stage}} &nbsp;→&nbsp; <strong>{{new_stage}}</strong></td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Moved by</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View in Pipeline</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter and hiring managers assigned to the job",
  },
  {
    eventKey: "recruit.interview_scheduled",
    tab: "recruitment",
    label: "Interview Scheduled",
    description: "Sent to the candidate and interviewer when an interview is scheduled.",
    defaultEnabled: true,
    defaultSubject: "Interview Confirmed: {{job_title}} at {{company_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>An interview has been confirmed. Please see the details below.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse">
  <tr>
    <td style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <!-- Date block -->
          <td style="width:90px;vertical-align:top;background:#f8fafc;text-align:center;padding:20px 0;border-right:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2563eb">{{interview_month}}</p>
            <p style="margin:2px 0 0;font-size:36px;font-weight:700;color:#1e293b;line-height:1">{{interview_day}}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#94a3b8">{{interview_weekday}}</p>
            <p style="margin:6px 0 0;font-size:11px;font-weight:600;color:#64748b">{{interview_year}}</p>
          </td>
          <!-- Details -->
          <td style="vertical-align:top;padding:16px 20px">
            <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#1e293b">{{pipeline_stage}} Round {{round}} ({{interview_format}})</p>
            <p style="margin:0 0 10px;font-size:13px;color:#64748b">{{job_title}}</p>
            <p style="margin:0 0 8px;font-size:11px;color:#94a3b8">Times in {{interview_timezone}}</p>
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="padding:3px 8px 3px 0;font-size:13px;color:#64748b;white-space:nowrap">When</td>
                <td style="padding:3px 0;font-size:13px;font-weight:600;color:#1e293b">{{interview_datetime}}</td>
              </tr>
              <tr>
                <td style="padding:3px 8px 3px 0;font-size:13px;color:#64748b;white-space:nowrap">Candidate</td>
                <td style="padding:3px 0;font-size:13px;color:#1e293b">{{candidate_name}}</td>
              </tr>
              <tr>
                <td style="padding:3px 8px 3px 0;font-size:13px;color:#64748b;white-space:nowrap">Format</td>
                <td style="padding:3px 0;font-size:13px;color:#1e293b">{{interview_format}}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:0 20px 16px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr><td style="padding:10px 14px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#475569">
              {{interview_notes}}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:20px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View in Recruitment</a>
</p>

<p style="color:#64748b;font-size:13px">Best regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Candidate and assigned interviewer",
  },
  {
    eventKey: "recruit.interview_invite_candidate",
    tab: "recruitment",
    label: "Interview invite (candidate)",
    description: "Default email shown in the composer before sending a screening or interview invite to the candidate.",
    defaultEnabled: true,
    defaultSubject: "Your {{pipeline_stage}} for {{job_title}} — Round {{round}}",
    defaultBody: `<p>Dear {{candidate_name}},</p>

<p>Congratulations! You have been <strong>shortlisted</strong> for interviews with <strong>{{company_name}}</strong> for the position of <strong>{{job_title}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse">
  <tr>
    <td style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <!-- Date block -->
          <td style="width:90px;vertical-align:top;background:#f8fafc;text-align:center;padding:20px 0;border-right:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2563eb">{{interview_month}}</p>
            <p style="margin:2px 0 0;font-size:36px;font-weight:700;color:#1e293b;line-height:1">{{interview_day}}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#94a3b8">{{interview_weekday}}</p>
            <p style="margin:6px 0 0;font-size:11px;font-weight:600;color:#64748b">{{interview_year}}</p>
          </td>
          <!-- Details -->
          <td style="vertical-align:top;padding:16px 20px">
            <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#1e293b">Round {{round}} ({{interview_format}})</p>
            <p style="margin:0 0 10px;font-size:13px;color:#64748b">{{job_title}}</p>
            <p style="margin:0 0 6px;font-size:11px;color:#94a3b8">{{interview_timezone}}</p>
            <p style="margin:0;padding:4px 10px;display:inline-block;background:#dbeafe;border-radius:4px;font-size:12px;font-weight:600;color:#1e40af">{{interview_time}}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">{{interviewers_list}}</strong></p>
            {{#interview_location}}<div style="margin:6px 0 0"><p style="margin:0 0 4px;font-size:13px;color:#64748b">Location</p>{{interview_location}}</div>{{/interview_location}}
          </td>
        </tr>
        <tr><td colspan="2" style="padding:12px 20px 16px;text-align:center">
          {{teams_join_link}}
        </td></tr>
      </table>
    </td>
  </tr>
</table>

{{#interview_notes}}<p style="padding:12px 16px;background:#f1f5f9;border-radius:6px;border-left:3px solid #cbd5e1;font-size:13px;color:#475569;margin:16px 0">{{interview_notes}}</p>{{/interview_notes}}

<p>If you have any questions, feel free to write to us by replying to this email.</p>

<p style="color:#475569;font-size:14px">Warm regards,<br/><strong>{{company_name}}</strong> Talent Acquisition Team</p>`,
    recipientNote: "Candidate only — edited in the schedule dialog before Send",
  },
  {
    eventKey: "recruit.interview_invite_panel",
    tab: "recruitment",
    label: "Interview invite (panel)",
    description: "Default email for interviewers and the recruiter when an invite is sent.",
    defaultEnabled: true,
    defaultSubject: "Interview Scheduled: {{candidate_name}} — {{pipeline_stage}} R{{round}} ({{job_title}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>You have been assigned as an interviewer. Please review the candidate's profile before the session.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse">
  <tr>
    <td style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <!-- Date block -->
          <td style="width:90px;vertical-align:top;background:#f8fafc;text-align:center;padding:20px 0;border-right:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0d9488">{{interview_month}}</p>
            <p style="margin:2px 0 0;font-size:36px;font-weight:700;color:#1e293b;line-height:1">{{interview_day}}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#94a3b8">{{interview_weekday}}</p>
            <p style="margin:6px 0 0;font-size:11px;font-weight:600;color:#64748b">{{interview_year}}</p>
          </td>
          <!-- Details -->
          <td style="vertical-align:top;padding:16px 20px">
            <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#1e293b">{{pipeline_stage}} Round {{round}} ({{interview_format}})</p>
            <p style="margin:0 0 10px;font-size:13px;color:#64748b">{{job_title}}</p>
            <p style="margin:0 0 6px;font-size:11px;color:#94a3b8">{{interview_timezone}}</p>
            <p style="margin:0;padding:4px 10px;display:inline-block;background:#ccfbf1;border-radius:4px;font-size:12px;font-weight:600;color:#0f766e">{{interview_time}}</p>
            <p style="margin:8px 0 2px;font-size:13px;color:#64748b">Candidate: <strong style="color:#1e293b">{{candidate_name}}</strong></p>
            <p style="margin:0;font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">{{interviewers_list}}</strong></p>
            {{#interview_location}}<div style="margin:6px 0 0"><p style="margin:0 0 4px;font-size:13px;color:#64748b">Location</p>{{interview_location}}</div>{{/interview_location}}
          </td>
        </tr>
        <tr><td colspan="2" style="padding:12px 20px 16px;text-align:center">
          {{teams_join_link}}
        </td></tr>
      </table>
    </td>
  </tr>
</table>

{{#interview_notes}}<p style="padding:12px 16px;background:#f1f5f9;border-radius:6px;border-left:3px solid #cbd5e1;font-size:13px;color:#475569;margin:16px 0">{{interview_notes}}</p>{{/interview_notes}}

<p style="margin:20px 0 8px">
  <a href="{{app_url}}/recruitment/jobs?job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open applicant pipeline</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Interviewers and recruiter — edited in the schedule dialog before Send",
  },
  {
    eventKey: "recruit.offer_sent",
    tab: "recruitment",
    label: "Offer Letter Sent",
    description: "Confirmation sent to recruiter and hiring managers when an offer is dispatched.",
    defaultEnabled: true,
    defaultSubject: "Offer Dispatched: {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>An offer letter has been sent to the candidate below. They will receive instructions to review and e-sign.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b;width:90px">Candidate</td><td style="padding:2px 0 2px 8px;font-size:14px;font-weight:600;color:#1e293b">{{candidate_name}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Position</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Sent by</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Date</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Track Offer Status</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter and hiring managers assigned to the job",
  },
  {
    eventKey: "recruit.offer_accepted",
    tab: "recruitment",
    label: "Offer Accepted",
    description: "Sent to HR and hiring team when a candidate accepts the offer.",
    defaultEnabled: true,
    defaultSubject: "Offer Accepted! {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>Great news — <strong>{{candidate_name}}</strong> has accepted the offer for <strong>{{job_title}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600">✓ &nbsp;Offer Accepted</p>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">The next step is to initiate onboarding for this candidate.</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Begin Onboarding</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter, hiring managers, and HR",
  },
  {
    eventKey: "recruit.offer_declined",
    tab: "recruitment",
    label: "Offer Declined",
    description: "Sent to the hiring team when a candidate declines the offer.",
    defaultEnabled: true,
    defaultSubject: "Offer Declined: {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{candidate_name}}</strong> has declined the offer for <strong>{{job_title}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#dc2626;font-weight:600">✗ &nbsp;Offer Declined</p>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">Consider revisiting other candidates in the pipeline or re-opening the position.</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Review Pipeline</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter and hiring managers assigned to the job",
  },
  {
    eventKey: "recruit.tentative.portal_invite",
    tab: "recruitment",
    label: "Tentative — Document portal (candidate)",
    description: "Sent to the candidate when tentative hiring starts so they can upload verification documents.",
    defaultEnabled: true,
    defaultSubject: "Next step: upload your documents — {{job_title}} at {{company_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>Congratulations on moving forward. As the next step in our hiring process, we need you to upload a few verification documents through our secure portal.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #eab308;border-radius:6px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#a16207">Document verification</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b;width:120px;vertical-align:top">Role</td><td style="padding:4px 0 4px 10px;font-size:14px;font-weight:600;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b;vertical-align:top">Department</td><td style="padding:4px 0 4px 10px;font-size:14px;color:#1e293b">{{department}}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b;vertical-align:top">Checklist</td><td style="padding:4px 0 4px 10px;font-size:14px;color:#1e293b">{{profile_type}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px;text-align:center">
  <a href="{{portal_url}}" style="display:inline-block;padding:12px 28px;background:#ca8a04;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open document portal</a>
</p>

<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#64748b;text-align:center">If the button doesn&rsquo;t work, copy and paste this link into your browser:<br/><span style="word-break:break-all;color:#475569">{{portal_url}}</span></p>

<p style="margin:20px 0 0;font-size:14px;color:#475569">Please complete uploads as soon as you can. If you have questions, reply to this email or contact your recruiter.</p>

<p style="color:#64748b;font-size:13px">Kind regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "The candidate (work/personal email on file)",
  },
  {
    eventKey: "recruit.esign_complete_candidate",
    tab: "recruitment",
    label: "E-Sign Complete (Candidate Copy)",
    description: "Sent to the candidate after they e-sign their offer letter.",
    defaultEnabled: true,
    defaultSubject: "Your Signed Offer Letter — {{job_title}} at {{company_name}}",
    defaultBody: `<p>Dear {{candidate_name}},</p>

<p>Thank you for signing your offer letter for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600">✓ &nbsp;Offer Letter Signed</p>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">Your signed offer has been recorded and the HR team has been notified. Please find a copy attached to this email for your records.</p>
    </td>
  </tr>
</table>

<p>We're excited to welcome you to the team. Our HR department will reach out shortly with next steps regarding your onboarding.</p>

<p style="margin:24px 0 8px;text-align:center">
  <a href="{{app_url}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open {{company_name}} HR</a>
</p>

<p>If you have questions about onboarding or your start date, please contact your recruiter or the {{company_name}} HR team.</p>

<p style="color:#475569;font-size:14px">Warm regards,<br/><strong>{{company_name}}</strong> Talent Acquisition Team</p>`,
    recipientNote: "The candidate who signed the offer",
  },
  {
    eventKey: "recruit.esign_complete_hr",
    tab: "recruitment",
    label: "E-Sign Complete (HR / recruiting copy)",
    description: "Sent to HR and recruiters when a candidate finishes e-signing; includes the signed offer PDF for records.",
    defaultEnabled: true,
    defaultSubject: "[Signed offer] {{candidate_name}} — {{job_title}} at {{company_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{candidate_name}}</strong> has completed e-signing their offer for <strong>{{job_title}}</strong> at {{company_name}}.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600">Signed offer on file</p>
      <p style="margin:8px 0 0;font-size:13px;color:#475569">A PDF copy of the signed offer letter is attached to this email. Keep it for your records and onboarding.</p>
    </td>
  </tr>
</table>

<p style="margin:20px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open applicant in Recruitment</a>
</p>

<p style="color:#64748b;font-size:13px">This is an internal notification.<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Active users with HR or recruiter role",
  },
  {
    eventKey: "recruit.offer_approval_request",
    tab: "recruitment",
    label: "Offer Approval Request",
    description: "Sent to recruiters when a limited recruiter creates a draft offer that requires approval.",
    defaultEnabled: true,
    defaultSubject: "Action Required: Approve Offer for {{candidate_name}} ({{job_title}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A draft offer requires your review and approval before it can be sent to the candidate.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b;width:90px">Candidate</td><td style="padding:2px 0 2px 8px;font-size:14px;font-weight:600;color:#1e293b">{{candidate_name}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Position</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:2px 0;font-size:13px;color:#64748b">Created by</td><td style="padding:2px 0 2px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Review & Approve</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiters and HR assigned to the job",
  },
  {
    eventKey: "recruit.hired",
    tab: "recruitment",
    label: "Candidate Hired",
    description: "Sent to HR and onboarding team when an application moves to Hired.",
    defaultEnabled: true,
    defaultSubject: "New Hire: {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{candidate_name}}</strong> has been confirmed as a new hire for <strong>{{job_title}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#15803d;font-weight:600">🎉 &nbsp;Candidate Hired</p>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">Please initiate the onboarding process to ensure a smooth transition.</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Start Onboarding</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "HR and onboarding specialists",
  },
  {
    eventKey: "candidate.verbal_acceptance",
    tab: "recruitment",
    label: "Candidate Verbal Acceptance",
    description: "Sent to the team when a candidate verbally accepts the offer.",
    defaultEnabled: true,
    defaultSubject: "Verbal Acceptance: {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{candidate_name}}</strong> has verbally accepted the offer for <strong>{{job_title}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#1d4ed8;font-weight:600">📞 &nbsp;Verbal Acceptance Received</p>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">Please proceed with preparing and issuing the formal offer letter.</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Prepare Offer</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter, hiring managers, and HR",
  },
  {
    eventKey: "recruit.application_rejected_candidate",
    tab: "recruitment",
    label: "Application Rejected (Candidate notification)",
    description: "Sent to the candidate when their application is rejected.",
    defaultEnabled: true,
    defaultSubject: "Your Application Update — {{company_name}}",
    defaultBody: `<p>Dear {{candidate_name}},</p>

<p>We thank you for applying with LDP Logistics and showing your career interest with us. However after careful consideration and a thorough review of all applications received, we regret to inform you that we have chosen to move forward with other candidates for the roles of <strong>{{job_title}}</strong>.</p>

<p>While we were impressed with your qualifications and experience, we had to make a decision based on our specific requirements and the needs of our team.</p>

<p>Please know that this decision does not reflect on your skills or qualifications, and we believe that you have a lot to offer. We encourage you to continue exploring opportunities within LDP Logistics in the future, as your experience and background may align with other roles that become available.</p>

<p>Thank you once again for considering LDP Logistics as your potential employer. We wish you all the best in your future endeavors and hope to see you succeed in your career.</p>

<p style="margin:24px 0 4px">Warm regards,</p>
<p style="margin:0"><strong>{{owner_name}}</strong><br/>Human Resource Department<br/>{{company_name}}</p>
<p style="margin:8px 0 0"><a href="https://www.ldplogistic.com" style="color:#2563eb">www.ldplogistic.com</a></p>`,
    recipientNote: "The candidate (work/personal email on file)",
  },
  {
    eventKey: "recruit.email_reply",
    tab: "recruitment",
    label: "Candidate Replied to Email",
    description: "Sent to the recruiter when a candidate replies to a recruitment email.",
    defaultEnabled: true,
    defaultSubject: "New Reply from {{candidate_name}} — {{job_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{candidate_name}}</strong> has replied to your email regarding the <strong>{{job_title}}</strong> position.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#1d4ed8;font-weight:600">✉️ &nbsp;New Message</p>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">Log in to read and respond to the candidate's reply.</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View & Reply</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} Talent Acquisition</p>`,
    recipientNote: "Recruiter assigned to the application",
  },

  // ── Task ───────────────────────────────────────────────────────────────────
  {
    eventKey: "task.assigned",
    tab: "task",
    label: "Task Assigned",
    description: "Sent to a user when a task is assigned to them.",
    defaultEnabled: true,
    defaultSubject: "New Task Assigned – {{task_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A new task has been assigned to you.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b">{{task_name}}</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Due Date</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{due_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Priority</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b"><strong>{{priority}}</strong></td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Assigned by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="padding:12px 16px;background:#f1f5f9;border-radius:6px;border-left:3px solid #cbd5e1;font-size:13px;color:#475569;margin:16px 0">{{task_notes}}</p>

<p style="margin:24px 0 8px">
  <a href="{{task_url}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Task</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The user the task is assigned to",
  },
  {
    eventKey: "task.completed",
    tab: "task",
    label: "Task Completed",
    description: "Sent to the task creator when a task is marked complete.",
    defaultEnabled: false,
    defaultSubject: "Task Completed – {{task_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>The following task has been completed.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">&#10003; &nbsp;Task Completed</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Task</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{task_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Completed by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{task_url}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Task</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The user who created the task",
  },
  {
    eventKey: "task.comment",
    tab: "task",
    label: "Task Comment",
    description: "Sent to the task creator, assignee, and watchers when someone comments (not the commenter).",
    defaultEnabled: true,
    defaultSubject: "New comment on task – {{task_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p><strong>{{commenter_name}}</strong> commented on a task you are involved in.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f8fafc;border-left:4px solid #6366f1;border-radius:6px">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1e293b">{{task_name}}</p>
      <p style="margin:0;font-size:14px;color:#475569;font-style:italic">"{{comment_preview}}"</p>
      <p style="margin:12px 0 0;font-size:12px;color:#64748b">— {{commenter_name}}</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{task_url}}" style="display:inline-block;padding:10px 24px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Task &amp; Reply</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "Task creator, assignee, and watchers (except the commenter)",
  },

  // ── IT & Assets ────────────────────────────────────────────────────────────
  {
    eventKey: "it.ticket.created",
    tab: "it_assets",
    label: "Support Ticket Created",
    description: "Sent to IT when a new support ticket is created.",
    defaultEnabled: true,
    defaultSubject: "[{{ticket_number}}] New Support Ticket – {{ticket_subject}}",
    defaultBody: `<p>Hi IT Team,</p>

<p>A new support ticket has been submitted and needs attention.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af">New Ticket</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Ticket #</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{ticket_number}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Subject</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{ticket_subject}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Category</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{ticket_category}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Priority</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b"><strong>{{ticket_priority}}</strong></td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Submitted by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Department</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/assets?tab=tickets&amp;ticket={{ticket_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Ticket</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} System</p>`,
    recipientNote: "All active IT role users",
  },
  {
    eventKey: "it.ticket.assigned",
    tab: "it_assets",
    label: "Ticket Assigned to You",
    description: "Sent to the IT user when a ticket is assigned to them.",
    defaultEnabled: true,
    defaultSubject: "[{{ticket_number}}] Ticket Assigned to You – {{ticket_subject}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A support ticket has been assigned to you for resolution.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b45309">Assigned to You</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Ticket #</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{ticket_number}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Subject</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{ticket_subject}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Category</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{ticket_category}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Priority</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b"><strong>{{ticket_priority}}</strong></td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Submitted by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{employee_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/assets?tab=tickets&amp;ticket={{ticket_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Ticket</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} System</p>`,
    recipientNote: "The IT user assigned to the ticket",
  },
  {
    eventKey: "it.ticket.status_changed",
    tab: "it_assets",
    label: "Ticket Status Updated",
    description: "Sent to the ticket creator when the status changes.",
    defaultEnabled: true,
    defaultSubject: "[{{ticket_number}}] Ticket Update – {{new_status}}",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Your support ticket status has been updated.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#faf5ff;border-left:4px solid #7c3aed;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#6d28d9">Status Updated</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Ticket #</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{ticket_number}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Subject</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{ticket_subject}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Status</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{old_status}} &nbsp;&rarr;&nbsp; <strong>{{new_status}}</strong></td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Updated by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/it-support?ticket={{ticket_id}}" style="display:inline-block;padding:10px 24px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Ticket</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} IT</p>`,
    recipientNote: "The employee who created the ticket",
  },
  {
    eventKey: "it.ticket.resolved",
    tab: "it_assets",
    label: "Ticket Resolved",
    description: "Sent to the ticket creator and the assigned IT employee when a ticket is resolved.",
    defaultEnabled: true,
    defaultSubject: "[{{ticket_number}}] Ticket Resolved – {{ticket_subject}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>{{resolved_notice}}</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">&#10003; &nbsp;Resolved</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Ticket #</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{ticket_number}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Subject</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{ticket_subject}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Resolved by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">If the issue persists, please open a new ticket.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/{{ticket_link_suffix}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Ticket</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} IT</p>`,
    recipientNote: "Ticket creator and assigned IT employee (deduplicated if the same person)",
  },
  {
    eventKey: "it.asset.assigned",
    tab: "it_assets",
    label: "Asset Assigned to Employee",
    description: "Sent to the employee when an asset is assigned to them.",
    defaultEnabled: true,
    defaultSubject: "Asset Assigned to You – {{asset_name}}",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>A company asset has been assigned to you.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdfa;border-left:4px solid #0d9488;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f766e">Asset Assigned</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Asset Name</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{asset_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Asset ID</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{asset_id}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Category</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{asset_category}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Assigned by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please handle company property with care.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/assets/view/{{asset_id}}" style="display:inline-block;padding:10px 24px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View asset</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} IT</p>`,
    recipientNote: "The employee the asset is assigned to",
  },

  // ── Onboarding / Offboarding ───────────────────────────────────────────────
  {
    eventKey: "onboarding.initiated",
    tab: "onboarding",
    label: "Onboarding Initiated",
    description: "Sent to the new employee and HR when onboarding starts.",
    defaultEnabled: true,
    defaultSubject: "Welcome to {{company_name}} – Your Onboarding Has Started",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Welcome to <strong>{{company_name}}</strong>! Your onboarding process has officially begun.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#15803d">Welcome Aboard!</p>
      <p style="margin:0;font-size:13px;color:#475569">Your onboarding coordinator will be reaching out with next steps. In the meantime, you can log in to the HR portal to track your progress.</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/onboarding?recordId={{onboarding_record_id}}&amp;employeeId={{employee_id}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Get Started</a>
</p>

<p style="font-size:14px;color:#475569">We're excited to have you on board!</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "New employee and HR team",
  },
  {
    eventKey: "onboarding.task_assigned",
    tab: "onboarding",
    label: "Onboarding Task Assigned",
    description: "Sent when a team member is assigned to an onboarding section (checklist tasks in that section).",
    defaultEnabled: true,
    defaultSubject: "Onboarding Assignment – {{section_name}} ({{employee_name}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>You have been assigned onboarding work for <strong>{{employee_name}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b">{{section_name}}</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">For employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Employee ID</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{emp_id}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Department</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Your tasks</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b;white-space:pre-line">{{tasks_list}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Assigned by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{assigned_by}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please complete the tasks in this section at your earliest convenience.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/onboarding?recordId={{onboarding_record_id}}&amp;employeeId={{employee_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Onboarding</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The assignee of the onboarding task",
  },
  {
    eventKey: "onboarding.completed",
    tab: "onboarding",
    label: "Onboarding Completed",
    description: "Sent to HR and the employee when onboarding is marked complete.",
    defaultEnabled: true,
    defaultSubject: "Onboarding Complete – {{employee_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>The onboarding process for <strong>{{employee_name}}</strong> has been completed.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">&#10003; &nbsp;Onboarding Complete</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Department</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/onboarding?recordId={{onboarding_record_id}}&amp;employeeId={{employee_id}}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open onboarding</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "HR and the employee",
  },
  {
    eventKey: "employee.welcome_invitation",
    tab: "onboarding",
    label: "eHire Welcome & Login Invitation",
    description: "Sent to the employee when onboarding is complete (or manually from their profile) with welcome message and login instructions.",
    defaultEnabled: true,
    defaultSubject: "Welcome to eHire – {{employee_name}}, you're all set to log in",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Congratulations — your onboarding at <strong>{{company_name}}</strong> is complete. We're thrilled to officially welcome you to the team!</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse">
  <tr>
    <td style="padding:24px;background:linear-gradient(135deg,#eff6ff 0%,#f0fdf4 100%);border-radius:8px;border:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Welcome to eHire</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a">Your HR portal is ready</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b;width:120px">Name</td><td style="padding:4px 0 4px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b">Job title</td><td style="padding:4px 0 4px 8px;font-size:14px;color:#1e293b">{{job_title}}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b">Department</td><td style="padding:4px 0 4px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#64748b">Work email</td><td style="padding:4px 0 4px 8px;font-size:14px;color:#1e293b">{{work_email}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569;margin:0 0 12px"><strong>How to sign in</strong></p>
<ol style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#475569;line-height:1.6">
  <li>Go to the eHire portal using the button below.</li>
  <li>Click <strong>Sign in with Microsoft</strong>.</li>
  <li>Use your work email <strong>{{work_email}}</strong> and your company Microsoft password.</li>
</ol>

<p style="margin:24px 0 8px">
  <a href="{{login_url}}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;box-shadow:0 2px 4px rgba(37,99,235,.25)">Access eHire</a>
</p>

<p style="font-size:13px;color:#64748b;margin:16px 0 0">If the button doesn't work, copy and paste this link into your browser:<br/><a href="{{login_url}}" style="color:#2563eb;word-break:break-all">{{login_url}}</a></p>

<p style="font-size:14px;color:#475569;margin:24px 0 0">Inside eHire you can view your profile, apply for leave, see company updates, and more. If you have trouble signing in, contact your HR team or IT support.</p>

<p style="color:#64748b;font-size:13px;margin-top:24px">Welcome aboard!<br/><strong>{{company_name}} HR Team</strong></p>`,
    recipientNote: "The employee (work email only)",
  },
  {
    eventKey: "offboarding.initiated",
    tab: "onboarding",
    label: "Offboarding Initiated",
    description: "Sent to the employee and HR when offboarding is started.",
    defaultEnabled: true,
    defaultSubject: "Offboarding Process Started – {{employee_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>The offboarding process has been initiated for <strong>{{employee_name}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b45309">Offboarding Initiated</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Resignation Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{resignation_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Exit Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{exit_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{offboarding_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Initiated by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/offboarding?employeeId={{employee_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Offboarding</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee and HR team",
  },
  {
    eventKey: "offboarding.task_assigned",
    tab: "onboarding",
    label: "Offboarding Task Assigned",
    description: "Sent when an offboarding checklist task is assigned to a team member.",
    defaultEnabled: true,
    defaultSubject: "Offboarding Task – {{task_name}} ({{employee_name}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>You have been assigned an offboarding task for <strong>{{employee_name}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b">{{task_name}}</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">For employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Employee ID</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{emp_id}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Department</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Task type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{task_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Assigned by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{assigned_by}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please complete this task as part of the offboarding checklist.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/offboarding?employeeId={{employee_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Offboarding</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The assignee of the offboarding task",
  },
  {
    eventKey: "offboarding.completed",
    tab: "onboarding",
    label: "Offboarding Completed",
    description: "Sent to HR and IT when an employee's offboarding is complete.",
    defaultEnabled: true,
    defaultSubject: "Offboarding Completed – {{employee_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>The offboarding process for <strong>{{employee_name}}</strong> has been completed.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f8fafc;border-left:4px solid #475569;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#475569">Offboarding Complete</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Exit Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{exit_date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please ensure all access has been revoked and assets have been returned.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/offboarding?employeeId={{employee_id}}" style="display:inline-block;padding:10px 24px;background:#475569;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View record</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "HR and IT team",
  },

  // ── Company ────────────────────────────────────────────────────────────────
  {
    eventKey: "company.feed.post_pinned",
    tab: "company",
    label: "Important Announcement Pinned",
    description: "Sent to all active employees when a post is pinned as important.",
    defaultEnabled: true,
    defaultSubject: "Important Announcement from {{company_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A new important announcement has been posted on the company feed.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af">Important Announcement</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Posted by</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{doer_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/news?post={{post_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Read Announcement</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "All active employees",
  },
  {
    eventKey: "company.feed.mention",
    tab: "company",
    label: "Tagged in Company Feed Post",
    description: "Sent when someone tags you in a company feed post.",
    defaultEnabled: true,
    defaultSubject: "{{author_name}} mentioned you on the company feed",
    defaultBody: `<p>Hi {{mentioned_name}},</p>

<p><strong>{{author_name}}</strong> tagged you in a post on the company feed.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px;background:#f8fafc;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0;font-size:14px;color:#334155;white-space:pre-wrap">{{post_snippet}}</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/news?post={{post_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Post</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "Tagged employee",
  },
  {
    eventKey: "company.meeting.scheduled",
    tab: "company",
    label: "Meeting Scheduled",
    description: "Sent to all attendees when a Teams meeting is scheduled.",
    defaultEnabled: true,
    defaultSubject: "Meeting Invitation: {{meeting_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>You have been invited to a meeting.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse">
  <tr>
    <td style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <td style="width:90px;vertical-align:top;background:#f8fafc;text-align:center;padding:20px 0;border-right:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#7c3aed">{{meeting_month}}</p>
            <p style="margin:2px 0 0;font-size:36px;font-weight:700;color:#1e293b;line-height:1">{{meeting_day}}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#94a3b8">{{meeting_weekday}}</p>
            <p style="margin:6px 0 0;font-size:11px;font-weight:600;color:#64748b">{{meeting_year}}</p>
          </td>
          <td style="vertical-align:top;padding:16px 20px">
            <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1e293b">{{meeting_title}}</p>
            <p style="margin:0 0 6px;font-size:11px;color:#94a3b8">{{meeting_timezone}}</p>
            <p style="margin:0;padding:4px 10px;display:inline-block;background:#ede9fe;border-radius:4px;font-size:12px;font-weight:600;color:#6d28d9">{{meeting_time}}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#64748b">Organised by: <strong style="color:#1e293b">{{doer_name}}</strong></p>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:12px 20px 16px;text-align:center">
{{meeting_link}}
        </td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:20px 0 8px">
  <a href="{{app_url}}" style="display:inline-block;padding:10px 24px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Open {{company_name}}</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "All meeting attendees",
  },
  {
    eventKey: "company.meeting.cancelled",
    tab: "company",
    label: "Meeting Cancelled",
    description: "Sent to all attendees when a scheduled meeting is cancelled.",
    defaultEnabled: true,
    defaultSubject: "Meeting Cancelled: {{meeting_title}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>The following meeting has been cancelled.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
      <p style="margin:0;font-size:14px;font-weight:600;color:#dc2626">Meeting Cancelled</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px">
        <tr><td style="padding:2px 8px 2px 0;font-size:13px;color:#64748b">Title</td><td style="padding:2px 0;font-size:13px;font-weight:600;color:#1e293b">{{meeting_title}}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;font-size:13px;color:#64748b">Original time</td><td style="padding:2px 0;font-size:13px;color:#1e293b">{{meeting_datetime}}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;font-size:13px;color:#64748b">Cancelled by</td><td style="padding:2px 0;font-size:13px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "All meeting attendees",
  },

  // ── General ────────────────────────────────────────────────────────────────
  {
    eventKey: "general.compensation.salary_updated",
    tab: "general",
    label: "Salary Updated",
    description: "Sent to the employee and HR when a salary record is created or updated.",
    defaultEnabled: true,
    defaultSubject: "Compensation Updated – {{employee_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>The compensation record for <strong>{{employee_name}}</strong> has been updated.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">Salary Updated</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Effective Date</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{start_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Updated by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/employees/{{employee_id}}?tab=compensation" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Compensation</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee and HR",
  },
  {
    eventKey: "general.compensation.bonus_added",
    tab: "general",
    label: "Bonus Added",
    description: "Sent to the employee and HR when a bonus is added to a compensation record.",
    defaultEnabled: true,
    defaultSubject: "Bonus Added – {{employee_name}}",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A bonus has been added to the compensation record for <strong>{{employee_name}}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b45309">Bonus Added</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Bonus Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{bonus_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Amount</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{bonus_amount}} {{currency}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Added by</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{doer_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/employees/{{employee_id}}?tab=compensation" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Compensation</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee and HR",
  },
  {
    eventKey: "general.change_request.submitted",
    tab: "general",
    label: "Profile Change Request Submitted",
    description: "Sent to HR when an employee submits a profile change request.",
    defaultEnabled: true,
    defaultSubject: "Profile Change Request – {{employee_name}}",
    defaultBody: `<p>Hi HR Team,</p>

<p><strong>{{employee_name}}</strong> has submitted a profile change request.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af">Change Request</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Field</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{field_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Old Value</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{old_value}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">New Value</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{new_value}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/change-requests?request={{change_request_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Review Request</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} System</p>`,
    recipientNote: "HR team",
  },
  {
    eventKey: "general.change_request.approved",
    tab: "general",
    label: "Profile Change Request Approved",
    description: "Sent to the employee when their change request is approved.",
    defaultEnabled: true,
    defaultSubject: "Your Profile Change Has Been Approved",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Your profile change request has been <strong>approved</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">&#10003; &nbsp;Change Approved</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Field</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{field_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">New Value</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{new_value}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who submitted the request",
  },
  {
    eventKey: "general.change_request.rejected",
    tab: "general",
    label: "Profile Change Request Rejected",
    description: "Sent to the employee when their change request is rejected.",
    defaultEnabled: true,
    defaultSubject: "Your Profile Change Request Has Been Declined",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Your profile change request has been <strong>declined</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#dc2626">&#10007; &nbsp;Change Declined</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Field</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{field_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{rejection_reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please contact HR if you have questions.</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who submitted the request",
  },
  {
    eventKey: "general.probation.reminder",
    tab: "general",
    label: "Probation Ending Reminder",
    description: "Sent to the employee's manager and HR as probation end approaches.",
    defaultEnabled: true,
    defaultSubject: "Probation Ending Soon – {{employee_name}} ({{days_remaining}} days left)",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>This is a reminder that <strong>{{employee_name}}</strong>'s probation period is ending soon.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b45309">Probation Ending</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:130px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Department</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{department}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Probation End Date</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{probation_end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Days Remaining</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{days_remaining}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="font-size:14px;color:#475569">Please take the necessary action before the deadline.</p>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/employees/{{employee_id}}" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Employee</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "Manager and HR",
  },
  {
    eventKey: "recruit.interview_feedback_reminder",
    tab: "recruitment",
    label: "Interview Feedback Reminder",
    description: "Sent to interviewers when a round ends (automatic) or when HR/recruiter sends a manual reminder.",
    defaultEnabled: true,
    defaultSubject: "Reminder: Please submit your interview feedback — {{candidate_name}}",
    defaultBody: `<p>Hi {{reviewer_name}},</p>

<p>This is a reminder to submit your interview feedback for the following candidate.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af">Feedback Pending</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Candidate</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{candidate_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Position</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{job_title}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Submit Feedback</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "Interviewers who have not submitted feedback for the round",
  },
  {
    eventKey: "recruitment.comment_mention",
    tab: "recruitment",
    label: "Applicant Comment Mention",
    description: "Sent when someone @mentions you in an applicant comment.",
    defaultEnabled: true,
    defaultSubject: "{{authorName}} mentioned you in a comment",
    defaultBody: `<p>Hi {{mentionedName}},</p>

<p><strong>{{authorName}}</strong> mentioned you in a comment on <strong>{{candidateName}}</strong>'s application.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:16px 20px;background:#f8fafc;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0;font-size:13px;color:#64748b;font-style:italic">&ldquo;{{commentSnippet}}&rdquo;</p>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/recruitment?tab=jobs&amp;job={{job_id}}&amp;applicant={{application_id}}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View Discussion</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>HR Team</p>`,
    recipientNote: "The mentioned team member",
  },

  // ── Loans ───────────────────────────────────────────────────────────────────
  {
    eventKey: "loan.application_submitted",
    tab: "loans",
    label: "Loan Application Submitted",
    description: "Sent to HR and admin when an employee submits a new loan or salary advance request.",
    defaultEnabled: true,
    defaultSubject: "Loan Request – {{employee_name}} ({{loan_type}})",
    defaultBody: `<p>Hi {{recipient_name}},</p>

<p>A new loan application has been submitted and is awaiting your review.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af">Pending Review</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:120px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Employee ID</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{employee_id}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Loan Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{loan_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Amount</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{requested_amount}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Tenure</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{requested_tenure}} months</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/loans" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">Review Applications</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "All active users with the HR or admin role (deduped by email)",
  },
  {
    eventKey: "loan.application_approved",
    tab: "loans",
    label: "Loan Application Approved",
    description: "Sent to the employee when HR approves their loan application.",
    defaultEnabled: true,
    defaultSubject: "Your {{loan_type}} Request Has Been Approved",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Your loan application has been <strong>approved</strong>. Deductions will begin from the effective date below.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#15803d">&#10003; Approved</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:140px">Loan Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{loan_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Approved Amount</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{approved_amount}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Tenure</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{approved_tenure}} months</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Monthly Deduction</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{monthly_deduction}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Effective From</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{effective_start_date}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/loans" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.1)">View My Loans</a>
</p>

<p style="color:#64748b;font-size:13px">Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who submitted the application",
  },
  {
    eventKey: "loan.application_rejected",
    tab: "loans",
    label: "Loan Application Rejected",
    description: "Sent to the employee when HR rejects their loan application.",
    defaultEnabled: true,
    defaultSubject: "Update on Your {{loan_type}} Request",
    defaultBody: `<p>Hi {{employee_name}},</p>

<p>Thank you for your loan application. After review, we are unable to approve this request at this time.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
  <tr>
    <td style="padding:20px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#b91c1c">Application Not Approved</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:120px">Loan Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{loan_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Requested</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{requested_amount}} · {{requested_tenure}} months</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;vertical-align:top">Reason</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{rejection_reason}}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:24px 0 8px">
  <a href="{{app_url}}/loans" style="display:inline-block;padding:10px 24px;background:#64748b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">View My Loans</a>
</p>

<p style="color:#64748b;font-size:13px">If you have questions, please contact HR.<br/><br/>Regards,<br/>{{company_name}} HR</p>`,
    recipientNote: "The employee who submitted the application",
  },
];

/** Quick lookup by eventKey. */
export const EMAIL_EVENT_MAP: Record<string, EmailEventDef> = Object.fromEntries(
  EMAIL_EVENT_CATALOG.map((e) => [e.eventKey, e]),
);

/** All unique tabs in display order. */
export const EMAIL_EVENT_TABS = [
  { key: "leave",       label: "Leave" },
  { key: "loans",       label: "Loans" },
  { key: "recruitment", label: "Recruitment" },
  { key: "task",        label: "Task" },
  { key: "it_assets",   label: "IT & Assets" },
  { key: "onboarding",  label: "Onboarding" },
  { key: "company",     label: "Company" },
  { key: "general",     label: "General" },
] as const;
