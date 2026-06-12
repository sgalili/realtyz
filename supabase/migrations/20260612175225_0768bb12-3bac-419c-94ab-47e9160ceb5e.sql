
-- 1. workspace_memberships table
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_owner_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  workspace_name text,
  workspace_logo_url text,
  account_type text,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_owner_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_memberships TO authenticated;
GRANT ALL ON public.workspace_memberships TO service_role;

ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own memberships"
  ON public.workspace_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR workspace_owner_id = auth.uid() OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "User updates own membership last_accessed"
  ON public.workspace_memberships FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Workspace owner manages members"
  ON public.workspace_memberships FOR ALL TO authenticated
  USING (workspace_owner_id = auth.uid() OR public.is_admin_or_above(auth.uid()))
  WITH CHECK (workspace_owner_id = auth.uid() OR public.is_admin_or_above(auth.uid()));

CREATE TRIGGER trg_workspace_memberships_updated
  BEFORE UPDATE ON public.workspace_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS active_workspace_owner_id uuid;

-- 3. Backfill: one self-owner membership per profile
INSERT INTO public.workspace_memberships (user_id, workspace_owner_id, role, workspace_name)
SELECT p.id, p.id, 'owner', COALESCE(p.full_name, p.email, 'My Workspace')
FROM public.profiles p
ON CONFLICT (user_id, workspace_owner_id) DO NOTHING;

-- 4. Auto-create self-owner membership for new profiles
CREATE OR REPLACE FUNCTION public.create_self_workspace_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workspace_memberships (user_id, workspace_owner_id, role, workspace_name)
  VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.full_name, NEW.email, 'My Workspace'))
  ON CONFLICT (user_id, workspace_owner_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_self_workspace ON public.profiles;
CREATE TRIGGER trg_profile_self_workspace
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_self_workspace_membership();

-- 5. get_my_workspaces
CREATE OR REPLACE FUNCTION public.get_my_workspaces()
RETURNS TABLE (
  workspace_owner_id uuid,
  user_id uuid,
  role text,
  workspace_name text,
  workspace_logo_url text,
  account_type text,
  last_accessed_at timestamptz,
  owner_full_name text,
  owner_email text,
  owner_avatar_url text,
  is_self boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    wm.workspace_owner_id,
    wm.user_id,
    wm.role,
    COALESCE(wm.workspace_name, p.full_name, p.email, 'Workspace') AS workspace_name,
    wm.workspace_logo_url,
    wm.account_type,
    wm.last_accessed_at,
    p.full_name AS owner_full_name,
    p.email AS owner_email,
    p.avatar_url AS owner_avatar_url,
    (wm.workspace_owner_id = wm.user_id) AS is_self
  FROM public.workspace_memberships wm
  LEFT JOIN public.profiles p ON p.id = wm.workspace_owner_id
  WHERE wm.user_id = auth.uid()
  ORDER BY (wm.workspace_owner_id = auth.uid()) DESC, wm.last_accessed_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_workspaces() TO authenticated;

-- 6. set_active_workspace
CREATE OR REPLACE FUNCTION public.set_active_workspace(_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE user_id = uid AND workspace_owner_id = _owner
  ) THEN
    RAISE EXCEPTION 'not a member of this workspace';
  END IF;

  UPDATE public.workspace_memberships
  SET last_accessed_at = now()
  WHERE user_id = uid AND workspace_owner_id = _owner;

  UPDATE public.profiles
  SET active_workspace_owner_id = _owner
  WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_workspace(uuid) TO authenticated;
