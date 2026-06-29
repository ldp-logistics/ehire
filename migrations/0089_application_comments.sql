-- Application comments (internal hiring-team discussion per applicant)
-- FK types must match: applications.id and users.id are VARCHAR(255), not UUID.
-- If you created an earlier broken version, run: DROP TABLE IF EXISTS application_comments CASCADE;
CREATE TABLE IF NOT EXISTS application_comments (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(255)  NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author_id      VARCHAR(255)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT         NOT NULL,
  visibility   VARCHAR(20)  NOT NULL DEFAULT 'public',  -- 'public' | 'private'
  attachments  JSONB,       -- [{name, url, mime, size}]
  mentions     JSONB,       -- [userId, ...]
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_comments_application ON application_comments(application_id);
CREATE INDEX IF NOT EXISTS idx_app_comments_author      ON application_comments(author_id);
