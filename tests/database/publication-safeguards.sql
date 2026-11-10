-- Run with a privileged managed connection; every mutation is rolled back.
BEGIN;
DO $$
DECLARE owner uuid; wallet uuid; ref uuid:=gen_random_uuid(); allowed boolean:=false;
BEGIN
 SELECT id INTO owner FROM public.profiles ORDER BY created_at LIMIT 1;
 IF owner IS NULL THEN RAISE EXCEPTION 'An existing account is required'; END IF;
 wallet:=public.ensure_credit_wallet(owner);
 -- Use a fresh reference; existing real charges cannot cause a false pass.
 INSERT INTO public.account_lead_limits(user_id,daily_count,daily_spend_ils) VALUES(owner,NULL,1)
 ON CONFLICT(user_id) DO UPDATE SET daily_count=NULL,daily_spend_ils=1;
 BEGIN
  INSERT INTO public.credit_transactions(wallet_id,user_id,amount_ils,type,reference_id) VALUES(wallet,owner,-2,'affiliate_lead_charge',ref);
  allowed:=true;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'החיוב נעצר:%' THEN RAISE; END IF;
 END;
 IF allowed THEN RAISE EXCEPTION '₪2 must not exceed a ₪1 daily budget'; END IF;
 IF EXISTS(SELECT 1 FROM public.credit_transactions WHERE reference_id=ref) THEN RAISE EXCEPTION 'Rejected charge persisted'; END IF;
END $$;
DO $$
DECLARE owner uuid; wallet uuid; ref uuid:=gen_random_uuid(); used integer; allowed boolean:=false;
BEGIN
 SELECT id INTO owner FROM public.profiles ORDER BY created_at LIMIT 1;
 wallet:=public.ensure_credit_wallet(owner);
 SELECT count(DISTINCT coalesce(reference_id,id)) INTO used FROM public.credit_transactions WHERE user_id=owner AND type='affiliate_lead_charge' AND amount_ils<0 AND created_at>now()-interval '24 hours';
 INSERT INTO public.account_lead_limits(user_id,daily_count,daily_spend_ils) VALUES(owner,greatest(used+1,1),NULL)
 ON CONFLICT(user_id) DO UPDATE SET daily_count=greatest(used+1,1),daily_spend_ils=NULL;
 INSERT INTO public.credit_transactions(wallet_id,user_id,amount_ils,type,reference_id) VALUES(wallet,owner,-1,'affiliate_lead_charge',ref);
 -- Upgrading an already counted lead does not consume a second count slot.
 INSERT INTO public.credit_transactions(wallet_id,user_id,amount_ils,type,reference_id) VALUES(wallet,owner,-1,'affiliate_lead_charge',ref);
 BEGIN
  INSERT INTO public.credit_transactions(wallet_id,user_id,amount_ils,type,reference_id) VALUES(wallet,owner,-1,'affiliate_lead_charge',gen_random_uuid());
  allowed:=true;
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'החיוב נעצר:%' THEN RAISE; END IF; END;
 IF allowed THEN RAISE EXCEPTION 'Account count must stop the next distinct paid lead'; END IF;
END $$;
DO $$
DECLARE k text; owner uuid; blocked boolean:=false;
BEGIN
 k:=public.listing_source_identity('https://www.yad2.co.il/realestate/item/regressionproof?tracking=1','regressionproof','yad2');
 IF k IS DISTINCT FROM public.listing_source_identity('https://yad2.co.il/realestate/item/regressionproof','regressionproof','manual') THEN RAISE EXCEPTION 'Yad2 identity must ignore hostname, tracking and changed source enum'; END IF;
 SELECT id INTO owner FROM public.profiles ORDER BY created_at LIMIT 1;
 INSERT INTO public.listing_source_tombstones(workspace_owner_id,source_key) VALUES(owner,k);
 BEGIN
  INSERT INTO public.listings(user_id,workspace_owner_id,slug,source,source_url,external_id,status,is_published,affiliate_enabled) VALUES(owner,owner,'regression-'||gen_random_uuid(),'yad2','https://www.yad2.co.il/realestate/item/regressionproof','regressionproof','pending',false,false);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'הנכס הוסר או נמכר%' THEN RAISE; END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Removed exact source must never reimport'; END IF;
END $$;
ROLLBACK;