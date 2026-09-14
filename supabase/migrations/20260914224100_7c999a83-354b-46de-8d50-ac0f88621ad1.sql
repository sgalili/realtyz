REVOKE ALL ON FUNCTION public.enqueue_calendar_autosync(text, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.on_meeting_calendar_sync() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.on_property_tour_calendar_sync() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.on_scheduled_item_calendar_sync() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.on_demo_request_calendar_sync() FROM anon, authenticated;