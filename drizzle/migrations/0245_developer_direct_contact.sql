ALTER TABLE public.developers ADD COLUMN IF NOT EXISTS contact_name text, ADD COLUMN IF NOT EXISTS contact_phone text, ADD COLUMN IF NOT EXISTS contact_gender text CHECK (contact_gender IS NULL OR contact_gender IN ('male','female'));

CREATE OR REPLACE FUNCTION public.admin_set_developer_contact(_owner uuid, _name text, _phone text, _gender text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  IF _phone IS NOT NULL AND _phone !~ '^9725[0-9]{8}$' THEN RAISE EXCEPTION 'Invalid mobile'; END IF;
  IF _gender IS NOT NULL AND _gender NOT IN ('male','female') THEN RAISE EXCEPTION 'Invalid gender'; END IF;
  UPDATE developers SET contact_name = NULLIF(btrim(_name), ''), contact_phone = _phone, contact_gender = _gender
   WHERE id = (SELECT id FROM developers WHERE workspace_owner_id = _owner ORDER BY created_at LIMIT 1);
  IF NOT FOUND THEN RAISE EXCEPTION 'Developer not found'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.admin_set_developer_contact(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_developer_contact(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_marketing_contacts(_owners uuid[])
 RETURNS TABLE(owner_id uuid, company_id uuid, company_name text, contact_name text, contact_phone text, contact_gender text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  RETURN QUERY SELECT o, m.id, m.name,
    COALESCE(m.contact_name, dv.contact_name), COALESCE(m.contact_phone, dv.contact_phone), COALESCE(m.contact_gender, dv.contact_gender)
  FROM unnest(_owners) o
  LEFT JOIN LATERAL (SELECT d.contact_name, d.contact_phone, d.contact_gender FROM developers d WHERE d.workspace_owner_id = o ORDER BY d.created_at LIMIT 1) dv ON true
  LEFT JOIN LATERAL (
    SELECT mc.* FROM marketing_companies mc WHERE mc.id = COALESCE(
      (SELECT d.marketing_company_id FROM developers d WHERE d.workspace_owner_id = o AND d.marketing_company_id IS NOT NULL ORDER BY d.created_at LIMIT 1),
      (SELECT p.marketing_company_id FROM developer_projects p WHERE p.workspace_owner_id = o AND p.marketing_company_id IS NOT NULL ORDER BY p.created_at LIMIT 1))
  ) m ON true;
END $function$;