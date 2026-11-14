ALTER TABLE public.grow_payment_orders ADD COLUMN customer_phone text, ADD COLUMN payment_method text;
CREATE TABLE public.payment_sms_outbox (
 order_id uuid PRIMARY KEY REFERENCES public.grow_payment_orders(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','uncertain')),
 attempts integer NOT NULL DEFAULT 0, provider_message_id text, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
GRANT ALL ON public.payment_sms_outbox TO service_role;
REVOKE ALL ON public.payment_sms_outbox FROM anon,authenticated;
ALTER TABLE public.payment_sms_outbox ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.enqueue_payment_sms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.environment='live' THEN
  INSERT INTO public.payment_sms_outbox(order_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_payment_sms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER grow_paid_sms AFTER UPDATE OF status ON public.grow_payment_orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_payment_sms();
CREATE FUNCTION public.claim_payment_sms(_order_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.payment_sms_outbox SET status='sending', attempts=attempts+1 WHERE order_id=_order_id AND status='pending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_payment_sms(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_sms(uuid) TO service_role;