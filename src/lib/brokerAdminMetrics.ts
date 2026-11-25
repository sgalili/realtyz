export type WaitingLicense = { is_developer?: boolean; license_verified?: boolean; registry_no_match?: boolean; profile_license?: string | null; license_number?: string | null };
export function pendingRedLicenses(rows: WaitingLicense[] | null | undefined): number {
  return (rows ?? []).filter(row => !row.is_developer && !row.license_verified && !row.registry_no_match && !!(row.profile_license?.trim() || row.license_number?.trim())).length;
}
export function importEntityProgress(jobs: { status: string; checkpoint: unknown; brokers_done?: number | null; developers_done?: number | null; target_brokers?: number | null }[] | undefined) {
  const job = jobs?.find(row => row.status === 'running' || row.status === 'pending' || row.status === 'paused');
  const c = job?.checkpoint as { brokerIndex?: number; developerIndex?: number; totalBrokerUrls?: number; totalDeveloperUrls?: number; brokers?: unknown[]; developerUrls?: unknown[] } | undefined;
  if (!c) return null;
  if (job?.target_brokers != null) return { done: (job.brokers_done ?? 0) + (job.developers_done ?? 0), total: job.target_brokers };
  return { done: (c.brokerIndex ?? 0) + (c.developerIndex ?? 0), total: (c.totalBrokerUrls ?? c.brokers?.length ?? 0) + (c.totalDeveloperUrls ?? c.developerUrls?.length ?? 0) };
}