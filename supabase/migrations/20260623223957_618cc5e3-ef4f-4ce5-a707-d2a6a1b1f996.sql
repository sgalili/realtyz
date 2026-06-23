DROP POLICY IF EXISTS "messages_select_orphan_admin_recovery" ON public.messages;
CREATE POLICY "messages_select_orphan_admin_recovery"
ON public.messages
FOR SELECT
TO authenticated
USING (
  lead_id IS NULL
  AND is_admin_or_above(auth.uid())
  AND platform = 'whatsapp'
  AND direction = 'inbound'
  AND ((metadata ->> 'sender_phone') IS NOT NULL)
);