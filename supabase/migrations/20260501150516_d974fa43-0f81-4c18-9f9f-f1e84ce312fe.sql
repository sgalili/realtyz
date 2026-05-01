-- Production prep: seed/wipe demo data RPCs + clear-personal-data RPC

-- 1) Seed Udi-Bot demo data (idempotent, only inserts when no demo rows exist for owner)
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  inserted_leads int := 0;
  inserted_listings int := 0;
  i int;
  names text[] := ARRAY['דני כהן','מיכאל לוי','אורי שמיר','נועם ברק','יוספה אברהם','רונית פרידמן','אלון גולן','שמעון מזרחי','עדי דוד','הדר כץ','גל נבון','יעל סלע'];
  cities text[] := ARRAY['תל אביב','הרצליה','רמת גן','ראשון לציון','חיפה','ירושלים'];
  tags text[] := ARRAY['Buyer-Herzliya','Renter-TLV','Investor','Seller-RamatGan','Buyer-TLV'];
  stages text[] := ARRAY['new','engaging','qualified','negotiation'];
  loyalties text[] := ARRAY['Hot Lead','Warm','Cold','מתעניין חם'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  IF EXISTS (SELECT 1 FROM public.leads WHERE assigned_to = uid AND is_demo = true LIMIT 1) THEN
    RETURN jsonb_build_object('status','exists','message','Demo data already loaded');
  END IF;

  FOR i IN 1..12 LOOP
    INSERT INTO public.leads (
      phone_number, full_name, city, neighborhood, interest_tag, lead_stage,
      loyalty_tier, sentiment, deal_type, engagement_score, priority_score,
      is_demo, assigned_to, status,
      preferences, commission_amount, commission_currency, expected_close_date
    ) VALUES (
      '9725' || lpad((10000000 + (random()*89999999)::int)::text, 8, '0'),
      names[1 + ((i-1) % array_length(names,1))] || ' (Demo)',
      cities[1 + ((i-1) % array_length(cities,1))],
      'דמו',
      tags[1 + ((i-1) % array_length(tags,1))],
      stages[1 + ((i-1) % array_length(stages,1))],
      loyalties[1 + ((i-1) % array_length(loyalties,1))],
      (ARRAY['positive','neutral','negative'])[1 + ((i-1) % 3)],
      CASE WHEN i % 3 = 0 THEN 'rent' ELSE 'sale' END,
      40 + (random()*60)::int,
      30 + (random()*70)::int,
      true, uid, 'lead',
      jsonb_build_object('rooms', 3 + (i % 3), 'budget_max', 1500000 + i*150000),
      CASE WHEN i % 4 = 0 THEN (15000 + i*2000)::numeric ELSE NULL END,
      'ILS',
      CASE WHEN i % 4 = 0 THEN (current_date + (i * 7))::date ELSE NULL END
    );
    inserted_leads := inserted_leads + 1;
  END LOOP;

  FOR i IN 1..6 LOOP
    INSERT INTO public.listings (
      property_title, description, asking_price, features, status, source, is_demo, user_id
    ) VALUES (
      'דמו: דירת ' || (3 + (i % 3))::text || ' חדרים ב' || cities[1 + ((i-1) % array_length(cities,1))],
      'נכס לדוגמה לבדיקה והדגמה — מחיר, מ"ר, חניה ומעלית.',
      (1800000 + i*250000)::numeric,
      jsonb_build_object('rooms', 3 + (i % 3), 'sqm', 80 + i*5, 'parking', i % 2 = 0, 'elevator', true),
      'live',
      'demo_seed',
      true,
      uid
    );
    inserted_listings := inserted_listings + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status','seeded',
    'leads', inserted_leads,
    'listings', inserted_listings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;

-- 2) Wipe demo data (only rows tagged is_demo=true and owned by current user)
CREATE OR REPLACE FUNCTION public.wipe_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  d_leads int := 0;
  d_listings int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  WITH del AS (
    DELETE FROM public.leads
    WHERE is_demo = true AND assigned_to = uid
    RETURNING 1
  ) SELECT COUNT(*) INTO d_leads FROM del;

  WITH del AS (
    DELETE FROM public.listings
    WHERE is_demo = true AND user_id = uid
    RETURNING 1
  ) SELECT COUNT(*) INTO d_listings FROM del;

  RETURN jsonb_build_object('status','wiped','leads',d_leads,'listings',d_listings);
END;
$$;

REVOKE ALL ON FUNCTION public.wipe_demo_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wipe_demo_data() TO authenticated;

-- 3) Clear personal data on a specific lead (PII purge, keep stats row)
CREATE OR REPLACE FUNCTION public.clear_lead_personal_data(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  affected int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  UPDATE public.leads
  SET full_name = '[REDACTED]',
      phone_number = 'redacted-' || substr(_lead_id::text,1,8),
      email = NULL,
      identity_number = NULL,
      telegram_username = NULL,
      instagram_handle = NULL,
      messenger_id = NULL,
      profile_picture_url = NULL,
      neighborhood = NULL,
      preferences = '{}'::jsonb
  WHERE id = _lead_id
    AND (assigned_to = uid OR public.is_admin_or_above(uid));
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected = 0 THEN
    RAISE EXCEPTION 'lead not found or not owned';
  END IF;

  -- Strip message bodies for that lead
  UPDATE public.messages
  SET content = '[REDACTED]'
  WHERE lead_id = _lead_id;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_table, target_id, details)
  VALUES (uid, NULLIF(auth.email(),''), 'lead.pii_cleared', 'leads', _lead_id::text,
          jsonb_build_object('cleared_at', now()));

  RETURN jsonb_build_object('status','cleared','lead_id',_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_lead_personal_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_lead_personal_data(uuid) TO authenticated;