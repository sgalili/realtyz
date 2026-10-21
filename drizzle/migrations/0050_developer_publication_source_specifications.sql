DO $patch$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('public.publish_developer_project(uuid,text)'::regprocedure) INTO body;
 body:=replace(body,'jsonb_array_elements(COALESCE(p.source_details->''buildings'',''[]''::jsonb))','jsonb_array_elements(CASE WHEN jsonb_typeof(p.source_details->''buildings'')=''array'' THEN p.source_details->''buildings'' ELSE ''[]''::jsonb END)');
 body:=replace(body,'''developer_unit_details'',COALESCE(u,''{}''::jsonb)', '''specifications'',COALESCE(p.source_details->''manual''->''specifications'',p.source_details->''specifications'',p.source_details->''specification''),''developer_unit_details'',COALESCE(u,''{}''::jsonb)');
 EXECUTE body;
END $patch$;