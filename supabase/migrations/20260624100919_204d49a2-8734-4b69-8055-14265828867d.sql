
-- Add media columns to listings for Homely-imported photos/documents
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS media_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Purge current listings and leads so the new ingestion rules start fresh.
-- FK cascades on leads → messages/chat_history/autopilot_queue/deal_room_matches/homely_push_log handle the rest.
DELETE FROM public.leads;
DELETE FROM public.listings;
DELETE FROM public.webtiv_synced_records;
