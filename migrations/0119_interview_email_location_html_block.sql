-- Interview invite: location placeholder is pre-rendered HTML (address + Maps CTA), not raw URL text.

UPDATE email_notification_settings
SET body_template = replace(
  body_template,
  '{{#interview_location}}<p style="margin:6px 0 0;font-size:13px;color:#64748b">Location: <strong style="color:#1e293b">{{interview_location}}</strong></p>{{/interview_location}}',
  '{{#interview_location}}<div style="margin:6px 0 0"><p style="margin:0 0 4px;font-size:13px;color:#64748b">Location</p>{{interview_location}}</div>{{/interview_location}}'
)
WHERE event_key IN ('recruit.interview_invite_candidate', 'recruit.interview_invite_panel')
  AND body_template LIKE '%Location: <strong style="color:#1e293b">{{interview_location}}</strong>%';
