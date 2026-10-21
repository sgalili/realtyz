ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS primary_user_type text;
COMMENT ON COLUMN public.profiles.primary_user_type IS 'Display-only primary signup identity; authorization always comes from user_roles. Contractor shares developer permissions.';
CREATE OR REPLACE FUNCTION public.protect_primary_user_type() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.primary_user_type IS DISTINCT FROM OLD.primary_user_type AND current_user NOT IN ('postgres','supabase_admin','service_role') THEN RAISE EXCEPTION 'primary_type_server_managed'; END IF; RETURN NEW; END $$;
CREATE TRIGGER protect_primary_user_type BEFORE UPDATE OF primary_user_type ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_primary_user_type();
CREATE OR REPLACE FUNCTION public.select_signup_user_type(_type text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); expected public.app_role; saved text; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF _type NOT IN ('broker','developer','contractor','property_owner','property_seeker') OR _type IS NULL THEN RAISE EXCEPTION 'invalid_signup_type'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 expected:=CASE _type WHEN 'broker' THEN 'agent'::public.app_role WHEN 'developer' THEN 'developer'::public.app_role WHEN 'contractor' THEN 'developer'::public.app_role WHEN 'property_owner' THEN 'property_owner'::public.app_role ELSE 'property_seeker'::public.app_role END;
 PERFORM public.ensure_profile_row(uid);
 SELECT primary_user_type INTO saved FROM public.profiles WHERE id=uid FOR UPDATE;
 IF saved IS NOT NULL AND saved<>_type THEN RAISE EXCEPTION 'primary_type_already_selected'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=uid AND role NOT IN ('user','affiliate',expected)) THEN RAISE EXCEPTION 'existing_core_role_conflict'; END IF;
 IF _type='broker' THEN result:=public.register_as_broker(NULL);
 ELSIF _type IN ('developer','contractor') THEN result:=public.register_as_developer(NULL);
 ELSIF _type='property_owner' THEN result:=public.register_as_property_owner(NULL);
 ELSE result:=public.register_as_property_seeker(NULL); END IF;
 IF COALESCE((result->>'ok')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'signup_type_incomplete'; END IF;
 UPDATE public.profiles SET primary_user_type=_type WHERE id=uid;
 UPDATE public.workspace_memberships SET account_type=CASE WHEN _type IN ('developer','contractor') THEN _type WHEN _type='broker' THEN 'real_estate' ELSE _type END WHERE user_id=uid AND workspace_owner_id=uid;
 RETURN jsonb_build_object('ok',true,'type',_type,'role',expected);
END $$;
REVOKE ALL ON FUNCTION public.select_signup_user_type(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.select_signup_user_type(text) TO authenticated,service_role;