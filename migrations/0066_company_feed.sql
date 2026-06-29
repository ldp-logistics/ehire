-- Company Feed: posts (admin/hr only), attachments (SharePoint), emoji reactions (all employees).

CREATE TABLE IF NOT EXISTS feed_posts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  author_employee_id VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  content       TEXT         NOT NULL,
  is_pinned     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_attachments (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID    NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  file_name   TEXT    NOT NULL,
  mime_type   TEXT    NOT NULL DEFAULT 'application/octet-stream',
  file_url    TEXT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_reactions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID    NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  employee_id VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  emoji       TEXT    NOT NULL DEFAULT '👍',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, employee_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_created_at ON feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_attachments_post_id ON feed_attachments(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_reactions_post_id ON feed_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_reactions_employee_id ON feed_reactions(employee_id);

COMMENT ON TABLE feed_posts IS 'Company-wide feed posts created by admin/HR; employees can react.';
COMMENT ON TABLE feed_attachments IS 'Files attached to feed posts; URLs are SharePoint sharing links.';
COMMENT ON TABLE feed_reactions IS 'Emoji reactions on feed posts; unique per employee+emoji per post.';
