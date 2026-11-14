CREATE OR REPLACE FUNCTION public.get_listing_profile_targets(_listing_ids uuid[])
RETURNS TABLE(listing_id uuid, profile_user_id uuid, office_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
WITH allowed AS (
 SELECT l.* FROM public.listings l WHERE auth.uid() IS NOT NULL AND l.id=ANY(_listing_ids[1:200]) AND (public.ws_current_access(l.workspace_owner_id) OR (l.is_published AND l.status='live' AND l.affiliate_enabled AND NOT coalesce(l.distribution_paused,false)))
), targets AS (
 SELECT l.id, l.source, l.source_metadata, CASE WHEN coalesce(l.source,'manual')='manual' THEN coalesce(l.workspace_owner_id,l.user_id)
 ELSE (SELECT min(p.id::text)::uuid FROM public.profiles p WHERE p.broker_license_number=l.source_metadata->>'broker_license_number' AND public.is_community_chat_member(p.id) AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant')) AND l.source_metadata->'broker_license_evidence'->>'source'='source_ad' AND l.source_metadata->'broker_license_evidence'->>'number'=p.broker_license_number AND l.source_metadata->'broker_license_evidence'->>'source_url' ~ '^https://([a-zA-Z0-9-]+\.)?yad2\.co\.il/.*item/[a-zA-Z0-9_-]+' HAVING count(*)=1) END AS target FROM allowed l
)
SELECT t.id,t.target,CASE WHEN coalesce(t.source,'manual')='manual' OR EXISTS(SELECT 1 FROM public.white_label_settings w WHERE w.user_id=t.target AND nullif(btrim(coalesce(t.source_metadata->>'office_name',t.source_metadata->>'agency_name')),'') IN (nullif(btrim(w.brokerage_name),''),nullif(btrim(w.agency_name),''))) THEN t.target ELSE NULL END
FROM targets t WHERE t.target IS NOT NULL AND public.is_community_chat_member(t.target);
$$;
REVOKE ALL ON FUNCTION public.get_listing_profile_targets(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_listing_profile_targets(uuid[]) TO authenticated,service_role;