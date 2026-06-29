-- Fix "View Compensation" deep links in email templates (path → query tab).
UPDATE email_notification_settings
SET body_template = REPLACE(
  body_template,
  '/employees/{{employee_id}}/compensation',
  '/employees/{{employee_id}}?tab=compensation'
)
WHERE event_key IN ('general.compensation.salary_updated', 'general.compensation.bonus_added')
  AND body_template LIKE '%/employees/{{employee_id}}/compensation%';
