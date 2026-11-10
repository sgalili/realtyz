import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BROKER_STAGE_LABELS, type BrokerOnboardingStatus } from '@/lib/brokerOnboarding';

export function BrokerOnboardingCue({ workspaceId }: { workspaceId: string | null }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['broker-onboarding', user?.id, workspaceId], enabled: !!user && workspaceId === user.id, refetchInterval: 30000, queryFn: async () => {
    if (!user) return null;
    const { data, error } = await supabase.rpc('broker_onboarding_status', { _broker: user.id });
    if (error) throw error;
    return data as BrokerOnboardingStatus | null;
  } });
  if (workspaceId !== user?.id || !query.data || query.data.stage === 'published') return null;
  return <div role="status" className="shrink-0 border-b border-border pb-2 text-sm text-primary">{BROKER_STAGE_LABELS[query.data.stage]}{query.data.stage === 'pending_property_review' && <span className="text-muted-foreground"> · {query.data.pending_properties} נכסים לבדיקה. יש לבדוק פרטים, להגדיר תגמולים ולאשר פרסום.</span>}</div>;
}