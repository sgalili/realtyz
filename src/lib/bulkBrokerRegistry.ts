export type RegistryTarget = { user_id: string; full_name?: string; is_developer?: boolean; license_verified?: boolean; profile_license?: string | null; license_number?: string | null };
export const registryLicense = (row: RegistryTarget) => row.profile_license?.trim() || row.license_number?.trim() || '';
export const redWaitingBrokers = (rows: RegistryTarget[]) => [...new Map(rows.filter(row => !row.is_developer && !row.license_verified).map(row => [row.user_id, row])).values()];
export type RegistryProgress = { total: number; done: number; verified: number; failed: number; missing: number; name?: string };

/** One existing server-authorized check at a time; stop starting calls when the admin scope changes. */
export async function recheckRedBrokers(rows: RegistryTarget[], check: (row: RegistryTarget, license: string) => Promise<boolean>, progress: (value: RegistryProgress) => void, current: () => boolean) {
  const targets = redWaitingBrokers(rows);
  const state: RegistryProgress = { total: targets.length, done: 0, verified: 0, failed: 0, missing: 0 };
  for (const target of targets) {
    if (!current()) return null;
    state.name = target.full_name;
    progress({ ...state });
    const license = registryLicense(target);
    if (!/^[1-9][0-9]{0,9}$/.test(license)) state.missing++;
    else {
      try { if (await check(target, license)) state.verified++; else state.failed++; }
      catch { state.failed++; }
    }
    if (!current()) return null;
    state.done++;
    progress({ ...state });
  }
  return state;
}