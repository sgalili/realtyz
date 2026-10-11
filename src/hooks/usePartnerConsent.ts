import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function usePartnerConsent() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['partner-consent', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.from('profiles').select('partner_terms_accepted_at').eq('id', user.id).single();
      if (error) throw error;
      return !!data.partner_terms_accepted_at;
    },
  });
}