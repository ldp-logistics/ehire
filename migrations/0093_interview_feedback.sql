-- Interview Feedback
-- Stores per-round, per-interviewer structured feedback for ATS interviews.
-- history_id → application_stage_history (one row per scheduled interview round).
-- reviewer_employee_id → employees (the panel member giving feedback).

CREATE TABLE IF NOT EXISTS interview_feedback (
  id                    VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  history_id            VARCHAR(255) NOT NULL
    REFERENCES application_stage_history(id) ON DELETE CASCADE,
  application_id        VARCHAR(255) NOT NULL
    REFERENCES applications(id) ON DELETE CASCADE,

  -- Reviewer identity (employee who gives feedback; null if HR added manually)
  reviewer_employee_id  VARCHAR(255)
    REFERENCES employees(id) ON DELETE SET NULL,
  reviewer_name         VARCHAR(255),
  reviewer_email        VARCHAR(255),

  -- Status lifecycle: pending → draft / submitted / no_show
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',

  overall_rating        INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  overall_comments      TEXT,

  -- JSONB array: [{criterion: string, rating: 1-5 | null, note: string}]
  scorecard             JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Test report uploaded to SharePoint
  test_report_url       TEXT,
  test_report_filename  VARCHAR(255),

  -- When HR last sent a feedback reminder for this round
  reminder_sent_at      TIMESTAMP WITH TIME ZONE,

  submitted_at          TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- One feedback row per (round, reviewer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_feedback_unique
  ON interview_feedback(history_id, reviewer_employee_id)
  WHERE reviewer_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_feedback_history_id   ON interview_feedback(history_id);
CREATE INDEX IF NOT EXISTS idx_interview_feedback_application_id ON interview_feedback(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_feedback_reviewer      ON interview_feedback(reviewer_employee_id);
