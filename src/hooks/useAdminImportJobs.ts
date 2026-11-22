import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { importJobPollInterval } from '@/lib/importJobMonitoring';

/** Used only inside authorized Super Admin import views; existing table RLS remains authoritative. */
export function useAdminImportJobs() {
  return useQuery({
    queryKey: ['admin-broker-import-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('broker_import_jobs').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: query => importJobPollInterval(query.state.data),
    refetchIntervalInBackground: false,
  });
}