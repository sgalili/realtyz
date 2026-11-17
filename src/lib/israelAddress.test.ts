import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatOfficeAddress, ISRAEL_SETTLEMENTS_RESOURCE, ISRAEL_STREETS_RESOURCE, parseOfficeAddress, searchNationalCities, searchNationalStreets } from './israelAddress';

afterEach(() => vi.unstubAllGlobals());

describe('national agency address helpers', () => {
  it('separates an existing street and numeric house number without inventing data', () => {
    expect(parseOfficeAddress('ארלוזורוב 12')).toEqual({ street: 'ארלוזורוב', houseNumber: '12' });
    expect(parseOfficeAddress('רחוב ללא מספר')).toEqual({ street: 'רחוב ללא מספר', houseNumber: '' });
    expect(formatOfficeAddress('ארלוזורוב', '12')).toBe('ארלוזורוב 12');
  });

  it('requests and returns the complete official settlement list when no search is entered', async () => {
    const records = [
      { 'סמל_ישוב': '5000', 'שם_ישוב': 'תל אביב - יפו' },
      { 'סמל_ישוב': '3000', 'שם_ישוב': 'ירושלים' },
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { records } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchNationalCities('')).resolves.toEqual([{ code: '5000', name: 'תל אביב - יפו' }, { code: '3000', name: 'ירושלים' }]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('resource_id')).toBe(ISRAEL_SETTLEMENTS_RESOURCE);
    expect(url.searchParams.get('limit')).toBe('10000');
    expect(url.searchParams.has('q')).toBe(false);
  });

  it('queries the official streets resource with the selected settlement code and typed street', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { records: [{ 'סמל_רחוב': 934, 'שם_רחוב': 'ארלוזורוב' }] } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchNationalStreets('5000', 'ארלוזורוב')).resolves.toEqual([{ code: '934', name: 'ארלוזורוב' }]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('resource_id')).toBe(ISRAEL_STREETS_RESOURCE);
    expect(url.searchParams.get('filters')).toBe(JSON.stringify({ 'סמל_ישוב': '5000' }));
    expect(url.searchParams.get('q')).toBe('ארלוזורוב');
  });
});
