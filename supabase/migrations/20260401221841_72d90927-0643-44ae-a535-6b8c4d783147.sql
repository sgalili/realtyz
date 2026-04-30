
-- RLS policies for api_configs table
ALTER TABLE public.api_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read api_configs"
ON public.api_configs FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert api_configs"
ON public.api_configs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update api_configs"
ON public.api_configs FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete api_configs"
ON public.api_configs FOR DELETE TO authenticated
USING (true);
