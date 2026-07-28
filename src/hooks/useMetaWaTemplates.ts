import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MetaWaTemplate = {
  name: string;
  language: string;
  category: string | null;
  status: string;
  body_text: string;
  variable_count: number;
  has_header_variable: boolean;
};

/**
 * Approved Meta WhatsApp message templates for the current workspace.
 * Proactive (outside the 24h customer-service window) sends must use one.
 */
export function useMetaWaTemplates(enabled = true) {
  return useQuery({
    queryKey: ['meta-wa-templates'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MetaWaTemplate[]> => {
      const { data, error } = await supabase.functions.invoke('meta-wa-templates', { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'שליפת התבניות נכשלה');
      return (data.templates ?? []) as MetaWaTemplate[];
    },
  });
}

/** Fill {{1}}, {{2}}… in a template body with the given parameter values. */
export function renderTemplateBody(body: string, params: string[]): string {
  return String(body ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, i) => params[Number(i) - 1] ?? `{{${i}}}`);
}
