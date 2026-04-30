
-- Add is_demo column to voters
ALTER TABLE public.voters ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- Add is_demo column to chat_history
ALTER TABLE public.chat_history ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- Update voters SELECT policy: admins see all, others see only non-demo
DROP POLICY IF EXISTS "Authenticated users can read voters" ON public.voters;
CREATE POLICY "Authenticated users can read voters"
  ON public.voters FOR SELECT TO authenticated
  USING (
    NOT is_demo OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Enable RLS on chat_history (if not already)
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- chat_history SELECT: admins see all, others see non-demo
CREATE POLICY "Authenticated users can read chat_history"
  ON public.chat_history FOR SELECT TO authenticated
  USING (
    NOT is_demo OR has_role(auth.uid(), 'admin'::app_role)
  );

-- chat_history INSERT for authenticated
CREATE POLICY "Authenticated users can insert chat_history"
  ON public.chat_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
