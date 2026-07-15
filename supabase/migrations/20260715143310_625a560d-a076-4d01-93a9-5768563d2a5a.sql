
-- Hard reset property + media data
TRUNCATE TABLE public.listings RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.homely_push_log RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.webtiv_synced_records RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.webtiv_sync_state RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.homely_inbound_events RESTART IDENTITY CASCADE;

-- Strip cached media references from campaign_logs (table itself preserved — contains post history)
UPDATE public.campaign_logs
SET provider_response = provider_response
  - 'media_urls'
  - 'og_image_source'
  - 'og_image_resolved_at'
  - 'og_image_unique_hash'
  - 'og_image_property_id'
  - 'og_image_last_modified_at'
WHERE provider_response ?| ARRAY['media_urls','og_image_unique_hash'];
