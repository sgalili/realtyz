CREATE OR REPLACE FUNCTION public.begin_social_draft(_request uuid,_platform text,_target text,_confirm boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid; b public.social_draft_batches; r public.social_draft_requests; balance numeric; price numeric;
BEGIN
 w:=public.current_workspace_owner();
 IF auth.uid() IS NULL OR NOT public.can_access_workspace_owner(w) THEN RAISE EXCEPTION 'not allowed'; END IF;
 IF _platform NOT IN ('facebook','instagram') OR length(_target)>200 OR length(_target)=0 THEN RAISE EXCEPTION 'invalid draft target'; END IF;
 INSERT INTO public.social_draft_batches(workspace_owner_id,platform,target_key) VALUES(w,_platform,_target) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.social_draft_batches WHERE workspace_owner_id=w AND platform=_platform AND target_key=_target FOR UPDATE;
 SELECT * INTO r FROM public.social_draft_requests WHERE id=_request;
 IF FOUND THEN
  IF r.user_id<>auth.uid() OR r.workspace_owner_id<>w OR r.platform<>_platform OR r.target_key<>_target THEN RAISE EXCEPTION 'request mismatch'; END IF;
  IF r.status='completed' THEN RETURN jsonb_build_object('content',r.content,'cached',true); END IF;
  IF r.status='failed' THEN RETURN jsonb_build_object('error','failed_request'); END IF;
 END IF;
 IF b.pending_request IS NOT NULL AND b.pending_until>now() THEN RETURN jsonb_build_object('error','generation_in_progress'); END IF;
 IF b.drafts_used>0 AND b.drafts_used%3=0 AND NOT _confirm THEN RETURN jsonb_build_object('confirmation_required',true,'credits',2); END IF;
 -- Two app credits at the established 25 credits per shekel conversion.
 price:=0.08;
 IF b.drafts_used%3=0 THEN
  SELECT balance_ils INTO balance FROM public.credit_wallets WHERE user_id=w;
  IF coalesce(balance,0)<price THEN RETURN jsonb_build_object('error','insufficient_credits'); END IF;
 END IF;
 INSERT INTO public.social_draft_requests(id,workspace_owner_id,user_id,platform,target_key) VALUES(_request,w,auth.uid(),_platform,_target) ON CONFLICT DO NOTHING;
 UPDATE public.social_draft_batches SET pending_request=_request,pending_until=now()+interval '2 minutes' WHERE workspace_owner_id=w AND platform=_platform AND target_key=_target;
 RETURN jsonb_build_object('reserved',true,'request_id',_request);
END $$;
REVOKE ALL ON FUNCTION public.begin_social_draft(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_social_draft(uuid,text,text,boolean) TO authenticated;
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
  price:=0.08;
  SELECT balance_ils INTO balance FROM public.credit_wallets WHERE user_id=r.workspace_owner_id FOR UPDATE;
  IF coalesce(balance,0)<price THEN RAISE EXCEPTION 'insufficient credits'; END IF;
  PERFORM public.add_credit(r.workspace_owner_id,-price,'usage_deduction',_request,'social_post|1|יצירת פוסט Facebook / Instagram');
 END IF;
 UPDATE public.social_draft_requests SET status='completed',content=_content WHERE id=_request;
 UPDATE public.social_draft_batches SET drafts_used=drafts_used+1,pending_request=NULL,pending_until=NULL WHERE workspace_owner_id=r.workspace_owner_id AND platform=r.platform AND target_key=r.target_key;
 RETURN jsonb_build_object('content',_content,'credits_charged',CASE WHEN b.drafts_used%3=0 THEN 2 ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION public.finish_social_draft(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_social_draft(uuid,text) TO service_role;