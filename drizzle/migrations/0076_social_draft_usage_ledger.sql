CREATE OR REPLACE FUNCTION public.finish_social_draft(_request uuid,_content text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.social_draft_requests; b public.social_draft_batches; balance numeric; price numeric;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
 SELECT * INTO r FROM public.social_draft_requests WHERE id=_request;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown request'; END IF;
 SELECT * INTO b FROM public.social_draft_batches WHERE workspace_owner_id=r.workspace_owner_id AND platform=r.platform AND target_key=r.target_key FOR UPDATE;
 SELECT * INTO r FROM public.social_draft_requests WHERE id=_request FOR UPDATE;
 IF r.status='completed' THEN RETURN jsonb_build_object('content',r.content,'cached',true); END IF;
 IF b.pending_request IS DISTINCT FROM _request THEN RAISE EXCEPTION 'reservation expired'; END IF;
 IF _content IS NULL OR length(trim(_content))=0 THEN
  UPDATE public.social_draft_requests SET status='failed' WHERE id=_request;
  UPDATE public.social_draft_batches SET pending_request=NULL,pending_until=NULL WHERE workspace_owner_id=r.workspace_owner_id AND platform=r.platform AND target_key=r.target_key;
  RETURN jsonb_build_object('failed',true);
 END IF;
 IF b.drafts_used%3=0 THEN
  SELECT price_agorot/100.0 INTO price FROM public.action_pricing WHERE action_key='social_post';
  SELECT balance_ils INTO balance FROM public.credit_wallets WHERE user_id=r.workspace_owner_id FOR UPDATE;
  IF price IS NULL OR price<>0.08 OR coalesce(balance,0)<price THEN RAISE EXCEPTION 'insufficient credits'; END IF;
  PERFORM public.add_credit(r.workspace_owner_id,-price,'usage_deduction',_request,'social_post|1|יצירת פוסט Facebook / Instagram');
 END IF;
 UPDATE public.social_draft_requests SET status='completed',content=_content WHERE id=_request;
 UPDATE public.social_draft_batches SET drafts_used=drafts_used+1,pending_request=NULL,pending_until=NULL WHERE workspace_owner_id=r.workspace_owner_id AND platform=r.platform AND target_key=r.target_key;
 RETURN jsonb_build_object('content',_content,'credits_charged',CASE WHEN b.drafts_used%3=0 THEN 2 ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION public.finish_social_draft(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_social_draft(uuid,text) TO service_role;