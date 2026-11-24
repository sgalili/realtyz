import { describe, it, expect, vi } from 'vitest';
vi.mock('./adminImportPresentation', () => ({ discoveryInProgress: (s?: string) => s === 'running' }));
import { sortDiscoveryPriority } from './brokerDiscoveryPriority';
const rows = [{ user_id: 'p' }, { user_id: 'f', whatsapp_phone: '0501' }, { user_id: 'late' }, { user_id: 'soon' }];
const states = [{ broker_id: 'late', source_status: 'running', eta_at: '2026-01-02' }, { broker_id: 'soon', source_status: 'running', eta_at: '2026-01-01' }];
describe('discovery sort', () => {
  it('first click: in progress by shortest time, then found, then pending', () => {
    expect(sortDiscoveryPriority(rows, states, 'progress').map(r => r.user_id)).toEqual(['soon', 'late', 'f', 'p']);
  });
  it('second click: found first, then in progress, then pending', () => {
    expect(sortDiscoveryPriority(rows, states, 'found').map(r => r.user_id)).toEqual(['f', 'soon', 'late', 'p']);
  });
});
