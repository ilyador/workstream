-- Job logs table for worker→server communication via DB
CREATE TABLE public.job_logs (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  event text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_job_logs_job ON job_logs(job_id, id);

ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_logs_select" ON job_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs j JOIN project_members pm ON pm.project_id = j.project_id WHERE j.id = job_logs.job_id AND pm.user_id = auth.uid())
);
CREATE POLICY "job_logs_insert" ON job_logs FOR INSERT WITH CHECK (true);

-- Store local_path on jobs so worker knows where to run
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS local_path text;

-- Expand status CHECK to include queued and canceling
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('queued', 'running', 'paused', 'review', 'done', 'failed', 'canceling'));

-- Index for worker polling (status='queued' and status='canceling')
CREATE INDEX idx_jobs_status ON jobs(status, started_at);
