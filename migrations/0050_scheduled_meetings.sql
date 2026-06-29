-- Meetings scheduled via Timezone Planner (Teams).
CREATE TABLE IF NOT EXISTS scheduled_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  join_url TEXT,
  attendee_emails TEXT[] NOT NULL DEFAULT '{}',
  created_by_user_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_meetings_created_at_idx ON scheduled_meetings(created_at DESC);
CREATE INDEX IF NOT EXISTS scheduled_meetings_start_at_idx ON scheduled_meetings(start_at);

COMMENT ON TABLE scheduled_meetings IS 'Teams meetings created from Timezone Planner; join_url from Graph API.';
