import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isDemoType, type DemoType } from '@/pages/demo/demoData';

/** Server-confirmed demo account status of the signed-in session. */
export function useDemoViewStatus(): { type: DemoType | null; loading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['demo-view-type', user?.id ?? null],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_demo_view_type');
      if (error) return null;
      return isDemoType(data as string) ? (data as DemoType) : null;
    },
  });
  return { type: user?.id ? data ?? null : null, loading: !!user?.id && isLoading };
}

export function useDemoViewType(): DemoType | null {
  return useDemoViewStatus().type;
}

export function DemoViewBar() {
  const type = useDemoViewType();
  useEffect(() => {
    if (type) window.location.assign(`/demo/${type}`);
  }, [type]);
  return null;
}
