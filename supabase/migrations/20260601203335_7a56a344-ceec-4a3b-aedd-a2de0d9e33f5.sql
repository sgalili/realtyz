
-- FB Engagement Console: tracked posts, comments, AI drafts, replies, mode settings

-- 1) Per-user mode (HITL vs Pilot) for FB engagement
CREATE TABLE public.fb_engagement_settings (
  user_id uuid PRIMARY KEY,
  mode text NOT NULL DEFAULT 'hitl' CHECK (mode IN ('hitl','pilot')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_engagement_settings TO authenticated;
GRANT ALL ON public.fb_engagement_settings TO service_role;
ALTER TABLE public.fb_engagement_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.fb_engagement_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2) Tracked FB posts
CREATE TABLE public.fb_engagement_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_post_id text NOT NULL UNIQUE,
  post_url text NOT NULL,
  label text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fb_engagement_posts TO authenticated;
GRANT ALL ON public.fb_engagement_posts TO service_role;
ALTER TABLE public.fb_engagement_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read posts" ON public.fb_engagement_posts FOR SELECT TO authenticated USING (true);

-- Seed the Udi post
INSERT INTO public.fb_engagement_posts (fb_post_id, post_url, label)
VALUES ('122135406987020860', 'https://www.facebook.com/story.php?story_fbid=122135406987020860&id=61580625810292', 'Udi Vitman main post')
ON CONFLICT (fb_post_id) DO NOTHING;

-- 3) Comments mirrored from Ayrshare
CREATE TABLE public.fb_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.fb_engagement_posts(id) ON DELETE CASCADE,
  ayr_comment_id text NOT NULL,
  parent_comment_id text,
  author_name text,
  author_fb_id text,
  comment_text text NOT NULL DEFAULT '',
  likes_count int NOT NULL DEFAULT 0,
  shares_count int NOT NULL DEFAULT 0,
  posted_at timestamptz,
  is_historical_replied boolean NOT NULL DEFAULT false,
  historical_reply_text text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','drafted','replied','skipped','historical')),
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, ayr_comment_id)
);
CREATE INDEX fb_comments_post_status_idx ON public.fb_comments (post_id, status, posted_at DESC);
GRANT SELECT, UPDATE ON public.fb_comments TO authenticated;
GRANT ALL ON public.fb_comments TO service_role;
ALTER TABLE public.fb_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read comments" ON public.fb_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth update comments" ON public.fb_comments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 4) AI draft options (3 per comment normally)
CREATE TABLE public.fb_comment_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.fb_comments(id) ON DELETE CASCADE,
  draft_index int NOT NULL,
  draft_text text NOT NULL,
  model text,
  is_simulation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fb_comment_drafts_comment_idx ON public.fb_comment_drafts (comment_id, draft_index);
GRANT SELECT, INSERT, DELETE ON public.fb_comment_drafts TO authenticated;
GRANT ALL ON public.fb_comment_drafts TO service_role;
ALTER TABLE public.fb_comment_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read drafts" ON public.fb_comment_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth ins drafts" ON public.fb_comment_drafts FOR INSERT TO authenticated WITH CHECK (true);

-- 5) Replies actually dispatched
CREATE TABLE public.fb_comment_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.fb_comments(id) ON DELETE CASCADE,
  final_text text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('hitl','pilot','manual_edit')),
  posted_by uuid,
  ayrshare_reply_id text,
  ayrshare_response jsonb,
  kb_document_id uuid,
  posted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fb_comment_replies TO authenticated;
GRANT ALL ON public.fb_comment_replies TO service_role;
ALTER TABLE public.fb_comment_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read replies" ON public.fb_comment_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth ins replies" ON public.fb_comment_replies FOR INSERT TO authenticated WITH CHECK (true);
