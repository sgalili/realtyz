-- ============================================================================
-- TEAM INVITATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, role)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invitations"
  ON public.team_invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Invitees view their own invitations"
  ON public.team_invitations FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.email(), '')));

-- ============================================================================
-- PERMISSION HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'super_admin'::app_role,
                   'agent'::app_role, 'assistant'::app_role, 'junior_agent'::app_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_close_deal(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('agent'::app_role, 'admin'::app_role, 'super_admin'::app_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_data(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_team_member(_user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_close_deal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_data(uuid) FROM anon;

-- ============================================================================
-- DEAL ROOM COMMENTS (internal-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.deal_room_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  author_id uuid NOT NULL,
  author_email text,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_room_comments_lead ON public.deal_room_comments(lead_id, created_at DESC);

ALTER TABLE public.deal_room_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members read deal_room_comments"
  ON public.deal_room_comments FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members insert deal_room_comments"
  ON public.deal_room_comments FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()) AND author_id = auth.uid());

CREATE POLICY "Author or admin delete deal_room_comments"
  ON public.deal_room_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- AUTO-CLAIM PENDING INVITATIONS ON SIGNUP
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_pending_team_invitations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, ti.role
  FROM public.team_invitations ti
  WHERE lower(ti.email) = lower(NEW.email)
    AND ti.status = 'pending'
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.team_invitations
  SET status = 'accepted', accepted_by = NEW.id, accepted_at = now()
  WHERE lower(email) = lower(NEW.email) AND status = 'pending';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_claim_invites ON auth.users;
CREATE TRIGGER on_auth_user_created_claim_invites
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.claim_pending_team_invitations();