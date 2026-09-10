ALTER TABLE public.gc_clone_jobs
  ADD COLUMN IF NOT EXISTS ai_title text,
  ADD COLUMN IF NOT EXISTS ai_date text,
  ADD COLUMN IF NOT EXISTS ai_people text[],
  ADD COLUMN IF NOT EXISTS ai_categories text[],
  ADD COLUMN IF NOT EXISTS ai_source_type text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_aciah_impact text,
  ADD COLUMN IF NOT EXISTS ai_page_count integer,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_read_at timestamptz;