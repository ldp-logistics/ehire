-- Compensation emails: HR was receiving employee-first copy ("Your compensation…").
-- Align stored templates with catalog: greet recipient, name the employee in the body.

UPDATE email_notification_settings
SET subject_template = 'Compensation Updated – {{employee_name}}'
WHERE event_key = 'general.compensation.salary_updated'
  AND subject_template IN ('Your Salary Has Been Updated', 'Compensation Updated – {{employee_name}}');

UPDATE email_notification_settings
SET body_template = REPLACE(
  REPLACE(
    REPLACE(
      body_template,
      '<p>Hi {{employee_name}},</p>',
      '<p>Hi {{recipient_name}},</p>'
    ),
    '<p>Your compensation record has been updated.</p>',
    '<p>The compensation record for <strong>{{employee_name}}</strong> has been updated.</p>'
  ),
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Effective Date</td>',
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:110px">Effective Date</td>'
)
WHERE event_key = 'general.compensation.salary_updated'
  AND body_template LIKE '%Your compensation record has been updated%';

UPDATE email_notification_settings
SET subject_template = 'Bonus Added – {{employee_name}}'
WHERE event_key = 'general.compensation.bonus_added'
  AND subject_template IN ('Bonus Added to Your Compensation Record', 'Bonus Added – {{employee_name}}');

UPDATE email_notification_settings
SET body_template = REPLACE(
  REPLACE(
    REPLACE(
      body_template,
      '<p>Hi {{employee_name}},</p>',
      '<p>Hi {{recipient_name}},</p>'
    ),
    '<p>A bonus has been added to your compensation record.</p>',
    '<p>A bonus has been added to the compensation record for <strong>{{employee_name}}</strong>.</p>'
  ),
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Bonus Type</td>',
  '<tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Employee</td><td style="padding:3px 0 3px 8px;font-size:14px;font-weight:600;color:#1e293b">{{employee_name}}</td></tr>
        <tr><td style="padding:3px 0;font-size:13px;color:#64748b;width:100px">Bonus Type</td>'
)
WHERE event_key = 'general.compensation.bonus_added'
  AND body_template LIKE '%added to your compensation record%';
