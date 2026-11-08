import { expect, it, vi } from 'vitest';
import { assertRegistryNameTarget, fetchRegistryName } from '../../supabase/functions/admin-broker-registry-name/lookup';
import { BROKER_REGISTRY_RESOURCE } from '../../supabase/functions/_shared/brokerRegistry';

const metadata = { organization: { name: 'ministry_of_justice' }, resources: [{ id: BROKER_REGISTRY_RESOURCE, last_modified: new Date().toISOString() }] };
const json = (result: unknown) => ({ ok: true, json: async () => ({ success: true, result }) });
vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal });
it('fetches the exact entered official license and returns its full name', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: URL) => url.pathname.endsWith('package_show') ? json(metadata) : json({ records: [{ 'מס רשיון': 31927721, 'שם המתווך': 'אידלסון דולי' }] }));
  expect(await fetchRegistryName('31927721', fetcher)).toMatchObject({ fullName: 'דולי אידלסון', rawName: 'אידלסון דולי' });
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('filters')).toBe('{"מס רשיון":31927721}');
});
it('rejects unrelated search matches instead of updating the requested profile', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: URL) => url.pathname.endsWith('package_show') ? json(metadata) : json({ records: [{ 'מס רשיון': 31927722, 'שם המתווך': 'שם אחר' }] }));
  await expect(fetchRegistryName('31927721', fetcher)).rejects.toMatchObject({ code: 'license_not_found', status: 404 });
});
it('rejects stale or unofficial registry evidence', async () => {
  const fetcher = vi.fn().mockImplementation(async (url: URL) => url.pathname.endsWith('package_show') ? json({ ...metadata, organization: { name: 'other' } }) : json({ records: [] }));
  await expect(fetchRegistryName('31927721', fetcher)).rejects.toMatchObject({ code: 'registry_unavailable', status: 503 });
});
it('cannot change the license associated with the selected profile', () => {
  expect(() => assertRegistryNameTarget({ broker_license_number: '31927722', locked_broker_name: null }, '31927721')).toThrow(/אינו תואם/);
});
it('preserves verified locked identities rather than replacing them with a different registry name', () => {
  expect(() => assertRegistryNameTarget({ broker_license_number: '31927721', locked_broker_name: 'אידלסון דולי' }, '31927721', 'שם אחר')).toThrow(/זהות המאומתת/);
  expect(() => assertRegistryNameTarget({ broker_license_number: '31927721', locked_broker_name: 'אידלסון דולי' }, '31927721', 'אידלסון דולי')).not.toThrow();
});