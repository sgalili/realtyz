CREATE OR REPLACE FUNCTION public.on_listing_insert_trigger_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_row record;
BEGIN
  BEGIN
    FOR lead_row IN
      SELECT id FROM public.leads
      WHERE assigned_to = NEW.user_id
      ORDER BY COALESCE(last_interaction_at, created_at) DESC NULLS LAST
      LIMIT 100
    LOOP
      PERFORM public.trigger_match_for_lead(lead_row.id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'on_listing_insert_trigger_match failed for listing %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;