-- Allow authenticated users to delete real (non-demo) voter rows.
-- Demo rows can only be removed by admins to keep the shared demo dataset intact.
CREATE POLICY "Authenticated users can delete real voters"
  ON public.voters
  FOR DELETE
  TO authenticated
  USING (NOT is_demo OR has_role(auth.uid(), 'admin'::app_role));