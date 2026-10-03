ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_bookmarked boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS inbox_done_at timestamptz;