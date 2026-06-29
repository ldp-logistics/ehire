-- Add half-day (1st / 2nd half) placeholders to saved leave email templates.
UPDATE email_notification_settings
SET body_template = REPLACE(
  body_template,
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b">Days</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{total_days}}</td></tr>',
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
<tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>'
)
WHERE event_key IN (
  'leave.submitted',
  'leave.approved',
  'leave.rejected',
  'leave.on_behalf',
  'leave.notify_others'
)
  AND body_template LIKE '%{{total_days}}%'
  AND body_template NOT LIKE '%{{day_type_label}}%';

-- Cancelled template may lack a Days row — add duration + day type after To.
UPDATE email_notification_settings
SET body_template = REPLACE(
  body_template,
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
      </table>',
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b">To</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{end_date}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Duration</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{duration_summary}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b">Day Type</td><td style="padding:3px 0 3px 8px;font-size:14px;color:#1e293b">{{day_type_label}}</td></tr>
      </table>'
)
WHERE event_key = 'leave.cancelled'
  AND body_template LIKE '%{{end_date}}%'
  AND body_template NOT LIKE '%{{day_type_label}}%';
