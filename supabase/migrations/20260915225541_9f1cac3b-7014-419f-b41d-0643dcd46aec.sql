CREATE OR REPLACE FUNCTION public.on_property_tour_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tours reach Google Calendar ONLY once the client confirmed the time.
  -- A cancellation still syncs so the existing event is removed.
  IF TG_OP = 'INSERT' THEN
    IF NEW.scheduled_at IS NOT NULL AND lower(coalesce(NEW.status, '')) = 'confirmed' THEN
      PERFORM public.enqueue_calendar_autosync('property_tours', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.status, '')) IN ('cancelled', 'canceled')
     OR (lower(coalesce(NEW.status, '')) = 'confirmed'
         AND (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
              OR OLD.property_title IS DISTINCT FROM NEW.property_title
              OR OLD.property_address IS DISTINCT FROM NEW.property_address
              OR OLD.client_name IS DISTINCT FROM NEW.client_name
              OR OLD.client_phone IS DISTINCT FROM NEW.client_phone
              OR OLD.notes IS DISTINCT FROM NEW.notes
              OR OLD.status IS DISTINCT FROM NEW.status)) THEN
    PERFORM public.enqueue_calendar_autosync('property_tours', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;