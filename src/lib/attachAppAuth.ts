import { createMiddleware } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';

export const attachAppAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  return next({ headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});