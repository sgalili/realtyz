-- ── 1. demo_requests: strictly scoped to the ACTIVE workspace ──────────────
DROP POLICY IF EXISTS "Admins can read demo requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Admins can update demo requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Admins can delete demo requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Workspace members can read demo requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Workspace members can update demo requests" ON public.demo_requests;

CREATE POLICY "demo_requests_select_active_workspace"
ON public.demo_requests FOR SELECT TO authenticated
USING (public.ws_current_access(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)));

CREATE POLICY "demo_requests_update_active_workspace"
ON public.demo_requests FOR UPDATE TO authenticated
USING (public.ws_current_access(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)))
WITH CHECK (public.ws_current_access(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)));

CREATE POLICY "demo_requests_delete_active_workspace"
ON public.demo_requests FOR DELETE TO authenticated
USING (public.ws_current_access(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)));

-- ── 2. property_tours: strictly scoped to the ACTIVE workspace ──────────────
DROP POLICY IF EXISTS "Workspace members manage property tours" ON public.property_tours;

CREATE POLICY "property_tours_active_workspace"
ON public.property_tours FOR ALL TO authenticated
USING (public.ws_current_access(owner_id))
WITH CHECK (public.ws_current_access(owner_id));

-- ── 3. Calendar sync fires on EVERY relevant change, not only on create ────
CREATE OR REPLACE FUNCTION public.on_meeting_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.starts_at IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.starts_at IS DISTINCT FROM NEW.starts_at
       OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.status IS DISTINCT FROM NEW.status
     ) THEN
    PERFORM public.enqueue_calendar_autosync('meetings', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_property_tour_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.notes IS DISTINCT FROM NEW.notes
       OR OLD.property_title IS DISTINCT FROM NEW.property_title
       OR OLD.property_address IS DISTINCT FROM NEW.property_address
     ) THEN
    PERFORM public.enqueue_calendar_autosync('property_tours', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_scheduled_item_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.scheduled_for IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.content IS DISTINCT FROM NEW.content
       OR OLD.status IS DISTINCT FROM NEW.status
     ) THEN
    PERFORM public.enqueue_calendar_autosync('scheduled_items', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_demo_request_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.preferred_at IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.preferred_at IS DISTINCT FROM NEW.preferred_at
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.notes IS DISTINCT FROM NEW.notes
       OR OLD.first_name IS DISTINCT FROM NEW.first_name
       OR OLD.last_name IS DISTINCT FROM NEW.last_name
     ) THEN
    PERFORM public.enqueue_calendar_autosync('demo_requests', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;