CREATE TABLE public.action_pricing (
  action_key text PRIMARY KEY,
  label_he text NOT NULL,
  unit_he text NOT NULL DEFAULT 'פעולה',
  price_agorot numeric NOT NULL DEFAULT 0 CHECK (price_agorot >= 0),
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.action_pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.action_pricing TO authenticated;
GRANT ALL ON public.action_pricing TO service_role;
ALTER TABLE public.action_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing readable" ON public.action_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing superadmin update" ON public.action_pricing FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "pricing superadmin insert" ON public.action_pricing FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.action_pricing (action_key,label_he,unit_he,price_agorot,sort_order) VALUES
 ('whatsapp_marketing','הודעת וואטסאפ שיווקית','הודעה',20,1),
 ('sms','הודעת SMS','הודעה',4,2),
 ('email','אימייל','הודעה',4,3),
 ('ai_heavy','פעולת AI כבדה (פוסט/ניתוח)','פעולה',8,4),
 ('rita_chat','הודעת צ׳אט עם ריטה','הודעה',0.4,5),
 ('ai_call_minute','שיחת AI טלפונית / IVR','דקה',40,6);

CREATE OR REPLACE FUNCTION public.charge_action(_user_id uuid, _action text, _quantity numeric DEFAULT 1, _reference_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p numeric; _label text; _ils numeric;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT price_agorot, label_he INTO _p, _label FROM public.action_pricing WHERE action_key = _action;
  IF _p IS NULL THEN RAISE EXCEPTION 'unknown action %', _action; END IF;
  _ils := round(_p * greatest(_quantity,0) / 100.0, 4);
  IF _ils = 0 THEN RETURN NULL; END IF;
  RETURN public.add_credit(_user_id, -_ils, 'action_charge', _reference_id,
    _action || '|' || _quantity::text || '|' || _label);
END $$;
REVOKE ALL ON FUNCTION public.charge_action(uuid,text,numeric,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.charge_action(uuid,text,numeric,uuid) TO authenticated, service_role;