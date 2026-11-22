export type ImportHistoryIdentity = {
  id: string;
  kind: 'broker' | 'developer';
  workspace_owner_id?: string | null;
  public_user_id?: string | null;
  source_url?: string | null;
  status?: string;
};
type Broker = { broker_id?: string; listing_urls?: string[] };
export type ImportActivityJob = {
  id: string;
  status: string;
  stage: string;
  brokers_done?: number;
  developers_done?: number | null;
  target_brokers?: number;
  checkpoint?: unknown;
};
type Checkpoint = {
  execution?: string;
  phase?: string;
  activeBroker?: Broker | null;
  workerEnrichment?: Broker[];
  workerEnrichedIds?: string[];
  workerListingDoneUrls?: string[] | null;
  brokerId?: string;
  externalPendingDeveloper?: { owner?: string; source_url?: string } | null;
  workerDeveloper?: { url?: string } | null;
  developerWork?: { accountId?: string; url?: string } | null;
  developerResults?: { source_url?: string; status?: string }[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identity comes from a persisted active checkpoint, never from a name or the history's blanket job status. */
export function activeImportHistoryIds(items: ImportHistoryIdentity[], jobs: ImportActivityJob[] | undefined): Set<string> {
  const active = new Set<string>();
  const job = jobs?.[0];
  if (job?.status === 'running') {
    const c = (job.checkpoint ?? {}) as Checkpoint;
    const finishedBrokers = new Set(c.workerEnrichedIds ?? []);
    const brokerFinished = (broker: Broker) => Boolean(broker.broker_id && finishedBrokers.has(broker.broker_id));
    const currentUrls = c.activeBroker?.listing_urls;
    const allCurrentSaved = Boolean(currentUrls?.length && currentUrls.every(url => c.workerListingDoneUrls?.includes(url)));
    const explicitBroker = c.activeBroker && !brokerFinished(c.activeBroker) && !allCurrentSaved ? c.activeBroker.broker_id : undefined;
    const inventoryStage = job.stage === 'importing' || c.phase === 'importing';
    const identitiesDone = job.target_brokers !== undefined && (job.brokers_done ?? 0) + (job.developers_done ?? 0) >= job.target_brokers;
    const queuedBroker = (inventoryStage || identitiesDone) ? c.workerEnrichment?.find(b => !brokerFinished(b) && b.broker_id !== c.activeBroker?.broker_id)?.broker_id : undefined;
    const brokerId = explicitBroker ?? (c.execution === 'external' ? queuedBroker : inventoryStage ? c.brokerId : undefined);
    const developer = c.externalPendingDeveloper;
    const developerOwner = developer?.owner ?? c.developerWork?.accountId;
    const developerUrl = developer?.source_url ?? c.workerDeveloper?.url ?? c.developerWork?.url;
    const developerFinished = Boolean(developerUrl && c.developerResults?.some(r => r.source_url === developerUrl && r.status !== 'running' && r.status !== 'pending'));
    const match = brokerId ? items.find(i => i.kind === 'broker' && (i.workspace_owner_id === brokerId || i.public_user_id === brokerId))
      : !developerFinished && (developerOwner || developerUrl) ? items.find(i => i.kind === 'developer' && (developerOwner ? i.workspace_owner_id === developerOwner || i.public_user_id === developerOwner : i.source_url === developerUrl)) : undefined;
    if (match) active.add(match.id);
  }
  // Standalone developer jobs have their own exact job ID (not a batch-history row ID).
  for (const item of items) if (item.kind === 'developer' && UUID.test(item.id) && item.status === 'running') active.add(item.id);
  return active;
}