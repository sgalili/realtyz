-- 1) Add assigned_to column on leads + index
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);

-- 2) Helper functions (all SECURITY DEFINER, search_path locked)
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role,
        'managing_broker'::app_role, 'lead_agent'::app_role,
        'agent'::app_role, 'assistant'::app_role, 'junior_agent'::app_role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_close_deal(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role,
        'managing_broker'::app_role, 'lead_agent'::app_role,
        'agent'::app_role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_use_closing_room(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role,
        'managing_broker'::app_role, 'lead_agent'::app_role,
        'agent'::app_role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_broker_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role, 'managing_broker'::app_role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_delete_prospects(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role,
        'managing_broker'::app_role, 'lead_agent'::app_role,
        'agent'::app_role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_junior_agent(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'junior_agent'::app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role,
        'managing_broker'::app_role, 'lead_agent'::app_role,
        'agent'::app_role, 'assistant'::app_role
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_close_deal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_use_closing_room(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_broker_or_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_delete_prospects(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_junior_agent(uuid) FROM anon;

-- 3) Tighten leads RLS so Junior Agents only see their own assigned prospects
DROP POLICY IF EXISTS "Authenticated users can read leads" ON public.leads;
CREATE POLICY "Team members read leads (junior limited)"
  ON public.leads FOR SELECT TO authenticated
  USING (
    ((NOT is_demo) OR public.has_role(auth.uid(), 'admin'::app_role))
    AND (
      NOT public.is_junior_agent(auth.uid())
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update leads" ON public.leads;
CREATE POLICY "Team members update leads (junior limited)"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      NOT public.is_junior_agent(auth.uid())
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete real leads" ON public.leads;
CREATE POLICY "Only senior roles delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (
    ((NOT is_demo) OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.can_delete_prospects(auth.uid())
  );

-- 4) Block closing-room access for Assistants / Junior Agents
DROP POLICY IF EXISTS "Owner or team manages closing_documents" ON public.closing_documents;
CREATE POLICY "Closing-room roles manage closing_documents"
  ON public.closing_documents FOR ALL TO authenticated
  USING (
    (user_id = auth.uid() AND public.can_use_closing_room(auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (user_id = auth.uid() AND public.can_use_closing_room(auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 5) Tighten team_invitations to Managing Broker / Admin only
DROP POLICY IF EXISTS "Admins manage invitations" ON public.team_invitations;
CREATE POLICY "Brokers and admins manage invitations"
  ON public.team_invitations FOR ALL TO authenticated
  USING (public.is_broker_or_admin(auth.uid()))
  WITH CHECK (public.is_broker_or_admin(auth.uid()));

-- 6) Audit-log trigger: record stage changes and assignment changes
CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _email text := NULLIF(auth.email(), '');
BEGIN
  IF _actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.lead_stage,'') IS DISTINCT FROM coalesce(OLD.lead_stage,'') THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, action, target_table, target_id, details)
    VALUES (
      _actor, _email,
      'lead.stage_changed',
      'leads', NEW.id::text,
      jsonb_build_object(
        'from', OLD.lead_stage,
        'to',   NEW.lead_stage,
        'lead_name', NEW.full_name
      )
    );
  END IF;

  IF coalesce(NEW.assigned_to::text,'') IS DISTINCT FROM coalesce(OLD.assigned_to::text,'') THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, action, target_table, target_id, details)
    VALUES (
      _actor, _email,
      'lead.assigned',
      'leads', NEW.id::text,
      jsonb_build_object(
        'from', OLD.assigned_to,
        'to',   NEW.assigned_to,
        'lead_name', NEW.full_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead_changes ON public.leads;
CREATE TRIGGER trg_log_lead_changes
  AFTER UPDATE OF lead_stage, assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();