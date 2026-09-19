ALTER TABLE public.affiliate_profiles
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_holder_name text,
  ADD COLUMN IF NOT EXISTS license_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS license_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_verified_by uuid,
  ADD COLUMN IF NOT EXISTS license_rejection_reason text,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'affiliate_profiles_license_status_check'
      AND conrelid = 'public.affiliate_profiles'::regclass
  ) THEN
    ALTER TABLE public.affiliate_profiles
      ADD CONSTRAINT affiliate_profiles_license_status_check
      CHECK (license_status IN ('none', 'pending', 'verified', 'rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.affiliate_tier3_eligible(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affiliate_profiles
    WHERE user_id = _user_id
      AND license_status = 'verified'
      AND coalesce(btrim(license_number), '') <> ''
  );
$$;

CREATE OR REPLACE FUNCTION public.submit_affiliate_license(_license_number text, _holder_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_num text := btrim(coalesce(_license_number, ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF length(v_num) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_license_number');
  END IF;

  INSERT INTO public.affiliate_profiles (user_id, license_number, license_holder_name, license_status, license_submitted_at, license_rejection_reason)
  VALUES (v_uid, v_num, nullif(btrim(coalesce(_holder_name, '')), ''), 'pending', now(), NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    license_number = excluded.license_number,
    license_holder_name = coalesce(excluded.license_holder_name, public.affiliate_profiles.license_holder_name),
    license_status = 'pending',
    license_submitted_at = now(),
    license_verified_at = NULL,
    license_verified_by = NULL,
    license_rejection_reason = NULL,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_affiliate_license(_user_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'super_admin') OR public.has_role(v_uid, 'admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.affiliate_profiles SET
    license_status = CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
    license_verified_at = CASE WHEN _approve THEN now() ELSE NULL END,
    license_verified_by = v_uid,
    license_rejection_reason = CASE WHEN _approve THEN NULL ELSE nullif(btrim(coalesce(_reason, '')), '') END,
    updated_at = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'affiliate_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _approve THEN 'verified' ELSE 'rejected' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_affiliate_terms(_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  INSERT INTO public.affiliate_profiles (user_id, terms_version, terms_accepted_at)
  VALUES (v_uid, nullif(btrim(coalesce(_version, '')), ''), now())
  ON CONFLICT (user_id) DO UPDATE SET
    terms_version = excluded.terms_version,
    terms_accepted_at = now(),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_affiliate_tier3_license()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_id IS NOT NULL AND NOT public.affiliate_tier3_eligible(NEW.affiliate_id) THEN
    NEW.tier3_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_tier3_license ON public.affiliate_lead_submissions;
CREATE TRIGGER trg_submissions_tier3_license
  BEFORE INSERT OR UPDATE ON public.affiliate_lead_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_affiliate_tier3_license();

DROP TRIGGER IF EXISTS trg_referrals_tier3_license ON public.affiliate_referrals;
CREATE TRIGGER trg_referrals_tier3_license
  BEFORE INSERT OR UPDATE ON public.affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_affiliate_tier3_license();