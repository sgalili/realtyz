CREATE OR REPLACE FUNCTION public.enforce_listing_commission_limits()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.affiliate_tier1_amount IS DISTINCT FROM OLD.affiliate_tier1_amount
      OR NEW.affiliate_tier2_amount IS DISTINCT FROM OLD.affiliate_tier2_amount
      OR NEW.affiliate_tier3_amount IS DISTINCT FROM OLD.affiliate_tier3_amount) THEN
    IF coalesce(NEW.affiliate_tier1_amount,0) NOT BETWEEN 0 AND 500
       OR coalesce(NEW.affiliate_tier2_amount,0) NOT BETWEEN 0 AND 500
       OR coalesce(NEW.affiliate_tier3_amount,0) NOT BETWEEN 0 AND 500 THEN
      RAISE EXCEPTION 'commission per inquiry must be between 0 and 500';
    END IF;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.daily_lead_cap IS DISTINCT FROM OLD.daily_lead_cap)
     AND NEW.daily_lead_cap IS NOT NULL AND (NEW.daily_lead_cap < 1 OR NEW.daily_lead_cap > 150) THEN
    RAISE EXCEPTION 'daily lead cap must be between 1 and 150';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_listing_commission_limits ON public.listings;
CREATE TRIGGER trg_enforce_listing_commission_limits BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_commission_limits();