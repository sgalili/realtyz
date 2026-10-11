ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS partner_terms_accepted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS partner_terms_version text;
UPDATE public.profiles p SET partner_terms_accepted_at=a.terms_accepted_at, partner_terms_version=a.terms_version FROM public.affiliate_profiles a WHERE a.user_id=p.id AND a.terms_accepted_at IS NOT NULL AND p.partner_terms_accepted_at IS NULL;
CREATE OR REPLACE FUNCTION public.protect_partner_consent() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') AND (NEW.partner_terms_accepted_at IS DISTINCT FROM OLD.partner_terms_accepted_at OR NEW.partner_terms_version IS DISTINCT FROM OLD.partner_terms_version) THEN RAISE EXCEPTION 'Partner consent must be recorded through acceptance'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER protect_partner_consent BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_partner_consent();
CREATE OR REPLACE FUNCTION public.accept_affiliate_terms(_version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_registration jsonb; v_at timestamptz; BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF _version IS DISTINCT FROM 'affiliate-marketing-2026-09' THEN RAISE EXCEPTION 'invalid_terms_version'; END IF;
 v_registration:=public.register_as_affiliate(NULL,NULL);
 IF NOT COALESCE((v_registration->>'ok')::boolean,false) THEN RAISE EXCEPTION 'registration_failed'; END IF;
 SELECT partner_terms_accepted_at INTO v_at FROM public.profiles WHERE id=v_uid FOR UPDATE;
 IF v_at IS NULL THEN
  v_at:=now();
  UPDATE public.profiles SET partner_terms_accepted_at=v_at, partner_terms_version=_version WHERE id=v_uid;
  INSERT INTO public.audit_logs(user_id,action,details) VALUES(v_uid,'partner_terms_accepted',jsonb_build_object('version',_version,'accepted_at',v_at));
 END IF;
 INSERT INTO public.affiliate_profiles(user_id,terms_version,terms_accepted_at) VALUES(v_uid,_version,v_at) ON CONFLICT(user_id) DO UPDATE SET terms_version=excluded.terms_version,terms_accepted_at=excluded.terms_accepted_at;
 RETURN jsonb_build_object('ok',true); END $$;
REVOKE ALL ON FUNCTION public.accept_affiliate_terms(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_affiliate_terms(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _user_id IS NOT NULL AND NOT public.has_role(_user_id,'developer') AND NOT public.has_role(_user_id,'property_owner') AND NOT public.has_role(_user_id,'property_seeker') AND public.affiliate_tier3_eligible(_user_id)
$$;
REVOKE ALL ON FUNCTION public.partner_can_view_closing(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_can_view_closing(uuid) TO authenticated,service_role;