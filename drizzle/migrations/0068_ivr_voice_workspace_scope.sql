ALTER TABLE public.cloned_voices ADD COLUMN IF NOT EXISTS workspace_owner_id uuid DEFAULT public.current_workspace_owner();
UPDATE public.cloned_voices SET workspace_owner_id = user_id;
DROP POLICY IF EXISTS "Users manage own cloned_voices" ON public.cloned_voices;
DROP POLICY IF EXISTS "superadmin_tenant_full_access" ON public.cloned_voices;
CREATE POLICY "Workspace reads cloned voices" ON public.cloned_voices FOR SELECT TO authenticated USING (public.ws_current_access(workspace_owner_id));
CREATE POLICY "Workspace creates own cloned voices" ON public.cloned_voices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.ws_current_access(workspace_owner_id));
CREATE POLICY "Workspace updates own cloned voices" ON public.cloned_voices FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.ws_current_access(workspace_owner_id)) WITH CHECK (user_id = auth.uid() AND public.ws_current_access(workspace_owner_id));
CREATE POLICY "Workspace deletes own cloned voices" ON public.cloned_voices FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.ws_current_access(workspace_owner_id));