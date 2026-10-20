import { describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: [{ id: 'lead' }], error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { importLeadBatch } from './importLeads';
describe('CRM import transport', () => {
  it('uses the expression-index-aware RPC for CSV and JSON batches', async () => {
    const rows = [{ phone_number: '972501234567', assigned_to: 'workspace' }];
    const result = await importLeadBatch(rows);
    expect(rpc).toHaveBeenCalledWith('import_crm_leads', { _rows: rows });
    expect(result.data).toEqual([{ id: 'lead' }]);
  });
});