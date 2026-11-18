ALTER TABLE public.marketing_companies ADD COLUMN contact_name text CHECK (contact_name IS NULL OR length(btrim(contact_name)) BETWEEN 1 AND 120);
ALTER TABLE public.marketing_companies ADD COLUMN contact_phone text CHECK (contact_phone IS NULL OR contact_phone ~ '^9725\d{8}$');
ALTER TABLE public.marketing_companies ADD COLUMN contact_gender text CHECK (contact_gender IS NULL OR contact_gender IN ('male','female'));

CREATE OR REPLACE FUNCTION public.admin_marketing_contacts(_owners uuid[])
RETURNS TABLE(owner_id uuid, company_id uuid, company_name text, contact_name text, contact_phone text, contact_gender text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
  RETURN QUERY SELECT o, m.id, m.name, m.contact_name, m.contact_phone, m.contact_gender
  FROM unnest(_owners) o
  LEFT JOIN LATERAL (
    SELECT mc.* FROM marketing_companies mc WHERE mc.id = COALESCE(
      (SELECT d.marketing_company_id FROM developers d WHERE d.workspace_owner_id = o AND d.marketing_company_id IS NOT NULL ORDER BY d.created_at LIMIT 1),
      (SELECT p.marketing_company_id FROM developer_projects p WHERE p.workspace_owner_id = o AND p.marketing_company_id IS NOT NULL ORDER BY p.created_at LIMIT 1))
  ) m ON true;
END $$;
REVOKE ALL ON FUNCTION public.admin_marketing_contacts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketing_contacts(uuid[]) TO authenticated;