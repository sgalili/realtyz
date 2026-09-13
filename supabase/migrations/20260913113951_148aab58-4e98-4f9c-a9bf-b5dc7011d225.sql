CREATE TABLE public.affiliate_conversation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_reason text NOT NULL CHECK (access_reason IN ('rita_onboarding', 'inviting_broker')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, workspace_owner_id),
  UNIQUE (affiliate_user_id, workspace_owner_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_conversation_access TO authenticated;
GRANT ALL ON public.affiliate_conversation_access TO service_role;

ALTER TABLE public.affiliate_conversation_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linked workspaces read affiliate conversation access"
ON public.affiliate_conversation_access
FOR SELECT TO authenticated
USING (
  public.current_workspace_owner() = workspace_owner_id
  AND (
    workspace_owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id = affiliate_conversation_access.workspace_owner_id
        AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

CREATE POLICY "service role manages affiliate conversation access"
ON public.affiliate_conversation_access
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER affiliate_conversation_access_touch
BEFORE UPDATE ON public.affiliate_conversation_access
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_lead_in_current_workspace(_lead_id uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.in_current_workspace(_assigned_to)
    OR EXISTS (
      SELECT 1
      FROM public.affiliate_conversation_access aca
      WHERE aca.lead_id = _lead_id
        AND aca.workspace_owner_id = public.current_workspace_owner()
        AND (
          aca.workspace_owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.workspace_memberships wm
            WHERE wm.workspace_owner_id = aca.workspace_owner_id
              AND wm.user_id = auth.uid()
          )
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_lead_in_current_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_lead_in_current_workspace(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_affiliate_onboarding_access(_affiliate_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rita_owner uuid;
  _inviter uuid;
  _lead_id uuid;
  _name text;
  _email text;
  _profile_phone text;
  _affiliate_phone text;
  _phone text;
BEGIN
  SELECT p.id INTO _rita_owner
  FROM public.profiles p
  WHERE regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') IN ('0537983832', '972537983832')
     OR lower(COALESCE(p.full_name, '')) = 'rita'
     OR p.full_name = 'ריטה'
  ORDER BY CASE WHEN regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') IN ('0537983832', '972537983832') THEN 0 ELSE 1 END
  LIMIT 1;

  IF _rita_owner IS NULL THEN
    RAISE EXCEPTION 'rita_workspace_not_found';
  END IF;

  SELECT p.full_name, p.email, p.phone, ap.phone
    INTO _name, _email, _profile_phone, _affiliate_phone
  FROM public.profiles p
  LEFT JOIN public.affiliate_profiles ap ON ap.user_id = p.id
  WHERE p.id = _affiliate_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'affiliate_profile_not_found';
  END IF;

  _phone := regexp_replace(COALESCE(NULLIF(_affiliate_phone, ''), NULLIF(_profile_phone, ''), ''), '\D', '', 'g');
  IF _phone LIKE '05%' THEN
    _phone := '972' || substring(_phone FROM 2);
  END IF;
  IF _phone = '' THEN
    _phone := 'affiliate:' || _affiliate_user_id::text;
  END IF;

  SELECT aca.lead_id INTO _lead_id
  FROM public.affiliate_conversation_access aca
  WHERE aca.affiliate_user_id = _affiliate_user_id
  ORDER BY aca.created_at
  LIMIT 1;

  IF _lead_id IS NULL THEN
    SELECT l.id INTO _lead_id
    FROM public.leads l
    WHERE l.assigned_to = _rita_owner
      AND l.phone_number = _phone
    LIMIT 1;
  END IF;

  IF _lead_id IS NULL THEN
    INSERT INTO public.leads (
      phone_number, full_name, email, assigned_to, lead_stage, status,
      ai_autopilot, deal_type, preferences, is_demo
    ) VALUES (
      _phone,
      COALESCE(NULLIF(_name, ''), NULLIF(_email, ''), 'שותף חדש'),
      NULLIF(_email, ''),
      _rita_owner,
      'new_lead',
      'new',
      true,
      'sale',
      jsonb_build_object(
        'lead_kind', 'broker',
        'source', 'affiliate_signup',
        'affiliate_user_id', _affiliate_user_id,
        'rita_onboarding', true
      ),
      false
    ) RETURNING id INTO _lead_id;
  ELSE
    UPDATE public.leads
    SET full_name = COALESCE(NULLIF(_name, ''), full_name),
        email = COALESCE(NULLIF(_email, ''), email),
        phone_number = CASE WHEN _phone LIKE 'affiliate:%' THEN phone_number ELSE _phone END,
        ai_autopilot = true,
        preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(
          'lead_kind', 'broker',
          'source', 'affiliate_signup',
          'affiliate_user_id', _affiliate_user_id,
          'rita_onboarding', true
        )
    WHERE id = _lead_id;
  END IF;

  INSERT INTO public.affiliate_conversation_access (
    affiliate_user_id, lead_id, workspace_owner_id, access_reason
  ) VALUES (
    _affiliate_user_id, _lead_id, _rita_owner, 'rita_onboarding'
  ) ON CONFLICT (affiliate_user_id, workspace_owner_id)
  DO UPDATE SET lead_id = EXCLUDED.lead_id, access_reason = EXCLUDED.access_reason, updated_at = now();

  SELECT r.referrer_id INTO _inviter
  FROM public.referrals r
  WHERE r.referred_user_id = _affiliate_user_id
  ORDER BY r.created_at
  LIMIT 1;

  IF _inviter IS NOT NULL AND _inviter <> _rita_owner THEN
    INSERT INTO public.affiliate_conversation_access (
      affiliate_user_id, lead_id, workspace_owner_id, access_reason
    ) VALUES (
      _affiliate_user_id, _lead_id, _inviter, 'inviting_broker'
    ) ON CONFLICT (affiliate_user_id, workspace_owner_id)
    DO UPDATE SET lead_id = EXCLUDED.lead_id, access_reason = EXCLUDED.access_reason, updated_at = now();
  END IF;

  RETURN _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_affiliate_onboarding_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_affiliate_onboarding_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.register_as_affiliate(_display_name text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lead_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'affiliate'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.affiliate_profiles (user_id, display_name, phone)
  VALUES (_uid, _display_name, _phone)
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, affiliate_profiles.display_name),
        phone = COALESCE(EXCLUDED.phone, affiliate_profiles.phone),
        updated_at = now();

  _lead_id := public.ensure_affiliate_onboarding_access(_uid);

  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'onboarding_lead_id', _lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_as_affiliate(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_affiliate(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_referral(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer uuid;
  _lead_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_attributed');
  END IF;
  SELECT id INTO _referrer FROM public.profiles WHERE referral_code = upper(btrim(_code));
  IF _referrer IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code'); END IF;
  IF _referrer = auth.uid() THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_referral'); END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referral_code, status)
  VALUES (_referrer, auth.uid(), upper(btrim(_code)), 'registered_free')
  ON CONFLICT (referred_user_id) DO NOTHING;

  IF public.is_affiliate(auth.uid()) THEN
    _lead_id := public.ensure_affiliate_onboarding_access(auth.uid());
  END IF;

  RETURN jsonb_build_object('ok', true, 'referrer_id', _referrer, 'onboarding_lead_id', _lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_referral(text) TO authenticated;

DROP POLICY IF EXISTS "leads_select_workspace" ON public.leads;
CREATE POLICY "leads_select_workspace" ON public.leads
FOR SELECT TO authenticated
USING (
  ((NOT is_demo) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND public.can_access_lead_in_current_workspace(id, assigned_to)
  AND ((NOT public.is_junior_agent(auth.uid())) OR assigned_to = auth.uid())
);

DROP POLICY IF EXISTS "leads_update_workspace" ON public.leads;
CREATE POLICY "leads_update_workspace" ON public.leads
FOR UPDATE TO authenticated
USING (
  public.can_access_lead_in_current_workspace(id, assigned_to)
  AND ((NOT public.is_junior_agent(auth.uid())) OR assigned_to = auth.uid())
)
WITH CHECK (
  public.can_access_lead_in_current_workspace(id, assigned_to)
  AND ((NOT public.is_junior_agent(auth.uid())) OR assigned_to = auth.uid())
);

DROP POLICY IF EXISTS "messages_select_by_lead_workspace" ON public.messages;
CREATE POLICY "messages_select_by_lead_workspace" ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = messages.lead_id
      AND public.can_access_lead_in_current_workspace(l.id, l.assigned_to)
  )
);

DROP POLICY IF EXISTS "messages_delete_by_lead_workspace" ON public.messages;
CREATE POLICY "messages_delete_by_lead_workspace" ON public.messages
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = messages.lead_id
      AND public.can_access_lead_in_current_workspace(l.id, l.assigned_to)
  )
);

DROP POLICY IF EXISTS "chat_history_select_by_lead_workspace" ON public.chat_history;
CREATE POLICY "chat_history_select_by_lead_workspace" ON public.chat_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = chat_history.lead_id
      AND public.can_access_lead_in_current_workspace(l.id, l.assigned_to)
  )
);

DROP POLICY IF EXISTS "chat_history_delete_by_lead_workspace" ON public.chat_history;
CREATE POLICY "chat_history_delete_by_lead_workspace" ON public.chat_history
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = chat_history.lead_id
      AND public.can_access_lead_in_current_workspace(l.id, l.assigned_to)
  )
);