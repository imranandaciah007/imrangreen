ALTER TABLE public.gc_clone_jobs
  ADD COLUMN IF NOT EXISTS content_key TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of TEXT;

CREATE INDEX IF NOT EXISTS gc_clone_jobs_content_key_idx ON public.gc_clone_jobs (content_key);