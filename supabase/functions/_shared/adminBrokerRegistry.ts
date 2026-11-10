import { BROKER_REGISTRY_DATASET, BROKER_REGISTRY_RESOURCE, BROKER_REGISTRY_SOURCE, exactRegistryRecord, registryDisplayName, registrySourceIsFresh } from './brokerRegistry.ts';

export async function checkAdminBrokerRegistry(license: string, name: string) {
  const get = async (url: URL) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('registry_unavailable');
    const body = await response.json();
    if (!body.success) throw new Error('registry_unavailable');
    return body.result;
  };
  try {
    const metaUrl = new URL('https://data.gov.il/api/3/action/package_show'); metaUrl.searchParams.set('id', BROKER_REGISTRY_DATASET);
    const search = new URL('https://data.gov.il/api/3/action/datastore_search');
    search.searchParams.set('resource_id', BROKER_REGISTRY_RESOURCE); search.searchParams.set('filters', JSON.stringify({ 'מס רשיון': Number(license) })); search.searchParams.set('limit', '2');
    const [meta, result] = await Promise.all([get(metaUrl), get(search)]);
    const updatedAt = meta.resources?.find((r: { id: string }) => r.id === BROKER_REGISTRY_RESOURCE)?.last_modified;
    if (meta.organization?.name !== 'ministry_of_justice' || !updatedAt || !registrySourceIsFresh(updatedAt)) throw new Error('registry_unavailable');
    const record = exactRegistryRecord(result.records ?? [], license);
    if (!record) return { valid: false, reason: 'not_found' };
    const rawName = String(record['שם המתווך']).trim();
    const tokens = (n: string) => n.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).sort().join(' ');
    if (tokens(name) !== tokens(rawName)) return { valid: false, reason: 'name_mismatch', holderName: registryDisplayName(rawName) };
    return { valid: true, holderName: registryDisplayName(rawName, name), rawName, city: String(record['עיר מגורים'] ?? '').trim(), updatedAt, source: BROKER_REGISTRY_SOURCE };
  } catch { return { valid: false, reason: 'unavailable' }; }
}