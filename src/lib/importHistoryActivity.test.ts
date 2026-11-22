import { describe, expect, it } from 'vitest';
import { activeImportHistoryIds, type ImportActivityJob, type ImportHistoryIdentity } from './importHistoryActivity';

const a: ImportHistoryIdentity = { id: 'history-a', kind: 'broker', workspace_owner_id: 'broker-a', status: 'completed' };
const b: ImportHistoryIdentity = { id: 'history-b', kind: 'broker', workspace_owner_id: 'broker-b', status: 'running' };
const job = (checkpoint: unknown, status = 'running'): ImportActivityJob => ({ id: 'job', status, stage: 'importing', checkpoint });
describe('active inventory import identity', () => {
  it('follows the saved active broker even though history already calls its identity completed', () => {
    expect([...activeImportHistoryIds([a, b], [job({ execution: 'external', activeBroker: { broker_id: 'broker-a' } })])]).toEqual(['history-a']);
  });
  it('moves from A to B and removes all rings when the batch completes', () => {
    expect([...activeImportHistoryIds([a, b], [job({ execution: 'external', activeBroker: { broker_id: 'broker-b' }, workerEnrichedIds: ['broker-a'] })])]).toEqual(['history-b']);
    expect(activeImportHistoryIds([a, b], [job({ activeBroker: { broker_id: 'broker-b' } }, 'completed')]).size).toBe(0);
  });
  it('hands off between persisted checkpoints after every current source URL was saved', () => {
    expect([...activeImportHistoryIds([a, b], [job({ execution: 'external', activeBroker: { broker_id: 'broker-a', listing_urls: ['source-a'] }, workerListingDoneUrls: ['source-a'], workerEnrichment: [{ broker_id: 'broker-b' }] })])]).toEqual(['history-b']);
  });
  it('never animates paused, failed or pending jobs from blanket row statuses', () => {
    for (const status of ['paused', 'failed', 'pending']) expect(activeImportHistoryIds([a, b], [job({ activeBroker: { broker_id: 'broker-a' } }, status)]).size).toBe(0);
  });
  it('uses developer workspace identity and stops on a saved final result', () => {
    const d: ImportHistoryIdentity = { id: 'history-d', kind: 'developer', workspace_owner_id: 'owner-d', status: 'completed' };
    const c = { externalPendingDeveloper: { owner: 'owner-d', source_url: 'source-d' } };
    expect([...activeImportHistoryIds([a, d], [job(c)])]).toEqual(['history-d']);
    expect(activeImportHistoryIds([d], [job({ ...c, developerResults: [{ source_url: 'source-d', status: 'completed' }] })]).size).toBe(0);
  });
  it('matches unknown developer identities only through the exact current source URL', () => {
    const d: ImportHistoryIdentity = { id: 'history-d', kind: 'developer', source_url: 'source-d' };
    expect([...activeImportHistoryIds([d], [job({ workerDeveloper: { url: 'source-d' } })])]).toEqual(['history-d']);
    expect(activeImportHistoryIds([d], [job({ workerDeveloper: { url: 'other-source' } })]).size).toBe(0);
  });
  it('transfers developer activity after the first saved result without spinning both rows', () => {
    const first: ImportHistoryIdentity = { id: 'developer-row-1', kind: 'developer', workspace_owner_id: 'developer-owner-1' };
    const next: ImportHistoryIdentity = { id: 'developer-row-2', kind: 'developer', workspace_owner_id: 'developer-owner-2' };
    expect([...activeImportHistoryIds([first, next], [job({ externalPendingDeveloper: { owner: 'developer-owner-1', source_url: 'source-1' } })])]).toEqual(['developer-row-1']);
    expect([...activeImportHistoryIds([first, next], [job({ externalPendingDeveloper: { owner: 'developer-owner-2', source_url: 'source-2' }, developerResults: [{ source_url: 'source-1', status: 'completed' }] })])]).toEqual(['developer-row-2']);
  });
  it('honors the legacy broker cursor but never treats a scan as inventory loading', () => {
    expect([...activeImportHistoryIds([a], [job({ brokerId: 'broker-a', phase: 'importing' })])]).toEqual(['history-a']);
    expect(activeImportHistoryIds([a], [{ ...job({ brokerId: 'broker-a' }), stage: 'scanning' }]).size).toBe(0);
  });
  it('keeps standalone developer jobs separate from pending batch rows', () => {
    const d: ImportHistoryIdentity = { id: '00000000-0000-0000-0000-000000000001', kind: 'developer', status: 'running' };
    expect([...activeImportHistoryIds([d, { ...d, id: 'batch:pending' }], [])]).toEqual([d.id]);
  });
});