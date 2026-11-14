CREATE OR REPLACE FUNCTION public.enqueue_grow_lead_authorization() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; target_listing uuid; listing_row public.listings; cap numeric; amount numeric; job uuid;
BEGIN
 IF TG_TABLE_NAME='listings' THEN owner_id:=NEW.workspace_owner_id; target_listing:=NEW.id; ELSE owner_id:=NEW.user_id; target_listing:=NULL; END IF;
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.grow_saved_cards WHERE workspace_owner_id=owner_id AND revoked_at IS NULL) THEN RETURN NEW; END IF;
 SELECT daily_spend_ils INTO cap FROM public.account_lead_limits WHERE user_id=owner_id;
 FOR listing_row IN SELECT * FROM public.listings WHERE workspace_owner_id=owner_id AND (target_listing IS NULL OR id=target_listing) LOOP
  amount:=coalesce(cap,greatest(coalesce(listing_row.affiliate_tier1_amount,0),coalesce(listing_row.affiliate_tier2_amount,0),coalesce(listing_row.affiliate_tier3_amount,0))*5);
  IF amount<=0 THEN CONTINUE; END IF;
  UPDATE public.grow_lead_authorizations SET status='superseded',updated_at=now() WHERE listing_id=listing_row.id AND status='pending';
  INSERT INTO public.grow_lead_authorizations(workspace_owner_id,listing_id,amount_ils) VALUES(owner_id,listing_row.id,amount) RETURNING id INTO job;
  PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/grow-lead-billing',headers:=public.internal_call_headers(),body:=jsonb_build_object('action','authorize','job_id',job),timeout_milliseconds:=120000);
 END LOOP;
 RETURN NEW;
END $$;