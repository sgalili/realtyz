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

/** Cached (DB) approved templates — instant, zero Graph API calls. */
async function readCachedTemplates(): Promise<MetaWaTemplate[]> {
  const { data } = await supabase
    .from('wa_message_templates')
    .select('name, language, category, status, body_text, variable_count, has_header_variable')
    .eq('status', 'APPROVED')
    .order('name');
  return (data ?? []) as MetaWaTemplate[];
}

/**
 * Approved Meta WhatsApp message templates for the current workspace.
 * Reads the local cache first; only calls Meta when the cache is empty.
 */
export function useMetaWaTemplates(enabled = true) {
  return useQuery({
    queryKey: ['meta-wa-templates'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MetaWaTemplate[]> => {
      const cached = await readCachedTemplates();
      if (cached.length > 0) return cached;

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
