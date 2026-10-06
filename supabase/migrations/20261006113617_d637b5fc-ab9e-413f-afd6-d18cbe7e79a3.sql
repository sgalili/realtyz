CREATE OR REPLACE FUNCTION public.rz_is_synthetic_email(_e text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _e IS NULL OR btrim(_e) = '' OR _e ~* '@(whatsapp\.)?realtyz\.local$'
$$;

CREATE OR REPLACE FUNCTION public.rz_phone_label(_p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(_p,''), '\D', '', 'g') ~ '^9725\d{8}$'
      THEN '0' || substr(regexp_replace(_p, '\D', '', 'g'), 4, 2) || '-' || substr(regexp_replace(_p, '\D', '', 'g'), 6)
    WHEN regexp_replace(coalesce(_p,''), '\D', '', 'g') ~ '^05\d{8}$'
      THEN substr(regexp_replace(_p, '\D', '', 'g'), 1, 3) || '-' || substr(regexp_replace(_p, '\D', '', 'g'), 4)
    ELSE NULL END
$$;

-- Workspace name fallback: never a synthetic email; use the owner's mobile.
CREATE OR REPLACE FUNCTION public.rz_ws_name_default() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ph text;
BEGIN
  IF NEW.workspace_name IS NULL OR btrim(NEW.workspace_name) = '' OR public.rz_is_synthetic_email(NEW.workspace_name) THEN
    SELECT public.rz_phone_label(phone) INTO _ph FROM public.profiles WHERE id = NEW.workspace_owner_id;
    IF _ph IS NOT NULL THEN NEW.workspace_name := _ph; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rz_ws_name_default ON public.workspace_memberships;
CREATE TRIGGER trg_rz_ws_name_default BEFORE INSERT OR UPDATE OF workspace_name ON public.workspace_memberships
FOR EACH ROW EXECUTE FUNCTION public.rz_ws_name_default();

-- Connected Gmail replaces the temporary WhatsApp email on the profile.
CREATE OR REPLACE FUNCTION public.rz_adopt_google_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text := lower(btrim(coalesce(NEW.credentials->>'account_name', NEW.credentials->'verified_identity'->>'email', '')));
BEGIN
  IF NEW.platform IN ('gmail','google_calendar') AND _email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND NOT public.rz_is_synthetic_email(_email) THEN
    UPDATE public.profiles SET email = _email
     WHERE id = NEW.workspace_owner_id AND public.rz_is_synthetic_email(email);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rz_adopt_google_email ON public.social_connections;
CREATE TRIGGER trg_rz_adopt_google_email AFTER INSERT OR UPDATE OF credentials ON public.social_connections
FOR EACH ROW EXECUTE FUNCTION public.rz_adopt_google_email();

-- Backfill existing accounts.
UPDATE public.profiles p SET email = lower(sc.credentials->>'account_name')
FROM public.social_connections sc
WHERE sc.workspace_owner_id = p.id AND sc.platform = 'gmail'
  AND public.rz_is_synthetic_email(p.email)
  AND (sc.credentials->>'account_name') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

UPDATE public.workspace_memberships wm SET workspace_name = public.rz_phone_label(p.phone)
FROM public.profiles p
WHERE p.id = wm.workspace_owner_id AND public.rz_phone_label(p.phone) IS NOT NULL
  AND (wm.workspace_name IS NULL OR btrim(wm.workspace_name) = '' OR public.rz_is_synthetic_email(wm.workspace_name));

-- Broker-posted listings by owner-only accounts become broker accounts.
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT l.user_id, 'agent'::public.app_role FROM public.listings l
WHERE l.features->>'publisher_type' = 'broker'
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = l.user_id AND r.role = 'property_owner')
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = l.user_id AND r.role <> 'property_owner')
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM public.user_roles r USING public.listings l
WHERE r.user_id = l.user_id AND r.role = 'property_owner' AND l.features->>'publisher_type' = 'broker'
  AND EXISTS (SELECT 1 FROM public.user_roles a WHERE a.user_id = r.user_id AND a.role = 'agent')
  AND NOT EXISTS (SELECT 1 FROM public.listings l2 WHERE l2.user_id = r.user_id AND coalesce(l2.features->>'publisher_type','') = 'private');