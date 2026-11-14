ALTER TABLE public.grow_payment_orders ADD COLUMN card_mandate boolean NOT NULL DEFAULT false, ADD COLUMN mandate_at timestamptz;
CREATE TABLE public.grow_saved_cards (
 workspace_owner_id uuid PRIMARY KEY REFERENCES public.profiles(id), order_id uuid NOT NULL REFERENCES public.grow_payment_orders(id),
 vault_reference text NOT NULL, last4 text NOT NULL CHECK(last4 ~ '^[0-9]{4}$'), brand text NOT NULL,
 consent_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT(workspace_owner_id,last4,brand,consent_at,revoked_at,created_at) ON public.grow_saved_cards TO authenticated;
GRANT ALL ON public.grow_saved_cards TO service_role;
ALTER TABLE public.grow_saved_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY grow_cards_self_read ON public.grow_saved_cards FOR SELECT TO authenticated USING(workspace_owner_id=auth.uid());
CREATE FUNCTION public.save_grow_card_reference(_order_id uuid,_reference text,_last4 text,_brand text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.grow_payment_orders;
BEGIN
 SELECT * INTO o FROM public.grow_payment_orders WHERE id=_order_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'paid' OR o.environment<>'live' OR o.payment_method<>'card' OR NOT o.card_mandate OR o.mandate_at IS NULL THEN RAISE EXCEPTION 'no_card_mandate'; END IF;
 IF nullif(_reference,'') IS NULL OR length(_reference)>200 OR _last4 !~ '^[0-9]{4}$' OR _brand IS NULL OR length(_brand)>30 THEN RAISE EXCEPTION 'invalid_card_reference'; END IF;
 INSERT INTO public.grow_saved_cards(workspace_owner_id,order_id,vault_reference,last4,brand,consent_at) VALUES(o.user_id,o.id,_reference,_last4,_brand,o.mandate_at)
 ON CONFLICT(workspace_owner_id) DO UPDATE SET order_id=excluded.order_id,vault_reference=excluded.vault_reference,last4=excluded.last4,brand=excluded.brand,consent_at=excluded.consent_at,revoked_at=NULL
 WHERE grow_saved_cards.consent_at < excluded.consent_at;
END $$;
REVOKE ALL ON FUNCTION public.save_grow_card_reference(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_grow_card_reference(uuid,text,text,text) TO service_role;
CREATE FUNCTION public.revoke_grow_card_mandate() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 UPDATE public.grow_saved_cards SET revoked_at=now() WHERE workspace_owner_id=auth.uid() AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.revoke_grow_card_mandate() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_grow_card_mandate() TO authenticated;
CREATE TABLE public.grow_lead_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_owner_id uuid NOT NULL REFERENCES public.profiles(id), listing_id uuid NOT NULL REFERENCES public.listings(id),
 amount_ils numeric NOT NULL CHECK(amount_ils>=0), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','verified','declined','unavailable','uncertain','superseded')),
 provider_reference text, expires_at timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grow_lead_authorizations TO authenticated;
GRANT ALL ON public.grow_lead_authorizations TO service_role;
ALTER TABLE public.grow_lead_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY grow_auth_self ON public.grow_lead_authorizations FOR SELECT TO authenticated USING(workspace_owner_id=auth.uid());
CREATE FUNCTION public.enqueue_grow_lead_authorization() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; listing_row public.listings; cap numeric; amount numeric; job uuid;
BEGIN
 IF TG_TABLE_NAME='listings' THEN owner_id:=NEW.workspace_owner_id; ELSE owner_id:=NEW.user_id; END IF;
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.grow_saved_cards WHERE workspace_owner_id=owner_id AND revoked_at IS NULL) THEN RETURN NEW; END IF;
 SELECT daily_spend_ils INTO cap FROM public.account_lead_limits WHERE user_id=owner_id;
 FOR listing_row IN SELECT * FROM public.listings WHERE workspace_owner_id=owner_id AND (TG_TABLE_NAME<>'listings' OR id=NEW.id) LOOP
  amount:=coalesce(cap,greatest(coalesce(listing_row.affiliate_tier1_amount,0),coalesce(listing_row.affiliate_tier2_amount,0),coalesce(listing_row.affiliate_tier3_amount,0))*5);
  IF amount<=0 THEN CONTINUE; END IF;
  UPDATE public.grow_lead_authorizations SET status='superseded',updated_at=now() WHERE listing_id=listing_row.id AND status='pending';
  INSERT INTO public.grow_lead_authorizations(workspace_owner_id,listing_id,amount_ils) VALUES(owner_id,listing_row.id,amount) RETURNING id INTO job;
  PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/grow-lead-billing',headers:=public.internal_call_headers(),body:=jsonb_build_object('action','authorize','job_id',job),timeout_milliseconds:=120000);
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_grow_lead_authorization() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER grow_lead_prices_authorize AFTER INSERT OR UPDATE OF affiliate_tier1_amount,affiliate_tier2_amount,affiliate_tier3_amount ON public.listings FOR EACH ROW EXECUTE FUNCTION public.enqueue_grow_lead_authorization();
CREATE TRIGGER grow_daily_cap_authorize AFTER INSERT OR UPDATE OF daily_spend_ils ON public.account_lead_limits FOR EACH ROW EXECUTE FUNCTION public.enqueue_grow_lead_authorization();