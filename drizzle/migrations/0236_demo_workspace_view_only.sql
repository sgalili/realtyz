CREATE OR REPLACE FUNCTION public.block_demo_workspace_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.workspace_owner_id = '5b59424b-e309-406e-bcc4-65735b2eca50'::uuid THEN
    IF TG_TABLE_NAME = 'listings' AND COALESCE(NEW.is_published, false) THEN
      RAISE EXCEPTION 'חשבון הדמו מיועד לצפייה בלבד ואינו מאפשר פרסום';
    END IF;
    IF TG_TABLE_NAME = 'developer_projects' AND COALESCE(NEW.is_public, false) THEN
      RAISE EXCEPTION 'חשבון הדמו מיועד לצפייה בלבד ואינו מאפשר פרסום';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS block_demo_publication ON public.listings;
CREATE TRIGGER block_demo_publication BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.block_demo_workspace_publication();
DROP TRIGGER IF EXISTS block_demo_publication ON public.developer_projects;
CREATE TRIGGER block_demo_publication BEFORE INSERT OR UPDATE ON public.developer_projects FOR EACH ROW EXECUTE FUNCTION public.block_demo_workspace_publication();