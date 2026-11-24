import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { importJobPollInterval } from '@/lib/importJobMonitoring';
import { useSuperAdminGate } from './useSuperAdminGate';

/** Used only inside authorized Super Admin import views; existing table RLS remains authoritative. */
export function useAdminImportJobs() {
  const gate = useSuperAdminGate();
  return useQuery({
    queryKey: ['admin-broker-import-jobs', gate.uid],
    enabled: gate.enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('broker_import_jobs').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: query => importJobPollInterval(query.state.data),
    refetchIntervalInBackground: false,
  });
}