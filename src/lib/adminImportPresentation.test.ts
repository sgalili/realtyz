import { describe, expect, it } from 'vitest';
import { discoveryInProgress, emptyImportSearch, importRunTime, matchesImportSearch, newestImportsFirst } from './adminImportPresentation';

describe('import screen rules', () => {
  it.each(['pending_source', 'reading_source', 'ready', 'sending', 'awaiting_reply'])('blocks repeat discovery during %s', status => {
    expect(discoveryInProgress('not_found', status)).toBe(true);
  });
  it('allows discovery after a terminal scanner result', () => {
    expect(discoveryInProgress('not_found', 'failed')).toBe(false);
  });
  it('orders newly imported accounts before older accounts without mutating the input', () => {
    const rows = [{ id: 'old', created_at: '2026-11-22T12:00:00Z' }, { id: 'new', created_at: '2026-11-24T01:00:00Z' }];
    expect(newestImportsFirst(rows).map(row => row.id)).toEqual(['new', 'old']);
    expect(rows[0].id).toBe('old');
  });
  it('formats today and yesterday in Israel time', () => {
    const now = new Date('2026-11-24T02:00:00Z');
    expect(importRunTime('2026-11-24T01:00:00Z', now)).toBe('היום 03:00');
    expect(importRunTime('2026-11-23T19:52:00Z', now)).toBe('אתמול 21:52');
  });
  it('searches broker, developer and marketing identities by saved facts', () => {
    for (const kind of ['broker', 'developer', 'marketing']) {
      expect(matchesImportSearch({ full_name: 'ספיר', kind }, { ...emptyImportSearch, text: 'ספיר' })).toBe(true);
      expect(matchesImportSearch({ full_name: 'ספיר', kind }, { ...emptyImportSearch, text: 'לא קיים' })).toBe(false);
    }
  });
  it('filters the selected account type and saved WhatsApp presence', () => {
    const search = { ...emptyImportSearch, kind: 'broker', whatsapp: 'missing' };
    expect(matchesImportSearch({ kind: 'broker' }, search)).toBe(true);
    expect(matchesImportSearch({ kind: 'developer' }, search)).toBe(false);
    expect(matchesImportSearch({ kind: 'broker', whatsapp_phone: '972500000000' }, search)).toBe(false);
  });
});