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

/**
 * Ordered, unique placeholder keys in a template body. Meta templates use
 * either positional ({{1}}) or named ({{first_name}}) variables.
 */
export function templateVariableKeys(body: string): string[] {
  const keys: string[] = [];
  for (const m of String(body ?? '').matchAll(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g)) {
    const key = m[1].trim();
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Fill {{1}} / {{first_name}} in a template body with the given values. */
export function renderTemplateBody(body: string, params: string[]): string {
  const keys = templateVariableKeys(body);
  return String(body ?? '').replace(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g, (m, k) => {
    const idx = keys.indexOf(String(k).trim());
    return params[idx] || m;
  });
}

/**
 * Builds the Meta `components` array for a template send. Named templates must
 * carry `parameter_name` for each value; positional ones must not.
 */
export function buildTemplateComponents(body: string, params: string[]): unknown[] {
  const keys = templateVariableKeys(body);
  if (keys.length === 0) return [];
  const parameters = keys.map((key, i) => {
    const text = params[i] ?? '';
    return /^\d+$/.test(key)
      ? { type: 'text', text }
      : { type: 'text', parameter_name: key, text };
  });
  return [{ type: 'body', parameters }];
}

