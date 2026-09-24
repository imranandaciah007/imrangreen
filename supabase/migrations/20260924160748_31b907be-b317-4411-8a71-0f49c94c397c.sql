CREATE TABLE public.gc_case_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gc_case_store (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gc_case_items TO service_role;
GRANT ALL ON public.gc_case_store TO service_role;
ALTER TABLE public.gc_case_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_case_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No browser access" ON public.gc_case_items FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No browser access" ON public.gc_case_store FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);