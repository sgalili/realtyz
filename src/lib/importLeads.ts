import { supabase } from '@/integrations/supabase/client';

/** PostgREST cannot express a partial expression-index conflict target. */
export async function importLeadBatch(rows: Record<string, unknown>[]) {
  return supabase.rpc('import_crm_leads', { _rows: rows as never });
}