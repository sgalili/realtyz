-- Read-only authorization checks; transaction restores all caller context.
BEGIN;
DO $$
DECLARE actor uuid; target uuid; rec record;
BEGIN
 SELECT id INTO actor FROM public.profiles ORDER BY id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'A real account is required'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 IF NOT public.profile_management_access(actor) THEN RAISE EXCEPTION 'Owner must be allowed to manage self'; END IF;
 SELECT id INTO target FROM public.profiles WHERE id<>actor ORDER BY id LIMIT 1;
 IF target IS NULL THEN RAISE EXCEPTION 'A second account is required'; END IF;
 IF NOT public.has_role(actor,'super_admin') AND public.profile_management_access(target) THEN RAISE EXCEPTION 'Third party must not manage peer'; END IF;
 FOR rec IN SELECT l.id,l.workspace_owner_id,l.assigned_to,l.lead_category FROM public.leads l ORDER BY l.id LIMIT 50 LOOP
   IF NOT public.ws_current_access(rec.workspace_owner_id) AND EXISTS(SELECT 1 FROM public.lead_profile_access(rec.id)) THEN RAISE EXCEPTION 'Cross-workspace profile leaked'; END IF;
   IF NOT (public.partner_can_view_closing(actor) AND (rec.workspace_owner_id=actor OR rec.assigned_to=actor) AND coalesce(rec.lead_category,'') NOT IN ('broker','affiliate','developer','partner')) AND EXISTS(SELECT 1 FROM public.lead_profile_access(rec.id) WHERE phone_number IS NOT NULL) THEN RAISE EXCEPTION 'Unrelated or nonbroker personal contact leaked'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 IF public.profile_management_access(target) THEN RAISE EXCEPTION 'Anonymous management accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.lead_profile_access(target)) THEN RAISE EXCEPTION 'Anonymous profile accepted'; END IF;
END $$;
ROLLBACK;