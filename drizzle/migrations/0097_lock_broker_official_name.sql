CREATE OR REPLACE FUNCTION public.official_broker_name(_uid uuid, _license text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(r.holder_name),'') FROM public.official_brokers_registry r WHERE r.license_number = _license ORDER BY r.source_updated_at DESC NULLS LAST LIMIT 1),
    (SELECT NULLIF(btrim(v.registry_holder_name),'') FROM public.broker_license_verifications v WHERE v.user_id = _uid AND v.license_number = _license ORDER BY v.verified_at DESC LIMIT 1)
  )
$$;
REVOKE ALL ON FUNCTION public.official_broker_name(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_broker_official_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _name text;
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.broker_license_number,'')),'') IS NOT NULL THEN
    _name := public.official_broker_name(NEW.id, btrim(NEW.broker_license_number));
    IF _name IS NOT NULL THEN NEW.full_name := _name; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_broker_official_name ON public.profiles;
CREATE TRIGGER trg_enforce_broker_official_name
BEFORE INSERT OR UPDATE OF full_name, broker_license_number ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_broker_official_name();

UPDATE public.profiles p SET full_name = public.official_broker_name(p.id, btrim(p.broker_license_number))
WHERE NULLIF(btrim(COALESCE(p.broker_license_number,'')),'') IS NOT NULL
  AND public.official_license_exists(btrim(p.broker_license_number))
  AND public.official_broker_name(p.id, btrim(p.broker_license_number)) IS NOT NULL
  AND p.full_name IS DISTINCT FROM public.official_broker_name(p.id, btrim(p.broker_license_number));