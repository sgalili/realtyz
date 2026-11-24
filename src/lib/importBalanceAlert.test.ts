import { describe, it, expect, vi, afterEach } from 'vitest';
import { alertImportBalance } from '../../supabase/functions/_shared/importBalanceAlert';

afterEach(() => vi.unstubAllGlobals());
describe('import balance alert dispatch', () => {
  it('claims before sending, targets only the Super Admin, and forces the official sender', async () => {
    const calls: string[] = [];
    const admin = {
      rpc: vi.fn(async () => { calls.push('claim'); return { data: true, error: null }; }),
      from: (table: string) => {
        const builder: any = {};
        for (const method of ['select','eq','insert','update']) builder[method] = () => builder;
        builder.maybeSingle = async () => ({ data: { phone: '972500000000' }, error: null });
        builder.single = async () => ({ data: { id: 'notification' }, error: null });
        builder.then = (resolve: (value: unknown) => void) => resolve({ data: table === 'user_roles' ? [{ user_id: 'admin' }] : null, error: null });
        return builder;
      },
    };
    vi.stubGlobal('Deno', { env: { get: () => 'test-config' } });
    const send = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push('send');
      const payload = JSON.parse(String(init.body));
      expect(payload.force_official).toBe(true);
      expect(payload.tenant_id).toBe('admin');
      expect(payload.phone_number).toBe('972500000000');
      return new Response(JSON.stringify({ success: true, message_id: 'accepted-provider-id' }));
    });
    vi.stubGlobal('fetch', send);
    await alertImportBalance(admin as never, 'job', 402, 'Bright Data insufficient credits');
    expect(calls).toEqual(['claim','send']);
    expect(send).toHaveBeenCalledTimes(1);
    admin.rpc.mockResolvedValue({ data: false, error: null });
    await alertImportBalance(admin as never, 'other-job', 402, 'Bright Data insufficient credits');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not alert for an unrelated rate limit or generic suspension', async () => {
    const rpc = vi.fn();
    await alertImportBalance({ rpc } as never, 'job', 429, 'Bright Data rate limit exceeded');
    await alertImportBalance({ rpc } as never, 'job', 407, 'Bright Data account suspended client_10020');
    expect(rpc).not.toHaveBeenCalled();
  });
});