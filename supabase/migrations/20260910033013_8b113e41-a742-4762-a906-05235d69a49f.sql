CREATE TABLE public.gc_clone_jobs (
  drive_file_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  folder_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  exhibit_id TEXT NOT NULL,
  clone_file_id TEXT,
  clone_name TEXT,
  clone_link TEXT,
  original_pages INTEGER,
  total_pages INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX gc_clone_jobs_status_idx ON public.gc_clone_jobs (status, updated_at);

GRANT ALL ON public.gc_clone_jobs TO service_role;
ALTER TABLE public.gc_clone_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.gc_job_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  status TEXT NOT NULL DEFAULT 'idle',
  lease_until TIMESTAMP WITH TIME ZONE,
  paused_reason TEXT,
  last_tree_sync_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  folders INTEGER NOT NULL DEFAULT 0,
  files INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.gc_job_state TO service_role;
ALTER TABLE public.gc_job_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.gc_job_state (id) VALUES (TRUE);