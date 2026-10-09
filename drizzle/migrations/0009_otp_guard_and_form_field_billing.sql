ALTER TABLE public.inquiry_guard_challenges
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'geo',
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz;
ALTER TABLE public.inquiry_guard_events
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.listing_lead_charges
  ADD COLUMN IF NOT EXISTS extra_fields_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_fee numeric NOT NULL DEFAULT 0;

-- Tier 1 (form) is billed ₪10 per extra custom field beyond name + phone; tiers 2/3 keep ₪10 per extra screening question.
DO $$ DECLARE src text; BEGIN
  src := pg_get_functiondef('public.charge_lead_commission(uuid,integer,uuid,uuid)'::regprocedure);
  IF position('form_fields' in src) = 0 THEN
    src := replace(src, ' v_gross:=v_base+v_extra*10;',
      ' IF _tier=1 AND jsonb_typeof(l.contact_options->''form_fields'')=''array'' THEN v_extra:=least(jsonb_array_length(l.contact_options->''form_fields''),20); END IF;
 v_gross:=v_base+v_extra*10;');
    src := replace(src, 'INSERT INTO public.listing_lead_charges(listing_id,workspace_owner_id,affiliate_id,tier,gross,is_leftover,lead_id) VALUES(l.id,v_owner,_affiliate_id,_tier,v_gross,public.listing_daily_cap_reached(l.id),ld.id)',
      'INSERT INTO public.listing_lead_charges(listing_id,workspace_owner_id,affiliate_id,tier,gross,is_leftover,lead_id,extra_fields_count,extra_fee) VALUES(l.id,v_owner,_affiliate_id,_tier,v_gross,public.listing_daily_cap_reached(l.id),ld.id,v_extra,v_extra*10)');
    src := replace(src, 'UPDATE public.listing_lead_charges SET tier=_tier,gross=greatest(gross,v_gross) WHERE id=c.id;',
      'UPDATE public.listing_lead_charges SET tier=_tier,gross=greatest(gross,v_gross),extra_fields_count=greatest(extra_fields_count,v_extra),extra_fee=greatest(extra_fee,v_extra*10) WHERE id=c.id;');
    EXECUTE src;
  END IF;
END $$;