DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.charge_lead_commission(uuid,integer,uuid,uuid)'::regprocedure) INTO def;
  IF position('brokers_only_no_charge' in def) = 0 THEN
    def := regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n -- brokers_only_no_charge: broker SaaS mode never charges per-lead fees.\n IF EXISTS(SELECT 1 FROM public.platform_system_settings WHERE platform_mode=''brokers_only'') THEN RETURN jsonb_build_object(''ok'',true,''charged'',0,''brokers_only'',true); END IF;\n', '');
    EXECUTE def;
  END IF;
END $$;