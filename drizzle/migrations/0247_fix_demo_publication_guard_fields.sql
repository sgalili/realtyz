CREATE OR REPLACE FUNCTION public.block_demo_workspace_publication()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE j jsonb := to_jsonb(NEW);
BEGIN
  IF NEW.workspace_owner_id = '5b59424b-e309-406e-bcc4-65735b2eca50'::uuid THEN
    IF (TG_TABLE_NAME = 'listings' AND COALESCE((j->>'is_published')::boolean, false))
       OR (TG_TABLE_NAME = 'developer_projects' AND COALESCE((j->>'is_public')::boolean, false)) THEN
      RAISE EXCEPTION 'חשבון הדמו מיועד לצפייה בלבד ואינו מאפשר פרסום';
    END IF;
  END IF;
  RETURN NEW;
END $function$;