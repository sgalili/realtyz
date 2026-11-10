CREATE TABLE public.account_lead_limits (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 daily_count integer CHECK (daily_count IS NULL OR daily_count > 0),
 daily_spend_ils numeric CHECK (daily_spend_ils IS NULL OR daily_spend_ils > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_lead_limits TO authenticated;
GRANT ALL ON public.account_lead_limits TO service_role;
ALTER TABLE public.account_lead_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_lead_limits_scope ON public.account_lead_limits FOR ALL TO authenticated USING (public.can_access_workspace_owner(user_id)) WITH CHECK (public.can_access_workspace_owner(user_id));
CREATE TABLE public.listing_source_tombstones (
 workspace_owner_id uuid NOT NULL, source_key text NOT NULL, removed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_owner_id,source_key)
);
GRANT ALL ON public.listing_source_tombstones TO service_role;
ALTER TABLE public.listing_source_tombstones ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.listing_source_identity(_url text,_external text,_source text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN coalesce(_url,'') ~* '(^https?://)?([^/]+\.)?yad2\.co\.il/.*/item/' THEN 'yad2:'||lower(substring(_url from '/item/([^/?#]+)')) WHEN _source='yad2' AND nullif(trim(_external),'') IS NOT NULL THEN 'yad2:'||lower(trim(_external)) WHEN nullif(trim(_url),'') IS NOT NULL THEN 'url:'||regexp_replace(regexp_replace(lower(trim(_url)),'[?#].*$',''),'/+$','') WHEN nullif(trim(_external),'') IS NOT NULL THEN coalesce(_source,'')||':'||lower(trim(_external)) END
$$;
ALTER TABLE public.listings ADD COLUMN canonical_duplicate_of uuid;
COMMENT ON COLUMN public.listings.canonical_duplicate_of IS 'Exact-source historical duplicate; retained for references but excluded from active inventory.';
WITH ranked AS (
 SELECT id, first_value(id) OVER (PARTITION BY coalesce(workspace_owner_id,user_id),public.listing_source_identity(source_url,external_id,source) ORDER BY (status IN ('discarded','sold','removed','deleted','closed','archived','off_market','נמכר','הוסר')) DESC, (coalesce(is_published,false) OR coalesce(affiliate_enabled,false)) DESC,updated_at DESC,id) keeper,
 row_number() OVER (PARTITION BY coalesce(workspace_owner_id,user_id),public.listing_source_identity(source_url,external_id,source) ORDER BY (status IN ('discarded','sold','removed','deleted','closed','archived','off_market','נמכר','הוסר')) DESC, (coalesce(is_published,false) OR coalesce(affiliate_enabled,false)) DESC,updated_at DESC,id) rn
 FROM public.listings WHERE public.listing_source_identity(source_url,external_id,source) IS NOT NULL
) UPDATE public.listings l SET canonical_duplicate_of=r.keeper FROM ranked r WHERE l.id=r.id AND r.rn>1;
INSERT INTO public.listing_source_tombstones(workspace_owner_id,source_key)
 SELECT DISTINCT coalesce(workspace_owner_id,user_id),public.listing_source_identity(source_url,external_id,source) FROM public.listings WHERE status IN ('discarded','sold','removed','deleted','closed','archived','off_market','נמכר','הוסר') AND public.listing_source_identity(source_url,external_id,source) IS NOT NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.guard_inventory_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; owner uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  k:=public.listing_source_identity(OLD.source_url,OLD.external_id,OLD.source); owner:=coalesce(OLD.workspace_owner_id,OLD.user_id);
  IF k IS NOT NULL THEN INSERT INTO public.listing_source_tombstones(workspace_owner_id,source_key) VALUES(owner,k) ON CONFLICT DO NOTHING; END IF;
  RETURN OLD;
 END IF;
 k:=public.listing_source_identity(NEW.source_url,NEW.external_id,NEW.source); owner:=coalesce(NEW.workspace_owner_id,NEW.user_id);
 IF TG_OP='UPDATE' THEN
  IF NEW.canonical_duplicate_of IS DISTINCT FROM OLD.canonical_duplicate_of THEN RAISE EXCEPTION 'לא ניתן לשנות את זהות הנכס הקנונית'; END IF;
  IF OLD.status IN ('discarded','sold','removed','deleted','closed','archived','off_market','נמכר','הוסר') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'נכס שנמכר או הוסר לא ניתן להחזיר באמצעות ייבוא או פרסום'; END IF;
 END IF;
 IF NEW.canonical_duplicate_of IS NOT NULL AND (coalesce(NEW.is_published,false) OR coalesce(NEW.affiliate_enabled,false)) THEN NEW.is_published:=false; NEW.affiliate_enabled:=false; END IF;
 IF NEW.status IN ('discarded','sold','removed','deleted','closed','archived','off_market','נמכר','הוסר') THEN
  NEW.is_published:=false; NEW.affiliate_enabled:=false;
  IF k IS NOT NULL THEN INSERT INTO public.listing_source_tombstones(workspace_owner_id,source_key) VALUES(owner,k) ON CONFLICT DO NOTHING; END IF;
 ELSE
  IF k IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||k,91));
   IF EXISTS(SELECT 1 FROM public.listing_source_tombstones WHERE workspace_owner_id=owner AND source_key=k) THEN RAISE EXCEPTION 'הנכס הוסר או נמכר בעבר ולא ייובא מחדש'; END IF;
   IF EXISTS(SELECT 1 FROM public.listings l WHERE coalesce(l.workspace_owner_id,l.user_id)=owner AND public.listing_source_identity(l.source_url,l.external_id,l.source)=k AND l.id<>NEW.id AND l.canonical_duplicate_of IS NULL) AND NEW.canonical_duplicate_of IS NULL THEN RAISE EXCEPTION 'הנכס כבר קיים בנכסים שלי' USING ERRCODE='23505'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_inventory_source_guard BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_source();
