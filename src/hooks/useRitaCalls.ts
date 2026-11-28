import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useWorkspace } from './useWorkspace';
import { useDemoMode } from './useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { parseRitaCallSummary, type RitaCallSummaryData } from '@/lib/ritaCallSummary';

export function useRitaProfileCalls() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['rita-profile-calls', user?.id, activeWorkspaceId],
    enabled: !!user && !isDemoMode,
    staleTime: 60000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('rita_latest_profile_calls').abortSignal(signal);
      if (error) throw error;
      const result: Record<string, RitaCallSummaryData> = {};
      for (const item of Array.isArray(data) ? data : []) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const summary = parseRitaCallSummary(item['summary']);
        if (typeof item['user_id'] === 'string' && summary) result[item['user_id']] = summary;
      }
      return result;
    },
  });
}

export function useRitaCallTranscript(recordId: string | null, expanded: boolean) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ['rita-call-transcript', user?.id, activeWorkspaceId, recordId],
    enabled: !!user && !!recordId && expanded,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      if (!recordId) return null;
      const { data, error } = await supabase.from('call_records').select('transcript_text').eq('id', recordId).abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data?.transcript_text ?? null;
    },
  });
}

export function useRitaLeadCalls(leadId: string, limit: number) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['rita-lead-calls', user?.id, activeWorkspaceId, leadId, limit],
    enabled: !!user && !!leadId && !isDemoMode,
    staleTime: 60000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('call_records')
        .select('id,started_at,direction,duration_seconds,handled_by,status,summary,needs_callback,callback_reason,metadata')
        .eq('lead_id', leadId).order('started_at', { ascending: false }).limit(Math.min(20, Math.max(1, limit))).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
}