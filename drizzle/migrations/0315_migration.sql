CREATE OR REPLACE FUNCTION public.sync_signup_office_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE office text := left(btrim(COALESCE(NEW.signup_details->>'office_name','')),200);
BEGIN
  IF office = '' OR NEW.signup_details IS NOT DISTINCT FROM OLD.signup_details THEN RETURN NEW; END IF;
  INSERT INTO public.white_label_settings(user_id, agency_name) VALUES (NEW.id, office)
  ON CONFLICT (user_id) DO UPDATE SET agency_name = EXCLUDED.agency_name, updated_at = now()
  WHERE NULLIF(btrim(COALESCE(public.white_label_settings.agency_name,'')),'') IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_signup_office_name ON public.profiles;
CREATE TRIGGER trg_sync_signup_office_name AFTER UPDATE OF signup_details ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_signup_office_name();
-- Backfill accounts that signed up with an office name that never reached office settings.
INSERT INTO public.white_label_settings(user_id, agency_name)
SELECT p.id, left(btrim(p.signup_details->>'office_name'),200) FROM public.profiles p
WHERE NULLIF(btrim(COALESCE(p.signup_details->>'office_name','')),'') IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET agency_name = EXCLUDED.agency_name, updated_at = now()
WHERE NULLIF(btrim(COALESCE(public.white_label_settings.agency_name,'')),'') IS NULL;