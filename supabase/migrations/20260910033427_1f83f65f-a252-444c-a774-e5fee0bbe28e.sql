CREATE POLICY "No browser access" ON public.gc_clone_jobs FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "No browser access" ON public.gc_job_state FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "No browser access" ON public.gc_job_secret FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);