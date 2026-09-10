ALTER TABLE public.gc_job_state
  ADD COLUMN IF NOT EXISTS last_run_cloned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_queued integer NOT NULL DEFAULT 0;