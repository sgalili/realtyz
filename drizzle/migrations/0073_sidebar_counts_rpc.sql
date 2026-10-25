CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_workspace_owner ON public.leads(workspace_owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_workspace_status ON public.listings(workspace_owner_id, status);

CREATE OR REPLACE FUNCTION public.get_sidebar_counts(_ws uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_access_workspace_owner(_ws) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'leads', (SELECT count(*) FROM leads WHERE workspace_owner_id = _ws),
    'listings', (SELECT count(*) FROM listings WHERE workspace_owner_id = _ws AND status IS DISTINCT FROM 'discarded'),
    'chats', (SELECT count(DISTINCT m.lead_id) FROM messages m JOIN leads l ON l.id = m.lead_id WHERE l.workspace_owner_id = _ws),
    'deals', (SELECT count(*) FROM leads WHERE workspace_owner_id = _ws AND lead_stage IS NOT NULL AND lead_stage <> 'new_lead'),
    'campaigns', (SELECT count(*) FROM (SELECT DISTINCT campaign_name, channel, created_at FROM campaign_logs WHERE workspace_owner_id = _ws AND is_archived = false ORDER BY created_at DESC LIMIT 1000) c),
    'tasks', (SELECT count(*) FROM scheduled_items WHERE workspace_owner_id = _ws
                AND lower(coalesce(status,'')) NOT IN ('completed','done','cancelled','sent','archived')
                AND lower(coalesce(item_type,'')) NOT IN ('social_post','sms_campaign','whatsapp_blast','push'))
           + (SELECT count(*) FROM meetings WHERE workspace_owner_id = _ws AND starts_at >= now() - interval '12 hours'
                AND lower(coalesce(status,'')) NOT IN ('completed','done','cancelled','sent','archived')),
    'sharedListings', (SELECT count(*) FROM listings WHERE workspace_owner_id = _ws AND affiliate_enabled = true AND status IS DISTINCT FROM 'discarded'),
    'invitations', (SELECT count(*) FROM referrals WHERE referrer_id = auth.uid()),
    'projects', (SELECT count(*) FROM developer_projects WHERE workspace_owner_id = _ws)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_sidebar_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sidebar_counts(uuid) TO authenticated;