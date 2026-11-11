import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ADMIN_SECTIONS, adminSectionLabel, resolveAdminSection } from '@/lib/superAdminSections';

// The blue page hero carries the Super Admin section switcher in place of the
// static title, so the page body reads the same ?section= value it writes.
export function SuperAdminSectionSelect() {
  const [params, setParams] = useSearchParams();
  const { isSuperAdmin } = useUserRole();
  const section = resolveAdminSection(params.get('section'));

  // Shares the connections view's query key, so react-query keeps one fetch.
  const { data } = useQuery({
    queryKey: ['admin-connection-health'],
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('admin_leads')
        .select('id')
        .eq('lead_type', 'connection_health')
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(100);
      return (data ?? []) as Array<{ id: string }>;
    },
  });
  const openAlerts = data?.length ?? 0;

  const choose = (value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('section', value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="pointer-events-auto w-[min(72vw,300px)]">
      <Select value={section} onValueChange={choose}>
        <SelectTrigger
          aria-label="אזור ניהול"
          className="h-10 w-full border-white/35 bg-white/15 text-sm font-semibold text-white shadow-none hover:bg-white/25 focus:ring-white/40 [&>svg]:text-white"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ADMIN_SECTIONS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <span className="flex items-center gap-2">
                <item.icon className="h-4 w-4 shrink-0 text-primary" />
                {adminSectionLabel(item.value, openAlerts)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default SuperAdminSectionSelect;
