CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.gc_job_secret (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.gc_job_secret TO service_role;
ALTER TABLE public.gc_job_secret ENABLE ROW LEVEL SECURITY;

INSERT INTO public.gc_job_secret (id) VALUES (TRUE);