ALTER TABLE public.affiliate_profiles
  ADD COLUMN IF NOT EXISTS rita_auto_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_funnel_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_add_affiliate_listing_to_funnels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affiliate_row record;
  owner_uuid uuid;
  code_value text;
BEGIN
  IF NEW.affiliate_enabled IS NOT TRUE OR (TG_OP = 'UPDATE' AND OLD.affiliate_enabled IS TRUE) THEN
    RETURN NEW;
  END IF;

  owner_uuid := COALESCE(NEW.workspace_owner_id, NEW.user_id);
  IF owner_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  FOR affiliate_row IN
    SELECT ap.user_id
    FROM public.affiliate_profiles ap
    WHERE ap.auto_funnel_enabled IS TRUE
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.affiliate_referrals ar
      WHERE ar.affiliate_id = affiliate_row.user_id
        AND ar.listing_id = NEW.id
        AND ar.channel = 'auto_funnel'
    ) THEN
      code_value := substr(encode(gen_random_bytes(8), 'hex'), 1, 10);
      INSERT INTO public.affiliate_referrals (
        affiliate_id,
        broker_id,
        listing_id,
        tracking_code,
        channel,
        clicks,
        status,
        reward_type,
        reward_amount,
        settlement_status
      ) VALUES (
        affiliate_row.user_id,
        owner_uuid,
        NEW.id,
        code_value,
        'auto_funnel',
        0,
        'promoting',
        COALESCE(NEW.affiliate_reward_type, 'fixed'),
        COALESCE(NEW.affiliate_reward_amount, 0),
        'unsettled'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_affiliate_listing_to_funnels ON public.listings;
CREATE TRIGGER trg_auto_add_affiliate_listing_to_funnels
AFTER INSERT OR UPDATE OF affiliate_enabled ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_affiliate_listing_to_funnels();