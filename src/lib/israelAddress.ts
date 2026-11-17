const DATASTORE_URL = 'https://data.gov.il/api/3/action/datastore_search';
export const ISRAEL_SETTLEMENTS_RESOURCE = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba';
export const ISRAEL_STREETS_RESOURCE = '9ad3862c-8391-4b2f-84a4-2d4c68625f4b';

export type NationalLocality = { code: string; name: string };

async function nationalRecords(resourceId: string, params: URLSearchParams, signal?: AbortSignal, limit = 15): Promise<Record<string, unknown>[]> {
  params.set('resource_id', resourceId);
  params.set('limit', String(limit));
  const response = await fetch(`${DATASTORE_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`national_address_${response.status}`);
  const payload = await response.json() as { success?: boolean; result?: { records?: Record<string, unknown>[] } };
  if (!payload.success || !Array.isArray(payload.result?.records)) throw new Error('national_address_response');
  return payload.result.records;
}

export async function searchNationalCities(query: string, signal?: AbortSignal): Promise<NationalLocality[]> {
  const params = new URLSearchParams();
  const q = query.trim();
  if (q) params.set('q', q);
  const records = await nationalRecords(ISRAEL_SETTLEMENTS_RESOURCE, params, signal, 10000);
  return records.map(record => ({ code: String(record['סמל_ישוב'] ?? '').trim(), name: String(record['שם_ישוב'] ?? '').trim() }))
    .filter(locality => locality.code && locality.name);
}

export async function searchNationalStreets(cityCode: string, query: string, signal?: AbortSignal): Promise<NationalLocality[]> {
  if (!/^\d+$/.test(cityCode)) return [];
  const params = new URLSearchParams({ filters: JSON.stringify({ 'סמל_ישוב': String(Number(cityCode)) }) });
  const q = query.trim();
  if (q) params.set('q', q);
  const records = await nationalRecords(ISRAEL_STREETS_RESOURCE, params, signal);
  const unique = new Map<string, NationalLocality>();
  for (const record of records) {
    const code = String(record['סמל_רחוב'] ?? '').trim();
    const name = String(record['שם_רחוב'] ?? '').trim();
    if (code && name) unique.set(`${code}:${name}`, { code, name });
  }
  return [...unique.values()];
}

export function parseOfficeAddress(address: string): { street: string; houseNumber: string } {
  const normalized = address.trim();
  const match = normalized.match(/^(.*?)\s+(\d{1,5})$/);
  return match ? { street: match[1].trim(), houseNumber: match[2] } : { street: normalized, houseNumber: '' };
}

export function formatOfficeAddress(street: string, houseNumber: string): string {
  return [street.trim(), houseNumber.trim()].filter(Boolean).join(' ');
}
