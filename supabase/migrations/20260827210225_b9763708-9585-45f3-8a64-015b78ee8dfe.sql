ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check CHECK (status = ANY (ARRAY['pending'::text,'live'::text,'discarded'::text,'hold'::text,'sold'::text,'rented'::text,'disabled'::text]));

ALTER TABLE public.campaign_logs ADD COLUMN IF NOT EXISTS recurrence_rule jsonb;

CREATE OR REPLACE FUNCTION public.cancel_future_listing_posts(_listing_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.campaign_logs
   WHERE listing_id = _listing_id
     AND status = 'scheduled'
     AND (sent_at IS NULL OR sent_at > now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN COALESCE(n, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_future_listing_posts(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_listing_hold_cancels_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('hold','sold','rented','disabled','discarded') THEN
    PERFORM public.cancel_future_listing_posts(NEW.id);
    NEW.is_published := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_hold_cancel ON public.listings;
CREATE TRIGGER trg_listings_hold_cancel
BEFORE UPDATE OF status ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.trg_listing_hold_cancels_posts();