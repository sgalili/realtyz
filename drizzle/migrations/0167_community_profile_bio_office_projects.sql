ALTER TABLE public.profiles ADD COLUMN public_bio text, ADD COLUMN imported_public_bio text;
ALTER TABLE public.developer_projects ADD COLUMN is_public boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.community_profile_page(_user uuid)
RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text, avatar_url text, logo_url text, city text, service_areas text[], bio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT c.id,c.full_name,c.category,c.office_name,c.license_number,nullif(p.avatar_url,''),coalesce(nullif(w.logo_url,''),nullif(w.landscape_logo_url,'')),coalesce(nullif(p.locked_broker_city,''),nullif(w.office_city,''),nullif(p.city,'')),p.service_areas::text[],
CASE WHEN length(btrim(coalesce(p.public_bio,'')))>=50 THEN btrim(p.public_bio) ELSE nullif(btrim(p.imported_public_bio),'') END
FROM public.community_profile_cards(ARRAY[_user]) c JOIN public.profiles p ON p.id=c.id LEFT JOIN public.white_label_settings w ON w.user_id=p.id;
$$;
REVOKE ALL ON FUNCTION public.community_profile_page(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_profile_page(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.community_office_members(_user uuid)
RETURNS TABLE(id uuid,full_name text,category text,office_name text,license_number text,avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH office AS (SELECT w.brokerage_name,w.office_city,w.office_address FROM public.white_label_settings w WHERE w.user_id=_user AND nullif(btrim(w.brokerage_name),'') IS NOT NULL AND (nullif(btrim(w.office_city),'') IS NOT NULL OR nullif(btrim(w.office_address),'') IS NOT NULL)), members AS (
SELECT w.user_id FROM public.white_label_settings w JOIN office o ON btrim(w.brokerage_name)=btrim(o.brokerage_name) AND coalesce(btrim(w.office_city),'')=coalesce(btrim(o.office_city),'') AND coalesce(btrim(w.office_address),'')=coalesce(btrim(o.office_address),'') WHERE public.is_community_chat_member(w.user_id))
SELECT c.id,c.full_name,c.category,c.office_name,c.license_number,p.avatar_url FROM public.community_profile_cards(ARRAY(SELECT user_id FROM members ORDER BY user_id LIMIT 200)) c JOIN public.profiles p ON p.id=c.id WHERE EXISTS(SELECT 1 FROM public.community_profile_page(_user));
$$;
REVOKE ALL ON FUNCTION public.community_office_members(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_office_members(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.community_public_projects(_user uuid)
RETURNS TABLE(id uuid,name text,city text,address text,description text,image_url text,price_from numeric,available_units integer,delivery_date text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT d.id,d.name,d.city,d.address,d.description,d.image_url,d.price_from,d.available_units,d.delivery_date FROM public.developer_projects d WHERE d.workspace_owner_id=_user AND d.is_public AND d.status NOT IN ('archived','deleted','closed','sold') AND EXISTS(SELECT 1 FROM public.community_profile_page(_user) p WHERE p.category='developer') ORDER BY d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.community_public_projects(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_public_projects(uuid) TO authenticated,service_role;