
-- ============================================================
-- 0. PRE-STEP: free up `leads` name
-- ============================================================
ALTER TABLE public.leads RENAME TO contact_submissions;

-- Rename its constraints/indexes to match
ALTER INDEX public.leads_pkey RENAME TO contact_submissions_pkey;

-- Recreate its RLS policies with new names
DROP POLICY IF EXISTS "Admins can delete leads" ON public.contact_submissions;
DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.contact_submissions;
DROP POLICY IF EXISTS "Authenticated users can read leads" ON public.contact_submissions;
DROP POLICY IF EXISTS "Authenticated users can update leads" ON public.contact_submissions;

CREATE POLICY "Admins can delete contact_submissions"
  ON public.contact_submissions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can submit a contact_submission"
  ON public.contact_submissions FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read contact_submissions"
  ON public.contact_submissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update contact_submissions"
  ON public.contact_submissions FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 1. Rename main tables
-- ============================================================
ALTER TABLE public.voters RENAME TO leads;
ALTER TABLE public.candidate_pages RENAME TO listings;

-- ============================================================
-- 2. Rename FK columns
-- ============================================================
ALTER TABLE public.messages RENAME COLUMN voter_id TO lead_id;
ALTER TABLE public.chat_history RENAME COLUMN voter_id TO lead_id;
ALTER TABLE public.messages RENAME CONSTRAINT messages_voter_id_fkey TO messages_lead_id_fkey;
ALTER TABLE public.chat_history RENAME CONSTRAINT chat_history_voter_id_fkey TO chat_history_lead_id_fkey;

-- ============================================================
-- 3. Rename indexes / constraints on leads (was voters)
-- ============================================================
ALTER INDEX public.voters_pkey RENAME TO leads_pkey;
ALTER INDEX public.idx_voters_city RENAME TO idx_leads_city;
ALTER INDEX public.idx_voters_created_at RENAME TO idx_leads_created_at;
ALTER INDEX public.idx_voters_engagement RENAME TO idx_leads_engagement;
ALTER INDEX public.idx_voters_fts RENAME TO idx_leads_fts;
ALTER INDEX public.idx_voters_identity RENAME TO idx_leads_identity;
ALTER INDEX public.idx_voters_loyalty RENAME TO idx_leads_loyalty;
ALTER INDEX public.idx_voters_phone_number RENAME TO idx_leads_phone_number;
ALTER INDEX public.idx_voters_status RENAME TO idx_leads_status;
ALTER TABLE public.leads RENAME CONSTRAINT voters_phone_number_key TO leads_phone_number_key;
ALTER TABLE public.leads RENAME CONSTRAINT voters_phone_number_unique TO leads_phone_number_unique;

-- ============================================================
-- 4. Rename indexes on listings
-- ============================================================
ALTER INDEX public.candidate_pages_pkey RENAME TO listings_pkey;
ALTER INDEX public.candidate_pages_slug_key RENAME TO listings_slug_key;
ALTER INDEX public.idx_candidate_pages_slug RENAME TO idx_listings_slug;
ALTER INDEX public.idx_candidate_pages_user_id RENAME TO idx_listings_user_id;

-- ============================================================
-- 5. Recreate RLS policies on leads (was voters)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can delete real voters" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can insert voters" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can read voters" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can update voters" ON public.leads;

CREATE POLICY "Authenticated users can delete real leads"
  ON public.leads FOR DELETE TO authenticated
  USING (((NOT is_demo) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Authenticated users can insert leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (((NOT is_demo) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Authenticated users can update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 6. Recreate RLS policies on listings
-- ============================================================
DROP POLICY IF EXISTS "Public can view published candidate pages" ON public.listings;
DROP POLICY IF EXISTS "Users can create own candidate pages" ON public.listings;
DROP POLICY IF EXISTS "Users can delete own candidate pages" ON public.listings;
DROP POLICY IF EXISTS "Users can update own candidate pages" ON public.listings;

CREATE POLICY "Public can view published listings"
  ON public.listings FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "Users can create own listings"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY "Users can delete own listings"
  ON public.listings FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY "Users can update own listings"
  ON public.listings FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK (((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));

-- ============================================================
-- 7. Add new additive columns on leads (back-filled)
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferences jsonb
  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_stage text
  NOT NULL DEFAULT 'new';

UPDATE public.leads SET preferences = COALESCE(interest_scores, '{}'::jsonb)
  WHERE preferences = '{}'::jsonb;
UPDATE public.leads SET lead_stage = COALESCE(loyalty_tier, 'new')
  WHERE lead_stage = 'new';

CREATE INDEX IF NOT EXISTS idx_leads_lead_stage ON public.leads (lead_stage);

-- ============================================================
-- 8. Add new additive columns on listings (back-filled)
-- ============================================================
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS property_title text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS features jsonb
  NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS asking_price numeric(12,2)
  NOT NULL DEFAULT 0;

UPDATE public.listings SET property_title = candidate_name WHERE property_title IS NULL;
UPDATE public.listings SET description  = thesis         WHERE description IS NULL;
UPDATE public.listings SET features     = pillars        WHERE features = '[]'::jsonb;
UPDATE public.listings SET asking_price = mandate_goal::numeric WHERE asking_price = 0;

ALTER TABLE public.listings ALTER COLUMN property_title SET NOT NULL;
ALTER TABLE public.listings ALTER COLUMN description SET NOT NULL;

-- ============================================================
-- 9. Drop old trigger + function, create new ones on leads
-- ============================================================
DROP TRIGGER IF EXISTS trg_enforce_trial_voter_cap ON public.leads;
DROP FUNCTION IF EXISTS public.enforce_trial_voter_cap();

CREATE OR REPLACE FUNCTION public.enforce_trial_lead_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  current_count int;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_admin_or_above(uid) THEN RETURN NEW; END IF;
  IF NOT public.is_on_trial_plan(uid) THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.leads
  WHERE COALESCE(is_demo, false) = false;

  IF current_count >= 100 THEN
    RAISE EXCEPTION 'TRIAL_RECORD_LIMIT: מסלול הניסיון מוגבל ל-100 רשומות. שדרג עכשיו כדי לנהל את כל מאגר הלידים שלך'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_enforce_trial_lead_cap
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_trial_lead_cap();

-- ============================================================
-- 10. Recreate updated_at trigger on listings
-- ============================================================
DROP TRIGGER IF EXISTS update_candidate_pages_updated_at ON public.listings;

CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_candidate_pages_updated_at();

-- ============================================================
-- 11. Rename bulk_update_voters → bulk_update_leads
-- ============================================================
DROP FUNCTION IF EXISTS public.bulk_update_voters(uuid[], text, text);

CREATE OR REPLACE FUNCTION public.bulk_update_leads(
  lead_ids uuid[],
  new_status text DEFAULT NULL,
  new_interest_tag text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
BEGIN
  IF array_length(lead_ids, 1) IS NULL OR array_length(lead_ids, 1) = 0 THEN
    RAISE EXCEPTION 'lead_ids array cannot be empty';
  END IF;
  IF array_length(lead_ids, 1) > 10000 THEN
    RAISE EXCEPTION 'Cannot update more than 10,000 leads at once';
  END IF;
  IF new_status IS NULL AND new_interest_tag IS NULL THEN
    RAISE EXCEPTION 'At least one field must be provided for update';
  END IF;

  UPDATE public.leads
  SET
    status = COALESCE(new_status, status),
    interest_tag = COALESCE(new_interest_tag, interest_tag),
    last_interaction_at = now()
  WHERE id = ANY(lead_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$;
