import { describe, expect, it, vi } from 'vitest';
import { resolveIvrRecipient } from '../../supabase/functions/_shared/ivrRecipient';
describe('workspace IVR recipient resolution', () => {
  it('matches a local phone without creating a duplicate lead', async () => {
    const create = vi.fn();
    const lookup = vi.fn().mockResolvedValue({ id: 'existing', phone: '972501234567' });
    expect(await resolveIvrRecipient({ phone: '0501234567' }, lookup, create)).toEqual({ id: 'existing', phone: '+972501234567' });
    expect(create).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledWith(undefined, ['972501234567', '+972501234567', '0501234567']);
  });
  it('creates a workspace lead for a manually entered phone', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'new' });
    expect(await resolveIvrRecipient({ phone: '0501234567' }, async () => ({}), create)).toEqual({ id: 'new', phone: '+972501234567' });
    expect(create).toHaveBeenCalledWith('972501234567');
  });
  it('retains lookup and creation errors rather than missing lead id', async () => {
    const create = vi.fn();
    expect((await resolveIvrRecipient({ phone: '0501234567' }, async () => ({ error: 'denied' }), create)).error).toBe('lead_lookup_failed');
    expect(create).not.toHaveBeenCalled();
    expect((await resolveIvrRecipient({ phone: '0501234567' }, async () => ({}), async () => ({ error: 'denied' }))).error).toBe('lead_creation_failed');
  });
  it('never recreates a foreign-workspace selected lead', async () => {
    const create = vi.fn();
    expect((await resolveIvrRecipient({ id: 'foreign', phone: '0501234567' }, async () => ({}), create)).error).toBe('lead_not_in_workspace');
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects selected lead phone mismatch', async () => {
    expect((await resolveIvrRecipient({ id: 'selected', phone: '0501234567' }, async () => ({ id: 'selected', phone: '0507654321' }), vi.fn())).error).toBe('lead_phone_mismatch');
  });
  it('rejects invalid phones before accessing leads', async () => {
    const lookup = vi.fn();
    expect((await resolveIvrRecipient({ phone: '123' }, lookup, vi.fn())).error).toBe('invalid_phone');
    expect(lookup).not.toHaveBeenCalled();
  });
});