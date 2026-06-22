
-- 1) short_urls: branded short-link catalog for AI-composed posts
CREATE TABLE public.short_urls (
  slug text PRIMARY KEY,
  property_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  long_url text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  clicks integer NOT NULL DEFAULT 0,
  last_click_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX short_urls_property_id_idx ON public.short_urls(property_id);
CREATE INDEX short_urls_created_by_idx ON public.short_urls(created_by);

GRANT SELECT ON public.short_urls TO anon;
GRANT SELECT, INSERT, UPDATE ON public.short_urls TO authenticated;
GRANT ALL ON public.short_urls TO service_role;

ALTER TABLE public.short_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read short urls for redirect"
  ON public.short_urls FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can create their own short urls"
  ON public.short_urls FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update their own short urls"
  ON public.short_urls FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- 2) deal_room_matches: hot-match ledger surfaced to the broker
CREATE TABLE public.deal_room_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  broker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_score numeric NOT NULL DEFAULT 0,
  match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, listing_id)
);
CREATE INDEX deal_room_matches_broker_idx ON public.deal_room_matches(broker_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.deal_room_matches TO authenticated;
GRANT ALL ON public.deal_room_matches TO service_role;

ALTER TABLE public.deal_room_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers can view their matches"
  ON public.deal_room_matches FOR SELECT TO authenticated
  USING (broker_id = auth.uid() OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Brokers can update their matches"
  ON public.deal_room_matches FOR UPDATE TO authenticated
  USING (broker_id = auth.uid() OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Authenticated can insert matches"
  ON public.deal_room_matches FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3) Trigger: fire a Hebrew in-app notification to the broker on every new match
CREATE OR REPLACE FUNCTION public.trg_deal_room_match_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _city text;
BEGIN
  SELECT COALESCE(l.city, l.property_title, 'נכס') INTO _city
  FROM public.listings l
  WHERE l.id = NEW.listing_id;

  INSERT INTO public.notifications (user_id, type, title, body, link_url, metadata)
  VALUES (
    NEW.broker_id,
    'deal_room_hot_match',
    'עסקת זהב חמה בחדר העסקאות',
    'נמצאה עסקת זהב חמה בחדר העסקאות עבור הנכס ב' || COALESCE(_city, 'נכס') || '. נא לבצע מעקב יזום.',
    '/deal-room?lead=' || NEW.lead_id::text,
    jsonb_build_object(
      'lead_id', NEW.lead_id,
      'listing_id', NEW.listing_id,
      'match_score', NEW.match_score,
      'match_reasons', NEW.match_reasons
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER deal_room_match_notify
AFTER INSERT ON public.deal_room_matches
FOR EACH ROW EXECUTE FUNCTION public.trg_deal_room_match_notify();
