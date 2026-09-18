CREATE OR REPLACE FUNCTION public.affiliate_can_access_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _lead_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.affiliate_conversation_access a
            WHERE a.lead_id = _lead_id AND a.affiliate_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.affiliate_lead_submissions s
            WHERE s.lead_id = _lead_id AND s.affiliate_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.get_affiliate_posts()
RETURNS TABLE (
  id uuid, campaign_name text, channel text, status text, message_body text,
  media_urls jsonb, group_ids jsonb, listing_id uuid, first_comment text,
  like_count integer, comment_count integer, share_count integer, view_count integer,
  failure_reason text, created_at timestamptz, sent_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.campaign_name, c.channel, c.status, c.message_body,
         c.media_urls, c.group_ids, c.listing_id, c.first_comment,
         COALESCE(c.like_count, 0), COALESCE(c.comment_count, 0),
         COALESCE(c.share_count, 0), COALESCE(c.view_count, 0),
         c.failure_reason, c.created_at, c.sent_at
  FROM public.campaign_logs c
  WHERE c.user_id = auth.uid()
    AND COALESCE(c.is_archived, false) = false
  ORDER BY COALESCE(c.sent_at, c.created_at) DESC
  LIMIT 300
$$;

CREATE OR REPLACE FUNCTION public.get_affiliate_chats()
RETURNS TABLE (
  lead_id uuid, full_name text, phone_number text, profile_picture_url text,
  city text, ai_autopilot boolean, last_message text, last_message_at timestamptz,
  last_direction text, last_channel text, message_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH accessible AS (
    SELECT DISTINCT x.lead_id FROM (
      SELECT a.lead_id FROM public.affiliate_conversation_access a WHERE a.affiliate_user_id = auth.uid()
      UNION
      SELECT s.lead_id FROM public.affiliate_lead_submissions s WHERE s.affiliate_id = auth.uid()
    ) x WHERE x.lead_id IS NOT NULL
  )
  SELECT l.id, l.full_name, l.phone_number, l.profile_picture_url, l.city,
         COALESCE(l.ai_autopilot, false),
         lm.content, lm.created_at, lm.direction, lm.channel,
         COALESCE(mc.cnt, 0)
  FROM accessible acc
  JOIN public.leads l ON l.id = acc.lead_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.direction, m.channel
    FROM public.messages m WHERE m.lead_id = l.id
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.messages m WHERE m.lead_id = l.id
  ) mc ON true
  ORDER BY COALESCE(lm.created_at, l.created_at) DESC
  LIMIT 200
$$;

CREATE OR REPLACE FUNCTION public.get_affiliate_chat_messages(p_lead_id uuid)
RETURNS TABLE (
  id uuid, direction text, sender_type text, content text, channel text,
  platform text, ai_assisted boolean, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.direction, m.sender_type, m.content, m.channel,
         m.platform, COALESCE(m.ai_assisted, false), m.created_at
  FROM public.messages m
  WHERE m.lead_id = p_lead_id
    AND public.affiliate_can_access_lead(p_lead_id)
  ORDER BY m.created_at ASC
  LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.get_affiliate_contacts()
RETURNS TABLE (
  lead_id uuid, full_name text, phone_number text, email text, city text,
  neighborhood text, deal_type text, lead_stage text, status text,
  profile_picture_url text, last_interaction_at timestamptz, created_at timestamptz,
  submission_status text, earned_amount numeric, settlement_status text,
  listing_id uuid, message_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH accessible AS (
    SELECT DISTINCT x.lead_id FROM (
      SELECT a.lead_id FROM public.affiliate_conversation_access a WHERE a.affiliate_user_id = auth.uid()
      UNION
      SELECT s.lead_id FROM public.affiliate_lead_submissions s WHERE s.affiliate_id = auth.uid()
    ) x WHERE x.lead_id IS NOT NULL
  )
  SELECT l.id, l.full_name, l.phone_number, l.email, l.city, l.neighborhood,
         l.deal_type, l.lead_stage, l.status, l.profile_picture_url,
         l.last_interaction_at, l.created_at,
         sub.status, sub.earned_amount, sub.settlement_status, sub.listing_id,
         COALESCE(mc.cnt, 0)
  FROM accessible acc
  JOIN public.leads l ON l.id = acc.lead_id
  LEFT JOIN LATERAL (
    SELECT s.status, s.earned_amount, s.settlement_status, s.listing_id
    FROM public.affiliate_lead_submissions s
    WHERE s.lead_id = l.id AND s.affiliate_id = auth.uid()
    ORDER BY s.created_at DESC LIMIT 1
  ) sub ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.messages m WHERE m.lead_id = l.id
  ) mc ON true
  ORDER BY COALESCE(l.last_interaction_at, l.created_at) DESC
  LIMIT 300
$$;

GRANT EXECUTE ON FUNCTION public.affiliate_can_access_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_posts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_chats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_chat_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_contacts() TO authenticated;