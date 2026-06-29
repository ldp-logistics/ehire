-- Add {{interview_location}} placeholder to stored interview invite email templates.
-- Only patches rows that do not already contain the placeholder.

-- Candidate invite: inject location line after the Interviewers line
UPDATE email_notification_settings
SET body_template = replace(
  body_template,
  '<p style="margin:8px 0 0;font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">{{interviewers_list}}</strong></p>',
  '<p style="margin:8px 0 0;font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">{{interviewers_list}}</strong></p>{{#interview_location}}<p style="margin:6px 0 0;font-size:13px;color:#64748b">Location: <strong style="color:#1e293b">{{interview_location}}</strong></p>{{/interview_location}}'
)
WHERE event_key = 'recruit.interview_invite_candidate'
  AND body_template NOT LIKE '%interview_location%';

-- Panel invite: inject location line after the Interviewers line
UPDATE email_notification_settings
SET body_template = replace(
  body_template,
  '<p style="margin:0;font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">{{interviewers_list}}</strong></p>',
  '<p style="margin:0;font-size:13px;color:#64748b">Interviewers: <strong style="color:#1e293b">{{interviewers_list}}</strong></p>{{#interview_location}}<p style="margin:6px 0 0;font-size:13px;color:#64748b">Location: <strong style="color:#1e293b">{{interview_location}}</strong></p>{{/interview_location}}'
)
WHERE event_key = 'recruit.interview_invite_panel'
  AND body_template NOT LIKE '%interview_location%';
