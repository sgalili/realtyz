ALTER TABLE public.fb_user_groups ADD COLUMN IF NOT EXISTS join_status text NOT NULL DEFAULT 'not_joined';
ALTER TABLE public.fb_user_groups ADD CONSTRAINT fb_user_groups_join_status_check CHECK (join_status IN ('joined','pending','not_joined'));
UPDATE public.fb_user_groups SET join_status = CASE WHEN source = 'extension' THEN 'joined' ELSE 'not_joined' END;