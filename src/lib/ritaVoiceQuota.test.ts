import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireRitaStartupBalance } from './ritaVoiceQuota.server';

afterEach(() => vi.unstubAllGlobals());
describe('Rita startup credit guard', () => {
  it('rejects the observed 87872/87876 balance without enabled usage extension', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ character_count: 87872, character_limit: 87876, can_extend_character_limit: false })));
    await expect(requireRitaStartupBalance('test-key')).rejects.toThrow('4 קרדיטים');
  });
  it('permits the minimum observed five-credit startup floor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ character_count: 87871, character_limit: 87876, can_extend_character_limit: false })));
    await expect(requireRitaStartupBalance('test-key')).resolves.toBeUndefined();
  });
  it('permits low balance only when the provider says usage extension is enabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ character_count: 87876, character_limit: 87876, can_extend_character_limit: true })));
    await expect(requireRitaStartupBalance('test-key')).resolves.toBeUndefined();
  });
  it('fails closed on an unverifiable balance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
    await expect(requireRitaStartupBalance('test-key')).rejects.toThrow();
  });
});