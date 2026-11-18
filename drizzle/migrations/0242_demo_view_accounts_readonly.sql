CREATE TABLE public.demo_view_accounts (
  demo_type text PRIMARY KEY CHECK (demo_type IN ('broker','marketing','developer','owner','buyer','affiliate')),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.demo_view_accounts TO service_role;
ALTER TABLE public.demo_view_accounts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.demo_view_accounts (demo_type, user_id) VALUES ('marketing', '5b59424b-e309-406e-bcc4-65735b2eca50');

CREATE OR REPLACE FUNCTION public.is_demo_viewer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.demo_view_accounts WHERE user_id = _uid)
$$;
REVOKE ALL ON FUNCTION public.is_demo_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_demo_viewer(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_demo_view_type()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT demo_type FROM public.demo_view_accounts WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_demo_view_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_demo_view_type() TO authenticated;

-- Silently skip every row write made by a demo viewer session (view-only).
CREATE OR REPLACE FUNCTION public.block_demo_viewer_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NOT NULL AND public.is_demo_viewer(_uid) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_demo_viewer_readonly ON public.%I', r.relname);
    EXECUTE format('CREATE TRIGGER aaa_demo_viewer_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_demo_viewer_writes()', r.relname);
  END LOOP;
END $$;

-- Demo viewers (marketing and developer types) see the shared demo marketing company: all real developers/projects.
CREATE OR REPLACE FUNCTION public.my_marketing_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id FROM marketing_companies m
  WHERE (m.owner_user_id = auth.uid() AND public.has_role(auth.uid(), 'marketing_company'))
     OR (m.is_demo AND EXISTS (SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id = auth.uid() AND d.demo_type IN ('marketing','developer')))
  ORDER BY (m.owner_user_id = auth.uid()) DESC NULLS LAST
  LIMIT 1
$$;