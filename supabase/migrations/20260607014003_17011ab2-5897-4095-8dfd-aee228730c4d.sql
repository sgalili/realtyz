ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alias text,
  ADD COLUMN IF NOT EXISTS direct_channels jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Normalize alias: lowercase, alphanumerics/dot/dash/underscore only, max 32 chars.
CREATE OR REPLACE FUNCTION public.normalize_email_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email_alias IS NOT NULL THEN
    NEW.email_alias := lower(regexp_replace(NEW.email_alias, '[^a-z0-9._-]', '', 'gi'));
    IF length(NEW.email_alias) = 0 THEN
      NEW.email_alias := NULL;
    ELSIF length(NEW.email_alias) > 32 THEN
      NEW.email_alias := substr(NEW.email_alias, 1, 32);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_email_alias ON public.profiles;
CREATE TRIGGER trg_normalize_email_alias
BEFORE INSERT OR UPDATE OF email_alias ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_email_alias();