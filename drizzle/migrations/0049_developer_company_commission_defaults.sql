ALTER TABLE public.developers ADD COLUMN IF NOT EXISTS commission_config jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.developers.commission_config IS 'Company-wide authored commission defaults; workspace scoped, never overwritten by source imports.';
CREATE OR REPLACE FUNCTION public.set_developer_company_commissions(_company uuid,_config jsonb,_apply_existing boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ws uuid:=public.current_workspace_owner(); n integer:=0; f jsonb:=_config->'defaults';
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(ws) OR NOT(public.has_role(ws,'developer') OR public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'company_access_denied'; END IF;
 IF NOT public.developer_fees_valid(f,'sale',1) OR octet_length(_config::text)>40000 THEN RAISE EXCEPTION 'developer_commissions_required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(f->'caps') c WHERE c.value::numeric>100000) OR (f->>'form')::numeric>500 OR (f->>'whatsapp')::numeric>500 OR (f->>'phone')::numeric>500 THEN RAISE EXCEPTION 'invalid_commission_limits'; END IF;
 UPDATE public.developers SET commission_config=jsonb_build_object('defaults',f) WHERE id=_company AND workspace_owner_id=ws;
 IF NOT FOUND THEN RAISE EXCEPTION 'company_access_denied'; END IF;
 IF _apply_existing THEN
  UPDATE public.developer_projects SET commission_config=jsonb_set(commission_config,'{defaults}',f,true) WHERE developer_id=_company AND workspace_owner_id=ws;
  GET DIAGNOSTICS n=ROW_COUNT;
 END IF;
 RETURN jsonb_build_object('ok',true,'updated_projects',n);
END $$;
REVOKE ALL ON FUNCTION public.set_developer_company_commissions(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_developer_company_commissions(uuid,jsonb,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.inherit_developer_company_fees() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c jsonb;
BEGIN
 IF NEW.commission_config->'defaults' IS NULL THEN
  SELECT commission_config INTO c FROM public.developers WHERE id=NEW.developer_id AND workspace_owner_id=NEW.workspace_owner_id;
  IF c->'defaults' IS NOT NULL THEN NEW.commission_config:=NEW.commission_config||jsonb_build_object('defaults',c->'defaults'); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER developer_project_company_fees BEFORE INSERT ON public.developer_projects FOR EACH ROW EXECUTE FUNCTION public.inherit_developer_company_fees();
DO $patch$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('public.publish_developer_project(uuid,text)'::regprocedure) INTO body;
 body:=replace(body,'d:=CASE WHEN COALESCE(p.source_details', 'p.commission_config:=COALESCE(co.commission_config,''{}''::jsonb)||p.commission_config; d:=CASE WHEN COALESCE(p.source_details');
 body:=replace(body,'COALESCE(p.description,''''),COALESCE(p.description,''''),pr,p.city,p.neighborhood,p.address', 'COALESCE(NULLIF(u->>''description'',''''),p.description,''''),COALESCE(NULLIF(u->>''description'',''''),p.description,''''),pr,COALESCE(NULLIF(u->>''city'',''''),p.city),COALESCE(NULLIF(u->>''neighborhood'',''''),p.neighborhood),COALESCE(NULLIF(u->>''address'',''''),(SELECT b->>''address'' FROM jsonb_array_elements(COALESCE(p.source_details->''buildings'',''[]''::jsonb)) b WHERE b->>''source_building_id''=u->>''building_id'' LIMIT 1),p.address)');
 body:=replace(body,'''lead_daily_limits'',fees->''caps'',''whatsapp'',true,''phone'',true,''form'',true', '''lead_daily_limits'',fees->''caps'',''questions'',COALESCE(fees->''questions'',''[]''::jsonb),''questions_phone'',COALESCE(fees->''questions_phone'',''[]''::jsonb),''form_fields'',COALESCE(fees->''form_fields'',''[]''::jsonb),''whatsapp'',true,''phone'',true,''form'',true');
 EXECUTE body;
END $patch$;