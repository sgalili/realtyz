CREATE OR REPLACE FUNCTION public.monitor_distribution_queue() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item record; checked int:=0;
BEGIN
 FOR item IN SELECT id FROM public.campaign_activity_queue WHERE activity_type='fb_group_post' AND status IN ('pending','ready') AND scheduled_for<=now() ORDER BY scheduled_for,id LIMIT 100 LOOP
  UPDATE public.campaign_activity_queue SET scheduled_for=now() WHERE id=item.id AND status IN ('pending','ready');
  checked:=checked+1;
 END LOOP;
 RETURN checked;
END $$;
REVOKE ALL ON FUNCTION public.monitor_distribution_queue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_distribution_queue() TO service_role;
DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.reserve_distribution_slot()'::regprocedure) INTO body;
 body:=replace(body,'page_key text; i int;','page_key text; i int; reserved boolean:=false;');
 body:=replace(body,'THEN EXIT; END IF;','THEN reserved:=true; EXIT; END IF;');
 body:=replace(body,'IF i=365 THEN','IF NOT reserved THEN');
 EXECUTE body;
END $$;