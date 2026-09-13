DROP FUNCTION IF EXISTS public.save_workspace_office(uuid, text, text, text, text[]);

DROP POLICY IF EXISTS "Workspace members insert owner branding" ON public.white_label_settings;
CREATE POLICY "Workspace members insert owner branding"
ON public.white_label_settings FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships wm
    WHERE wm.workspace_owner_id = white_label_settings.user_id
      AND wm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "Workspace members update owner branding" ON public.white_label_settings;
CREATE POLICY "Workspace members update owner branding"
ON public.white_label_settings FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships wm
    WHERE wm.workspace_owner_id = white_label_settings.user_id
      AND wm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships wm
    WHERE wm.workspace_owner_id = white_label_settings.user_id
      AND wm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "Workspace members update owner office profile" ON public.profiles;
CREATE POLICY "Workspace members update owner office profile"
ON public.profiles FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships wm
    WHERE wm.workspace_owner_id = profiles.id
      AND wm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships wm
    WHERE wm.workspace_owner_id = profiles.id
      AND wm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);