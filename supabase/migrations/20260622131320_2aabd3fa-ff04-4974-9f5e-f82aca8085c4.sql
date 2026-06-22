
CREATE OR REPLACE FUNCTION public.trg_deal_room_match_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _city text;
BEGIN
  SELECT COALESCE(NULLIF(l.city,''), NULLIF(l.property_title,''), 'נכס') INTO _city
  FROM public.listings l
  WHERE l.id = NEW.listing_id;

  INSERT INTO public.notifications (user_id, lead_id, event_type, title, body, deep_link, channel, delivery_result)
  VALUES (
    NEW.broker_id,
    NEW.lead_id,
    'deal_room_hot_match',
    'עסקת זהב חמה בחדר העסקאות',
    'נמצאה עסקת זהב חמה בחדר העסקאות עבור הנכס ב' || COALESCE(_city, 'נכס') || '. נא לבצע מעקב יזום.',
    '/deal-room?lead=' || NEW.lead_id::text,
    'in_app',
    jsonb_build_object(
      'listing_id', NEW.listing_id,
      'match_score', NEW.match_score,
      'match_reasons', NEW.match_reasons
    )
  );
  RETURN NEW;
END;
$$;
