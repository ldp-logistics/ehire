-- Tagged employees on company feed posts (birthdays, appreciation, etc.).

CREATE TABLE IF NOT EXISTS feed_post_mentions (
  post_id       UUID         NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  employee_id   VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_post_mentions_employee_id ON feed_post_mentions(employee_id);

COMMENT ON TABLE feed_post_mentions IS 'Employees tagged/mentioned on a company feed post.';
