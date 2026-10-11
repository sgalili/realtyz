COMMENT ON FUNCTION public.partner_can_view_closing(uuid) IS 'Level-4 closing pricing visibility: verified affiliate licenses plus broker accounts (managing_broker, lead_agent, agent).';

CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND NOT public.has_role(_user_id, 'developer')
    AND NOT public.has_role(_user_id, 'property_owner')
    AND NOT public.has_role(_user_id, 'property_seeker')
    AND (
      public.affiliate_tier3_eligible(_user_id)
      OR public.has_role(_user_id, 'managing_broker')
      OR public.has_role(_user_id, 'lead_agent')
      OR public.has_role(_user_id, 'agent')
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_affiliate_tier3_license()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_id IS NOT NULL AND NOT public.partner_can_view_closing(NEW.affiliate_id) THEN
    IF to_jsonb(NEW) ? 'tier4_amount' THEN
      NEW.tier4_amount := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;