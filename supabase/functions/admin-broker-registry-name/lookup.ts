import { BROKER_REGISTRY_DATASET, BROKER_REGISTRY_RESOURCE, BROKER_REGISTRY_SOURCE, BROKER_REGISTRY_UNAVAILABLE, INVALID_BROKER_LICENSE, exactRegistryRecord, registrySourceIsFresh } from '../_shared/brokerRegistry.ts';

export class RegistryNameError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export async function fetchRegistryName(license: string, fetcher: typeof fetch = fetch) {
  const officialJson = async (url: URL) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error('registry_unavailable');
    const payload = await response.json();
    if (payload?.success !== true || !payload.result) throw new Error('registry_unavailable');
    return payload.result;
  };
  try {
    const metadataUrl = new URL('https://data.gov.il/api/3/action/package_show');
    metadataUrl.searchParams.set('id', BROKER_REGISTRY_DATASET);
    const search = new URL('https://data.gov.il/api/3/action/datastore_search');
    search.searchParams.set('resource_id', BROKER_REGISTRY_RESOURCE);
    search.searchParams.set('filters', JSON.stringify({ 'מס רשיון': Number(license) }));
    search.searchParams.set('limit', '2');
    const [metadata, result] = await Promise.all([officialJson(metadataUrl), officialJson(search)]);
    const updatedAt = metadata.resources?.find((item: { id: string }) => item.id === BROKER_REGISTRY_RESOURCE)?.last_modified;
    if (metadata.organization?.name !== 'ministry_of_justice' || !updatedAt || !registrySourceIsFresh(updatedAt) || !Array.isArray(result.records)) throw new Error('registry_unavailable');
    let record = exactRegistryRecord(result.records, license);
    if (!record) {
      search.searchParams.delete('filters'); search.searchParams.set('q', license); search.searchParams.set('limit', '20');
      record = exactRegistryRecord((await officialJson(search)).records ?? [], license);
    }
    if (!record) throw new RegistryNameError('license_not_found', INVALID_BROKER_LICENSE, 404);
    return { fullName: String(record['שם המתווך']).trim(), city: String(record['עיר מגורים'] ?? '').trim(), updatedAt, source: BROKER_REGISTRY_SOURCE };
  } catch (error) {
    if (error instanceof RegistryNameError) throw error;
    throw new RegistryNameError('registry_unavailable', BROKER_REGISTRY_UNAVAILABLE, 503);
  }
}

/** A lookup cannot assign a new identity/license or grant broker permissions. */
export function assertRegistryNameTarget(profile: { broker_license_number: string | null; locked_broker_name: string | null }, license: string, name?: string) {
  if (profile.broker_license_number !== license) throw new RegistryNameError('license_changed', 'מספר הרישיון אינו תואם לרישיון השמור בפרופיל. רעננו את הפרטים ונסו שוב.', 409);
  if (name && profile.locked_broker_name && profile.locked_broker_name !== name) throw new RegistryNameError('locked_identity_conflict', 'השם במאגר אינו תואם לזהות המאומתת הנעולה. לא שונו פרטי החשבון.', 409);
}