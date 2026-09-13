ALTER TABLE public.gc_clone_jobs
  ADD COLUMN IF NOT EXISTS source_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_rebuild boolean NOT NULL DEFAULT false;