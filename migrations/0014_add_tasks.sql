-- =====================================================================
-- 0014: Task Management – tasks + task_comments tables
-- =====================================================================

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'cancelled');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_category') THEN
    CREATE TYPE task_category AS ENUM ('general', 'onboarding', 'offboarding', 'recruitment', 'compliance', 'training', 'performance', 'payroll', 'it', 'admin');
  END IF;
END $$;

-- 2. Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category task_category NOT NULL DEFAULT 'general',
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  created_by VARCHAR(255) NOT NULL,
  assignee_id VARCHAR(255),
  assignee_name VARCHAR(255),
  watcher_ids JSONB NOT NULL DEFAULT '[]',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  related_entity_type VARCHAR(50),
  related_entity_id VARCHAR(255),
  progress INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON tasks (created_by);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date);
CREATE INDEX IF NOT EXISTS tasks_category_idx ON tasks (category);

-- 3. Task comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id VARCHAR(255) NOT NULL,
  author_name VARCHAR(255),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments (task_id);