CREATE TRIGGER inventory_source_removal AFTER DELETE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_source();
CREATE OR REPLACE FUNCTION public.guard_account_lead_budget() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE limits public.account_lead_limits; spent numeric; used integer; already_paid boolean;
BEGIN
 IF NEW.type<>'affiliate_lead_charge' OR NEW.amount_ils>=0 THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,92));
 SELECT * INTO limits FROM public.account_lead_limits WHERE user_id=NEW.user_id;
 IF limits.user_id IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce(-sum(amount_ils),0),count(DISTINCT coalesce(reference_id,id)) INTO spent,used FROM public.credit_transactions WHERE user_id=NEW.user_id AND type='affiliate_lead_charge' AND amount_ils<0 AND created_at>now()-interval '24 hours';
 SELECT EXISTS(SELECT 1 FROM public.credit_transactions WHERE user_id=NEW.user_id AND type='affiliate_lead_charge' AND amount_ils<0 AND reference_id=NEW.reference_id AND created_at>now()-interval '24 hours') INTO already_paid;
 IF (limits.daily_spend_ils IS NOT NULL AND spent-NEW.amount_ils>limits.daily_spend_ils) OR (limits.daily_count IS NOT NULL AND NOT already_paid AND used>=limits.daily_count) THEN RAISE EXCEPTION 'החיוב נעצר: הגעת למגבלת הפניות או ההוצאה ב־24 השעות האחרונות' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_lead_budget_guard BEFORE INSERT ON public.credit_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_account_lead_budget();
REVOKE ALL ON FUNCTION public.guard_inventory_source(),public.guard_account_lead_budget() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_inventory_source(),public.guard_account_lead_budget() TO service_role;
CREATE INDEX account_lead_budget_charges ON public.credit_transactions(user_id,created_at) WHERE type='affiliate_lead_charge' AND amount_ils<0;