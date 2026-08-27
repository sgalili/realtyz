import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type QuickTemplate = {
  id: string;
  user_id: string;
  title: string;
  channel: 'whatsapp' | 'sms' | 'both';
  body: string;
  scope: 'lead' | 'listing' | 'both';
  sort_order: number;
  is_active: boolean;
};

export type TemplateVars = {
  name?: string | null;
  city?: string | null;
  property?: string | null;
  price?: string | number | null;
  agent?: string | null;
};

export function fillTemplate(body: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    name: (vars.name || '').trim(),
    city: (vars.city || '').trim(),
    property: (vars.property || '').trim(),
    price: vars.price != null && vars.price !== '' ? String(vars.price) : '',
    agent: (vars.agent || '').trim(),
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => map[key] ?? '');
}

export function useQuickTemplates(scope?: 'lead' | 'listing') {
  return useQuery({
    queryKey: ['quick-templates', scope ?? 'all'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [] as QuickTemplate[];
      let q = supabase
        .from('quick_message_templates')
        .select('*')
        .eq('user_id', auth.user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (scope) q = q.in('scope', [scope, 'both']);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as QuickTemplate[];
    },
    staleTime: 60_000,
  });
}

export function useSaveQuickTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<QuickTemplate> & { title: string; body: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('לא מחובר');
      const row = {
        user_id: auth.user.id,
        title: payload.title,
        body: payload.body,
        channel: payload.channel ?? 'whatsapp',
        scope: payload.scope ?? 'lead',
        sort_order: payload.sort_order ?? 99,
        is_active: true,
      };
      if (payload.id) {
        const { error } = await supabase.from('quick_message_templates').update(row).eq('id', payload.id);
        if (error) throw error;
        return payload.id;
      }
      const { data, error } = await supabase.from('quick_message_templates').insert(row).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-templates'] }),
  });
}

export function useDeleteQuickTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quick_message_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-templates'] }),
  });
}
