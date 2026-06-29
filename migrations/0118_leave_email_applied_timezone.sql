-- Leave emails: show submitted instant with timezone (applied_at, timezone_label).
UPDATE email_notification_settings
SET body_template = REPLACE(
  body_template,
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Leave Type</td>',
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Leave Type</td>'
)
WHERE event_key IN ('leave.submitted', 'leave.notify_others', 'leave.cancelled')
  AND body_template LIKE '%{{employee_name}}%'
  AND body_template NOT LIKE '%{{applied_at}}%';

UPDATE email_notification_settings
SET body_template = REPLACE(
  body_template,
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td>',
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Submitted</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{applied_at}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Timezone</td><td style="padding:3px 0 3px 8px;font-size:13px;color:#64748b">{{timezone_label}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Leave Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{leave_type}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">From</td>'
)
WHERE event_key IN ('leave.approved', 'leave.rejected', 'leave.on_behalf')
  AND body_template LIKE '%{{leave_type}}%'
  AND body_template NOT LIKE '%{{applied_at}}%';
